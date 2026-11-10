// The checks that compare the two embeddings of the preview (WebContentsView
// and <iframe>). Run from the main process with SPIKE_SELFTEST=embed; the same
// code runs in both, so the two result files can be read side by side.
//
// Input is injected (see `injector` in index.ts): it goes through the engine's
// own input pipeline (hit testing, routing to the right frame, focus), but it
// is not a person's pointer moving across the screen.
import {
  BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
  type WebContentsView,
  type WebFrameMain,
} from "electron";
import { execFile } from "node:child_process";
import type { EventEmitter } from "node:events";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export type Preview = {
  embed: "view" | "iframe";
  /** The web contents that input and DevTools commands for the preview go through. */
  contents: WebContents;
  /** Where the preview's top-left corner is inside those web contents, in CSS pixels. */
  origin(): { x: number; y: number };
  size(): { width: number; height: number };
  frame(): WebFrameMain | null;
  send(message: unknown): void;
  owns(event: IpcMainEvent | IpcMainInvokeEvent): boolean;
  /** Runs code in the page's own world, as a script of the page would. */
  pageWorld(code: string, userGesture?: boolean): Promise<any>;
  load(url: string, sandboxed?: boolean): Promise<void>;
};

export type Injector = {
  how: string;
  move(x: number, y: number, held?: boolean): Promise<unknown>;
  down(x: number, y: number, clickCount?: number): Promise<unknown>;
  up(x: number, y: number, clickCount?: number): Promise<unknown>;
  text(text: string): Promise<unknown>;
  key(key: string, meta?: boolean): Promise<unknown>;
};

export type Context = {
  embed: "view" | "iframe";
  url: string;
  win: BrowserWindow;
  view: WebContentsView | null;
  preview: Preview;
  previewEvents: EventEmitter;
  guards: {
    topNavigations: unknown[];
    frameNavigations: { url: string; isMainFrame: boolean }[];
    windowOpens: string[];
    previewSelfNavigations: string[];
    holdPreview: boolean;
    gone: unknown[];
    unresponsive: string[];
  };
  preloadRuns: unknown[];
  refused: unknown[];
  out: { mark(name: string): void; save(name: string, data: unknown): void };
  outDir(): string;
  capture(how?: string, name?: string): Promise<any>;
  captureMethodNames: string[];
  windowShot(name: string): Promise<string>;
  /** The overlay-view experiment, when it is on. */
  overlay: {
    view: WebContentsView;
    show(anchor: { x: number; y: number; w: number; h: number }, modal: boolean): Promise<number | null>;
    hide(): void;
  } | null;
  /** Input aimed at the window's own web contents. */
  windowInput: Injector;
  /** Input aimed at the web contents the preview is in (the window's, for the iframe). */
  previewInput: Injector;
  realInput(): Promise<unknown>;
  protocolDrag(): Promise<unknown>;
  loadInterface(): Promise<void>;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runEmbedChecks(c: Context) {
  const { win, view, preview, guards } = c;
  const framed = c.embed === "iframe";
  const home = `${c.url}?delay=0`;
  const results: Record<string, unknown> = {
    embedding: framed ? "<iframe>" : "WebContentsView",
    startedAt: new Date().toISOString(),
  };

  // Everything the editing script reports while the checks run.
  const events: any[] = [];
  c.previewEvents.on("event", (message) => events.push(message));
  const since = (from: number) => events.slice(from);
  const waitFor = async (type: string, { from = events.length, timeout = 4000, where = (_: any) => true } = {}) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      const found = events.slice(from).find((e) => e.type === type && where(e));
      if (found) return found;
      if (Date.now() > deadline) return null;
      await wait(20);
    }
  };
  const ask = async (message: { type: string; [key: string]: unknown }, reply: string, timeout = 3000) => {
    const from = events.length;
    preview.send(message);
    return waitFor(reply, { from, timeout });
  };

  const ui = (code: string) => win.webContents.executeJavaScript(code, true);
  const interfacePid = () => win.webContents.mainFrame.osProcessId;
  const page = (code: string, gesture = false) => preview.pageWorld(code, gesture);
  const measure = () => ask({ type: "measure" }, "measured");
  const mode = async (m: "edit" | "browse") => {
    preview.send({ type: "set-mode", mode: m });
    await wait(120);
  };

  // Input aimed at a point of the preview, in the preview's own coordinates.
  const input = c.previewInput;
  const at = (x: number, y: number) => ({ x: Math.round(preview.origin().x + x), y: Math.round(preview.origin().y + y) });
  const move = (x: number, y: number) => input.move(at(x, y).x, at(x, y).y);
  const click = async (x: number, y: number) => {
    const p = at(x, y);
    await input.move(p.x, p.y);
    await wait(60);
    await input.down(p.x, p.y);
    await input.up(p.x, p.y);
    await wait(150);
  };
  const type = async (text: string) => {
    await input.text(text);
    await wait(150);
  };
  // Where an element of the page is, scrolled into view first.
  const locate = async (selector: string) => {
    await page(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: "center" })`);
    await wait(150);
    const rect = (await ask({ type: "locate", selector }, "located"))?.rect;
    return rect ? { ...rect, cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 } : null;
  };

  const load = async (url: string, sandboxed = true, patient = true) => {
    const from = events.length;
    await preview.load(url, sandboxed);
    // A page that tries to navigate away while it loads may never finish
    // loading; the editing script being there is then enough to go on.
    const loaded =
      (await waitFor("loaded", { from, timeout: patient ? 10_000 : 3000 })) ?? (await waitFor("editor-ready", { from, timeout: 200 }));
    await wait(250);
    return loaded;
  };

  // SPIKE_ONLY=frames,cookies runs only those steps.
  const only = process.env.SPIKE_ONLY?.split(",");
  const step = async (name: string, run: () => Promise<unknown>) => {
    if (only && !only.includes(name)) return;
    const started = Date.now();
    try {
      results[name] = await run();
    } catch (error: any) {
      results[name] = { error: String(error?.stack ?? error) };
    }
    console.log(`[embed-checks] ${name}: ${Date.now() - started} ms`);
    c.out.save("embed-checks", results);
    c.out.mark(`embed-${name}`);
  };

  const describeFrame = (frame: WebFrameMain | null) =>
    frame && {
      url: frame.url,
      origin: frame.origin,
      osProcessId: frame.osProcessId,
      visibilityState: frame.visibilityState,
    };

  // --- 1. where the preview runs -------------------------------------------------
  await step("frames", async () => {
    const top = win.webContents.mainFrame;
    const frame = preview.frame();
    return {
      interface: describeFrame(top),
      preview: describeFrame(frame),
      previewRunsInAProcessOfItsOwn: !!frame && frame.osProcessId !== top.osProcessId,
      framesInTheWindow: top.framesInSubtree.length,
      preloadRanInSubFrames: c.preloadRuns,
    };
  });

  // --- 2. isolation of the editing script, and what the page can see ------------
  await step("isolation", async () => {
    const from = events.length;
    const loaded = await load(home);
    const probe = framed ? await waitFor("interface-channel-probe", { from, timeout: 3000 }) : null;
    const pageSees = await page(`(() => {
      const t = (f) => { try { return String(f()); } catch (e) { return e.name + ": " + e.message; } };
      return {
        nodeAndIpc: [typeof require, typeof process, typeof electronIpc, typeof ipcRenderer].join(" / "),
        editingScriptsGlobal: typeof __upstartEditor,
        pageIsFramed: window.top !== window,
        readParentDocument: t(() => "read: " + parent.document.title),
        readParentBridge: t(() => "typeof parent.electronIpc: " + typeof parent.electronIpc),
        readTopAddress: t(() => "read: " + top.location.href),
        ancestorOrigins: t(() => Array.from(location.ancestorOrigins).join(", ") || "(none)"),
        localStorage: t(() => { localStorage.setItem("k", "v"); return localStorage.getItem("k"); }),
      };
    })()`);
    return {
      editingScriptProbes: loaded?.probes ?? null,
      pageSees,
      // The preview frame's preload asked for an interface-only channel.
      interfaceChannelAskedFromThePreviewFrame: probe ? { answered: probe.answered, refusal: probe.refusal } : "not applicable",
      messagesRefusedBecauseOfTheirSender: c.refused,
    };
  });

  // --- 3. cookies the project's own server sets ---------------------------------
  await step("cookies", async () => {
    const ses = preview.contents.session;
    await ses.clearStorageData({ storages: ["cookies"] });
    await load(home);
    const seenByThePage = await page(`fetch("/cookie/set")
      .then(() => { document.cookie = "up_js=1; path=/"; return fetch("/cookie/echo"); })
      .then((r) => r.json())
      .then((j) => ({ sentBackToTheServer: j.cookie || "(none)", documentCookie: document.cookie || "(none)" }))`);
    const stored = (await ses.cookies.get({ url: c.url })).map((k) => `${k.name} (${k.sameSite})`);
    return { serverSet: "up_default, up_lax, up_strict, up_none (SameSite=None; Secure); the page set up_js", ...seenByThePage, storedInTheSession: stored };
  });

  // --- 4. editing with injected input (criterion 2) ------------------------------
  await step("editing", async () => {
    await load(home);
    return c.realInput();
  });

  // --- 7. what the interface draws over the preview ------------------------------
  await step("overlay", async () => {
    await load(home);
    await ui(`document.querySelector('[data-testid="tour-toggle"]').click()`);
    await wait(500);
    const tip = await ui(`window.__spike.rectOf('[data-testid="tour-tip"]')`);
    if (!tip) return { error: "the bubble did not appear" };
    const o = preview.origin();
    const p = framed ? o : (view!.getBounds() as { x: number; y: number });
    const s = preview.size();
    const insideThePreviewsPlace = tip.x >= p.x && tip.y >= p.y && tip.x + tip.width <= p.x + s.width && tip.y + tip.height <= p.y + s.height;
    const picture = await c.windowShot("bubble-over-the-preview");
    const screen = await screenCapture(win, join(c.outDir(), `electron-${c.embed}-screen-bubble-over-the-preview.png`));
    // A click on the bubble's button, injected at that point of the window.
    const ok = await ui(`window.__spike.rectOf('[data-testid="tour-ok"]')`);
    const from = events.length;
    const x = Math.round(ok.x + ok.width / 2);
    const y = Math.round(ok.y + ok.height / 2);
    await c.windowInput.move(x, y);
    await wait(60);
    await c.windowInput.down(x, y);
    await c.windowInput.up(x, y);
    await wait(300);
    const closed = await ui(`!document.querySelector('[data-testid="tour"]')`);
    return {
      bubble: tip,
      bubbleIsInsideThePreviewsPlace: insideThePreviewsPlace,
      pictureOfTheWindowsOwnWebContents: picture,
      pictureOfTheScreen: screen,
      clickOnTheBubblesButton: framed
        ? { reachedTheInterface: closed, reachedThePage: since(from).some((e) => e.type === "click") }
        : "not meaningful here: injected input goes to the window's web contents whatever is laid over it",
    };
  });

  // --- 7b. the overlay-view experiment: a transparent view over the preview --------
  await step("overlayView", async () => {
    if (!c.overlay || !view) return { notRun: "SPIKE_OVERLAY is off, or the preview is an iframe" };
    const o = c.overlay;
    await load(home);
    const focus = async () => ({
      window: win.webContents.isFocused(),
      preview: view.webContents.isFocused(),
      overlay: o.view.webContents.isFocused(),
      interfaceDocumentHasFocus: await ui(`document.hasFocus()`),
    });
    win.show();
    win.focus();
    await ui(`document.querySelector("textarea").focus()`);
    win.webContents.focus();
    await wait(300);
    const focusBefore = await focus();
    const h1 = await locate("h1");
    if (!h1) return { error: "the title was not located" };
    const b = view.getBounds();
    const anchor = { x: b.x + h1.x, y: b.y + h1.y, w: h1.width, h: h1.height };
    // The kind that dims the whole window.
    const modalShownInMs = await o.show(anchor, true);
    await wait(500);
    const focusWhileShown = await focus();
    const modalScreen = await screenCapture(win, join(c.outDir(), "electron-overlay-view-bubble-screen.png"));
    const withIt = await c.capture("devtools", "overlay-shown");
    o.hide();
    await wait(300);
    const withoutIt = await c.capture("devtools", "overlay-hidden");
    // The kind that is only as large as its box, hung under a button of the header.
    const button = await ui(`window.__spike.rectOf('[data-testid="menu-toggle"]')`);
    const menuShownInMs = await o.show({ x: button.x, y: button.y, w: button.width, h: button.height }, false);
    await wait(500);
    const menuBounds = o.view.getBounds();
    const menuScreen = await screenCapture(win, join(c.outDir(), "electron-overlay-view-menu-screen.png"));
    // Shown a few more times: how long until its page has drawn.
    const times: number[] = [];
    for (let i = 0; i < 8; i++) {
      o.hide();
      await wait(120);
      const ms = await o.show(anchor, i % 2 === 0);
      if (ms != null) times.push(ms);
      await wait(120);
    }
    o.hide();
    const pid = o.view.webContents.getOSProcessId();
    return {
      focusBefore,
      focusWhileTheBubbleIsShown: focusWhileShown,
      bubbleThatDimsTheWindow: { shownInMs: modalShownInMs, pictureOfTheScreen: modalScreen },
      boxUnderAHeaderButton: { shownInMs: menuShownInMs, viewBounds: menuBounds, previewStartsAtY: b.y, pictureOfTheScreen: menuScreen },
      shownAgainInMs: times,
      captureOfThePreview: {
        whileTheBubbleIsShown: withIt.picture,
        withoutIt: withoutIt.picture,
        samePicture: JSON.stringify(withIt.picture) === JSON.stringify(withoutIt.picture) && withIt.bytes === withoutIt.bytes,
      },
      overlayProcessId: pid,
    };
  });

  // --- 8. responsive view ---------------------------------------------------------
  await step("responsive", async () => {
    await load(home);
    const widths: Record<string, unknown> = {};
    for (const w of ["full", "768", "390"]) {
      await ui(`document.querySelector('[data-width="${w}"]').click()`);
      await wait(500);
      const m = await measure();
      widths[w] = m && { innerWidth: m.innerWidth, innerHeight: m.innerHeight, mdBreakpoint: m.mdUp, lgBreakpoint: m.lgUp, devicePixelRatio: m.devicePixelRatio };
      if (w === "390") widths["390 picture"] = (await c.capture("devtools", "responsive-390")).file;
    }
    await ui(`document.querySelector('[data-width="full"]').click()`);
    await wait(400);

    // Zoomed out to half size: a CSS transform for the iframe, the zoom factor for the view.
    const scale = 0.5;
    if (framed) await ui(`window.__spike.setScale(${scale})`);
    else view!.webContents.setZoomFactor(scale);
    await wait(600);
    const m = await measure();
    const h1 = await locate("h1");
    const from = events.length;
    if (h1) await move(h1.cx * scale, h1.cy * scale);
    await wait(300);
    const hover = since(from)
      .filter((e) => e.type === "hover")
      .pop();
    const picture = (await c.capture("devtools", "zoomed-out")).file;
    if (framed) await ui(`window.__spike.setScale(null)`);
    else view!.webContents.setZoomFactor(1);
    await wait(300);
    return {
      widths,
      zoomedOutToHalf: {
        how: framed ? "CSS transform: scale(0.5) on the iframe" : "webContents.setZoomFactor(0.5) on the view",
        innerWidth: m?.innerWidth,
        devicePixelRatio: m?.devicePixelRatio,
        pointerAimedAtTheTitleHovered: hover ? hover.element.tag : null,
        picture,
      },
    };
  });

  // --- 9. cost of the embedding ----------------------------------------------------
  await step("performance", async () => {
    await load(home);
    const roundTrips = await ui(`window.__spike.pings(50)`);
    const visibility = (await measure())?.visibility;
    const alone = await ask({ type: "frames", ms: 1500, scroll: true, id: "alone" }, "frames-done", 5000);
    // The same scroll while the interface's own thread is kept busy for 700 ms.
    const from = events.length;
    preview.send({ type: "frames", ms: 1500, scroll: true, id: "busy" });
    await wait(300);
    await ui(`window.__spike.block(700)`);
    const busy = await waitFor("frames-done", { from, timeout: 5000 });
    const brief = (f: any) => f && { frames: f.frames, ms: f.ms, longestGapMs: f.longestGapMs };
    return {
      pageVisibility: visibility,
      roundTripInterfaceToEditingScriptAndBack: roundTrips,
      scrollingThePage: brief(alone),
      scrollingWhileTheInterfaceIsBusyFor700ms: brief(busy),
    };
  });

  // --- 10. htmx and moving from page to page inside the preview -------------------
  await step("navigation", async () => {
    await load(home);
    await mode("browse");
    const bootId = await ui(`window.__spike.bootId`);
    const topUrl = win.webContents.getURL();
    guards.frameNavigations.length = 0;

    // htmx: a button that fetches a fragment, then a form posted in place.
    const before = await page(`document.querySelectorAll("#voices-list figure").length`);
    const more = await locate("[hx-get]");
    if (more) await click(more.cx, more.cy);
    await wait(900);
    const after = await page(`document.querySelectorAll("#voices-list figure").length`);
    const field = await locate('input[name="email"]');
    if (field) await click(field.cx, field.cy);
    await type("maker@example.com");
    const submit = await locate('form[hx-post] button[type="submit"]');
    if (submit) await click(submit.cx, submit.cy);
    await wait(900);
    const answer = await page(`document.getElementById("join-result").textContent.trim()`);
    const alive = await ask({ type: "ping", echo: "after-htmx" }, "pong", 1500);

    // Another page of the project, then back.
    const history = preview.contents.navigationHistory;
    const entriesBefore = history.length();
    let from = events.length;
    await page(`location.assign("/about")`).catch(() => {});
    const about = await waitFor("editor-ready", { from, timeout: 5000 });
    await waitFor("loaded", { from, timeout: 5000 });
    const entriesAfter = history.length();
    const canGoBack = history.canGoBack();
    await mode("browse");
    const link = await locate("#back-home");
    from = events.length;
    if (link) await click(link.cx, link.cy);
    const homeAgain = await waitFor("editor-ready", { from, timeout: 5000 });
    await waitFor("loaded", { from, timeout: 5000 });
    from = events.length;
    history.goBack();
    const wentBack = await waitFor("editor-ready", { from, timeout: 5000 });
    await waitFor("loaded", { from, timeout: 5000 });
    return {
      htmx: {
        voicesBeforeAndAfterTheButton: [before, after],
        formAnswer: answer,
        editingScriptStillAnswers: !!alive,
      },
      toAnotherPage: {
        editingScriptInjectedAgainOn: about?.href ?? null,
        linkClickedBackTo: homeAgain?.href ?? null,
        historyEntries: { before: entriesBefore, afterMovingToAbout: entriesAfter, canGoBack },
        historyBelongsTo: framed ? "the window (the interface and the preview share one history)" : "the preview's own web contents",
        goBackLedTo: wentBack?.href ?? null,
        interfaceUntouched: (await ui(`window.__spike.bootId`)) === bootId && win.webContents.getURL() === topUrl,
        frameNavigationsSeenByTheMainProcess: guards.frameNavigations.map((n) => n.url),
      },
    };
  });

  // --- 11. keyboard: who sees a key pressed while the preview has the focus -------
  await step("keyboard", async () => {
    await load(home);
    await mode("browse");
    preview.send({ type: "report-keys", on: true });
    const onWindow: string[] = [];
    const onView: string[] = [];
    const key = (list: string[]) => (_event: unknown, i: Electron.Input) => {
      if (i.type === "keyDown") list.push((i.meta ? "meta+" : "") + i.key);
    };
    const windowListener = key(onWindow);
    const viewListener = key(onView);
    win.webContents.on("before-input-event", windowListener);
    view?.webContents.on("before-input-event", viewListener);
    await ui(`window.__spike.keys.length = 0`);
    const field = await locate('input[name="email"]');
    win.show();
    win.focus();
    await wait(300);
    preview.contents.focus();
    if (field) await click(field.cx, field.cy);
    const from = events.length;
    await input.key("k", true);
    await wait(300);
    win.webContents.off("before-input-event", windowListener);
    view?.webContents.off("before-input-event", viewListener);
    preview.send({ type: "report-keys", on: false });
    return {
      focus: "in the page's e-mail field, after a click on it",
      pressed: "meta+k",
      inputInjectedWith: input.how,
      beforeInputEventOnTheWindow: onWindow,
      beforeInputEventOnThePreviewView: view ? onView : "not applicable",
      keydownSeenByTheInterfacesDocument: await ui(`window.__spike.keys`),
      keydownSeenByTheEditingScript: since(from)
        .filter((e) => e.type === "key")
        .map((e) => e.key),
    };
  });

  // --- 12. a page that misbehaves ---------------------------------------------------
  const hostile = (sandboxed: boolean) => async () => {
    guards.topNavigations.length = 0;
    guards.windowOpens.length = 0;
    guards.previewSelfNavigations.length = 0;
    guards.holdPreview = true;
    const bootId = await ui(`window.__spike.bootId`);
    const topUrl = win.webContents.getURL();
    // The window is brought to the front: what a page can do to the keyboard
    // focus only shows in a window that has it.
    win.show();
    win.focus();
    await wait(300);
    const whoHasTheKeyboard = async () => ({
      ...(framed
        ? { interfaceActiveElement: await ui(`window.__spike.activeElement()`) }
        : { windowHasFocus: win.webContents.isFocused(), previewViewHasFocus: view!.webContents.isFocused() }),
      interfaceDocumentHasFocus: await ui(`document.hasFocus()`),
      pageDocumentHasFocus: await page(`document.hasFocus()`).catch(() => null),
    });
    const focusTheDraft = async () => {
      await ui(`(window.__spike.received.length = 0, document.querySelector("textarea").focus())`);
      win.webContents.focus();
      await wait(150);
    };
    // Control: the maker is typing in the conversation and an ordinary page
    // (one that never calls focus()) loads in the preview.
    await focusTheDraft();
    const focusBefore = await whoHasTheKeyboard();
    await load(home, sandboxed);
    const focusAfterAnOrdinaryPageLoaded = await whoHasTheKeyboard();
    // The same, when the page moves to another page by itself.
    await focusTheDraft();
    const moved = events.length;
    await page(`location.assign("/about")`).catch(() => {});
    await waitFor("loaded", { from: moved, timeout: 5000 });
    const focusAfterThePageMovedToAnotherPage = await whoHasTheKeyboard();
    await focusTheDraft();
    // alert() is left out where it would open a real dialog and wait for a click.
    const loaded = await load(`${c.url}hostile${framed && sandboxed ? "" : "?alert=0"}`, sandboxed, false);
    if (!loaded) return { error: "the page did not load" };
    await mode("browse");
    const read = async () => JSON.parse(await page(`document.getElementById("hostile-report").textContent`));
    const onLoad = (await read()).onLoad;
    const focusAfterLoad = await whoHasTheKeyboard();
    // A key typed now: who gets it?
    let typedWithoutClickingThePage: unknown = "not applicable";
    if (framed) {
      await c.windowInput.text("z");
      await wait(200);
      typedWithoutClickingThePage = {
        interfaceDraftGotIt: await ui(`document.querySelector("textarea").value.includes("z")`),
        pagesFieldGotIt: (await page(`document.getElementById("grab").value`)) === "z",
      };
    }
    // The page calls focus() again, later, while the maker is typing.
    await focusTheDraft();
    await page(`document.getElementById("grab").blur(), document.getElementById("grab").focus()`);
    await wait(200);
    const focusAfterThePageCalledFocusAgain = await whoHasTheKeyboard();
    // The same attempts from a click (a user gesture).
    const button = await locate("#gesture");
    if (button) await click(button.cx, button.cy);
    await wait(600);
    let onClick: unknown = null;
    let pageSurvived = true;
    try {
      onClick = (await read()).onClick;
    } catch (error) {
      pageSurvived = false;
      onClick = `the report could not be read: ${String(error)}`;
    }
    // A page that keeps its thread busy: does the interface feel it?
    let interfaceTimerWhileThePageWasBusy: unknown = null;
    if (pageSurvived) {
      await ui(`window.__spike.timerStart()`);
      await page(`(setTimeout(() => window.busy(1500), 0), "started")`);
      await wait(1900);
      interfaceTimerWhileThePageWasBusy = await ui(`window.__spike.timerStop()`);
    }
    const topUrlAfterwards = win.webContents.getURL();
    const result = {
      windowWasInFront: win.isFocused(),
      iframeSandboxAttribute: framed ? (sandboxed ? "allow-scripts allow-same-origin allow-forms" : "none") : "not applicable",
      focusWhileTheMakerTypesInTheConversation: focusBefore,
      focusAfterAnOrdinaryPageLoaded,
      focusAfterThePageMovedToAnotherPage,
      focusAfterThePageCalledFocusAgain,
      onLoad,
      focusAfterTheHostilePageLoaded: focusAfterLoad,
      typedWithoutClickingThePage,
      onClick,
      mainProcessSawAndStopped: {
        navigationsOfTheWindow: [...guards.topNavigations],
        windowsThePageTriedToOpen: [...guards.windowOpens],
        navigationsOfThePreviewItself: [...guards.previewSelfNavigations],
      },
      windowStillShowsTheInterface: topUrlAfterwards === topUrl && (await ui(`window.__spike.bootId`).catch(() => null)) === bootId,
      messagesTheInterfaceReceivedFromThePage: await ui(`window.__spike.received`).catch(() => "the interface is gone"),
      interfaceTimerWhileThePageWasBusy,
      preloadRanInTheNestedFrame: c.preloadRuns.filter((r: any) => r.depth > 1),
    };
    guards.holdPreview = false;
    if (topUrlAfterwards !== topUrl) {
      // The page took the window. Put the interface back for the next checks.
      await c.loadInterface();
      await waitFor("loaded", { timeout: 10_000 });
    }
    return result;
  };
  await step("hostilePage", hostile(true));
  if (framed) await step("hostilePageWithoutTheSandboxAttribute", hostile(false));

  // --- 13. a page that hangs, a page whose process dies ------------------------------
  await step("hang", async () => {
    await load(home);
    guards.unresponsive.length = 0;
    const hungPid = preview.frame()?.osProcessId;
    await ui(`window.__spike.timerStart()`);
    await page(`(setTimeout(() => { for (;;) {} }, 50), "armed")`);
    await wait(3000);
    const interfaceTimer = await ui(`window.__spike.timerStop()`);
    const answered = await ask({ type: "ping", echo: "hung" }, "pong", 1000);
    // First try: simply load the page again.
    let from = events.length;
    await preview.load(home);
    const byLoadingAgain = !!(await waitFor("loaded", { from, timeout: 6000 }));
    let afterKillingItsProcess: unknown = "not needed";
    if (!byLoadingAgain) {
      if (view) view.webContents.forcefullyCrashRenderer();
      else if (hungPid && hungPid !== interfacePid()) process.kill(hungPid, "SIGKILL");
      await wait(800);
      from = events.length;
      await preview.load(home);
      afterKillingItsProcess = !!(await waitFor("loaded", { from, timeout: 8000 }));
    }
    return {
      interfaceTimerWhileThePageHung: interfaceTimer,
      editingScriptAnsweredWhileHung: !!answered,
      unresponsiveEventOn: [...guards.unresponsive],
      recovered: { byLoadingThePageAgain: byLoadingAgain, afterKillingItsProcess },
    };
  });

  await step("crash", async () => {
    await load(home);
    guards.gone.length = 0;
    const bootId = await ui(`window.__spike.bootId`);
    const pid = preview.frame()?.osProcessId;
    if (!pid || pid === interfacePid()) return { notRun: "the preview shares the interface's process" };
    process.kill(pid, "SIGKILL");
    await wait(1000);
    const interfaceAlive = (await ui(`window.__spike.bootId`).catch(() => null)) === bootId;
    const from = events.length;
    await preview.load(home);
    const recovered = !!(await waitFor("loaded", { from, timeout: 8000 }));
    return { killedProcess: pid, eventsSeenByTheMainProcess: [...guards.gone], interfaceAlive, recoveredByLoadingThePageAgain: recovered };
  });

  // --- 14. capture, also while the app is not on screen ------------------------------
  await step("capture", async () => {
    await load(home);
    let cover: BrowserWindow | null = null;
    const states: [string, () => Promise<void>, () => Promise<void>][] = [
      ["displayed", async () => {}, async () => {}],
      [
        "covered by another window",
        async () => {
          cover = new BrowserWindow({ ...win.getBounds(), title: "Covering the spike's window for a capture test", backgroundColor: "#334155" });
          await wait(3000);
        },
        async () => {
          cover?.destroy();
          await wait(500);
        },
      ],
      [
        "hidden (win.hide())",
        async () => {
          win.hide();
          await wait(1200);
        },
        async () => {
          win.showInactive();
          await wait(800);
        },
      ],
      [
        "minimised",
        async () => {
          win.minimize();
          await wait(2000);
        },
        async () => {
          win.restore();
          await wait(1200);
        },
      ],
    ];
    const table: Record<string, unknown> = {};
    for (const [state, enter, leave] of states) {
      await enter();
      const row: Record<string, unknown> = {
        visibility: { interface: await ui(`document.visibilityState`), page: (await measure())?.visibility ?? "no answer" },
      };
      for (const how of c.captureMethodNames) {
        // What the screen shows while the window is stretched for the whole-page capture.
        if (framed && state === "displayed" && how === "devtools-full") {
          void wait(380).then(async () => {
            row["screen during devtools-full"] = await screenCapture(win, join(c.outDir(), `electron-iframe-screen-during-whole-page-capture.png`));
          });
        }
        const r = await c.capture(how, `${state.split(" ")[0]}-${how}`);
        row[how] = r.ok ? { ms: r.ms, picture: r.picture, file: r.file } : { failed: r.error, ms: r.ms };
      }
      table[state] = row;
      await leave();
    }
    return table;
  });

  // The two drags come last: once the DevTools protocol has driven a drag,
  // the input it injects afterwards is no longer delivered.
  // --- 5. drag and drop through the engine's drag code (criterion 3) ------------
  await step("nativeDrag", async () => {
    await load(home);
    return c.protocolDrag();
  });

  // --- 6. the pointer-drag fallback, with injected input -------------------------
  await step("pointerDrag", async () => {
    if (!framed) {
      return {
        notRun:
          "injected input enters one web contents and cannot be carried into another, so it cannot show whether the interface keeps receiving the pointer once it is over the WebContentsView",
      };
    }
    await load(home);
    const handle = await ui(`window.__spike.rectOf('[data-pointer-drag="stats"]')`);
    const start = { x: Math.round(handle.x + handle.width / 2), y: Math.round(handle.y + handle.height / 2) };
    const end = at(320, 430);
    const from = events.length;
    const w = c.windowInput;
    await w.move(start.x, start.y);
    await wait(80);
    await w.down(start.x, start.y);
    await wait(80);
    let ghostSeenOverThePreview = false;
    let picture: string | null = null;
    // Where the pointer was sent, and where the interface's ghost followed it to.
    const trail: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const x = Math.round(start.x + ((end.x - start.x) * i) / 12);
      const y = Math.round(start.y + ((end.y - start.y) * i) / 12);
      await w.move(x, y, true);
      await wait(40);
      const ghost = await ui(`window.__spike.rectOf('[data-testid="drag-ghost"]')`);
      trail.push(`${x}→${ghost ? Math.round(ghost.x - 10) : "no ghost"}`);
      if (i === 10) {
        ghostSeenOverThePreview = !!ghost && ghost.x > preview.origin().x;
        await wait(150);
        picture = await c.windowShot("pointer-drag-in-progress");
      }
    }
    await w.up(end.x, end.y);
    const drop = await waitFor("drop", { from, timeout: 2000 });
    const inserted = await waitFor("inserted", { from, timeout: 2000 });
    return {
      inputInjectedWith: w.how,
      // Input injected through the DevTools protocol is sent straight to the
      // frame under the point; it does not honour a pointer capture held by
      // another frame. A person's pointer may behave differently.
      interfaceKeptReceivingThePointerOverThePreview: ghostSeenOverThePreview,
      ghostDrawnByTheInterfaceOverThePreview: ghostSeenOverThePreview,
      previewStartsAtX: preview.origin().x,
      pointerSentToAndGhostFollowedTo: trail,
      pageSawThePointer: since(from).filter((e) => e.type === "hover").length,
      picture,
      drop: drop && { via: drop.via, blockId: drop.blockId, index: drop.index },
      inserted: inserted && { sections: inserted.sections },
    };
  });

  results.finishedAt = new Date().toISOString();
  return results;
}

// A picture of what is really on the screen where the window is, taken by
// macOS (it needs the screen-recording permission; without it the picture
// shows the desktop without the window, or the command fails).
function screenCapture(win: BrowserWindow, file: string) {
  const id = win.getMediaSourceId().split(":")[1];
  return new Promise<string>((resolve) => {
    execFile("/usr/sbin/screencapture", ["-x", "-o", "-l", id, file], { timeout: 5000 }, (error) => {
      if (error) resolve(`screencapture failed: ${String(error.message).trim()}`);
      else resolve(existsSync(file) ? `${file} (${statSync(file).size} bytes)` : "screencapture wrote nothing");
    });
  });
}
