// A probe for the agent's look at a page (Q314-Q324, slice 0 of
// ~/.claude/plans/look-at-preview.md): which hidden view the agent should
// look in, a WebContentsView parked out of the window's sight (as the
// preview is under the thumbnails, Q142) or a window rendered offscreen
// (as the "All pages" pictures are), and what a look costs.
//
//   node spikes/looks/probe.ts
//
// The app is launched in the background (e2e/app.ts) and opens copies of
// Pocket, Reel and Ember. Each view is tried twice:
//   - in the app, whose checks keep hidden windows drawing as if shown: the
//     maker's window on screen;
//   - in a bare Electron (host/), without those switches, loading the same
//     pages from the app's preview server: the maker's window minimized or
//     covered, the parked view's window hidden.
// For each: frames drawn, the picture, wheel events through Lenis and the
// pinned sections, a scroll timeline, Tab with and without focus emulation,
// the three screens, the time of each step and the view's memory.
// Writes runs/<time>/results.json and the pictures.
//
//   node spikes/looks/probe.ts jump
//
// The second round: the offscreen window only, in the app, a part reached by
// jumping to the screen above it and wheeling the last one; the tablet at
// scale 1.
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { launchApp } from "../../e2e/app.ts";
import { backgroundElectron } from "../../scripts/background-electron.ts";

const root = join(import.meta.dirname, "../..");
const { _electron } = createRequire(join(root, "e2e/app.ts"))("playwright");
const out = join(
  import.meta.dirname,
  "runs",
  `${new Date().toISOString().replace(/[:.]/g, "-")}${process.argv[2] ? `-${process.argv[2]}` : ""}`,
);
mkdirSync(out, { recursive: true });

const SCREENS = {
  desktop: { width: 1440, height: 900, scale: 1, mobile: false },
  tablet: { width: 820, height: 1180, scale: 2, mobile: true },
  phone: { width: 393, height: 852, scale: 2, mobile: true },
};
const TEMPLATES = ["pocket", "reel", "ember"] as const;
/** `jump`: the second round, the offscreen window only, in the app, jumping near a part; the tablet at scale 1. */
const JUMP = process.argv[2] === "jump";
if (JUMP) SCREENS.tablet.scale = 1;

/** In the page: resolves once it has settled, or after 2 s; what kept it busy is said. */
const SETTLE = `new Promise((done) => {
  const start = performance.now();
  let lastY = scrollY, lastX = scrollX, still = start, quiet = start, frames = 0, firstQuietScroll;
  const mo = new MutationObserver(() => { quiet = performance.now(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"], subtree: true });
  const scrollDriven = (a) => a.timeline && !(a.timeline instanceof DocumentTimeline);
  const finite = () => document.getAnimations().filter((a) => a.playState === "running" && !scrollDriven(a)
    && Number.isFinite(a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().endTime : Infinity));
  const end = (why) => { mo.disconnect(); clearTimeout(fallback); done({ ms: Math.round(performance.now() - start), why, frames,
    anims: finite().length, sinceMutation: Math.round(performance.now() - quiet), scrollStillAndNoAnimsAt: firstQuietScroll }); };
  const fallback = setTimeout(() => end("no frames"), 2600);
  const tick = () => {
    const now = performance.now(); frames++;
    if (scrollY !== lastY || scrollX !== lastX) { lastY = scrollY; lastX = scrollX; still = now; }
    const anims = finite().length;
    const scrollOk = frames >= 2 && now - still >= 200 && anims === 0;
    if (scrollOk && firstQuietScroll === undefined) firstQuietScroll = Math.round(now - start);
    if (scrollOk && now - quiet >= 150) return end("settled");
    if (now - start > 2000) return end(anims ? "animations" : now - still < 200 ? "scrolling" : "style changes");
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})`;

/** In the page: frames drawn in half a second, times two. */
const FPS = `new Promise((done) => {
  let n = 0; const s = performance.now();
  const f = () => { n++; if (performance.now() - s < 500) requestAnimationFrame(f); else done(n * 2); };
  requestAnimationFrame(f);
  setTimeout(() => done(n * 2), 1500);
})`;

/** In the page: resolves once Tailwind has styled it and the fonts are in, as grid.ts's PAGE_READY. */
const READY = `new Promise((done) => {
  const started = Date.now();
  const ready = () => [...document.querySelectorAll("style")].some((s) => !s.hasAttribute("data-up-runtime") && s.textContent.length > 0);
  const wait = () => ready() || Date.now() - started > 3000 ? document.fonts.ready.then(() => done(Date.now() - started)) : setTimeout(wait, 30);
  wait();
})`;

type Args = {
  url: string;
  variant: "parked" | "offscreen";
  inApp: boolean;
  template: string;
  screens: typeof SCREENS;
  settle: string;
  fps: string;
  ready: string;
  /** Jumps to a screen above the part, then wheels the last screen, instead of wheeling all the way. */
  jump: boolean;
};

/** Runs in a main process (the app's or the bare host's): one view, every check. */
async function probe(electron: typeof import("electron"), a: Args) {
  const { BrowserWindow, WebContentsView, app, nativeImage } = electron;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const now = () => performance.now();
  const ms = (from: number) => Math.round(now() - from);
  const result: Record<string, unknown> = { variant: a.variant, inApp: a.inApp, template: a.template };
  const pictures: { name: string; data: string }[] = [];
  const first = a.screens.desktop;
  let contents: Electron.WebContents;
  let dispose: () => void;
  if (a.variant === "offscreen") {
    const win = new BrowserWindow({
      show: false,
      width: first.width,
      height: first.height,
      useContentSize: true,
      enableLargerThanScreen: true,
      webPreferences: {
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        partition: "probe",
        backgroundThrottling: false,
      },
    });
    win.webContents.setFrameRate(60);
    contents = win.webContents;
    dispose = () => win.destroy();
  } else {
    // In the app, the maker's window, which holds the preview; in the host, a hidden window.
    const host = a.inApp
      ? (BrowserWindow.getAllWindows().find((w) =>
          // biome-ignore lint/suspicious/noExplicitAny: the app's globals, set for checks
          w.contentView.children.includes((globalThis as any).upstart.preview.view),
        ) as Electron.BrowserWindow)
      : new BrowserWindow({ show: false, width: 1280, height: 800 });
    const view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true, partition: "probe", backgroundThrottling: false },
    });
    host.contentView.addChildView(view);
    view.setBounds({ x: -first.width - 200, y: 0, width: first.width, height: first.height });
    contents = view.webContents;
    dispose = () => {
      host.contentView.removeChildView(view);
      contents.close();
      if (!a.inApp) host.destroy();
    };
  }
  const tools = contents.debugger;
  const send = (method: string, params: object = {}) =>
    // biome-ignore lint/suspicious/noExplicitAny: DevTools' answers
    tools.sendCommand(method, params) as Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: what the page answers
  const js = (code: string): Promise<any> =>
    Promise.race([contents.executeJavaScript(code, true), wait(8000).then(() => ({ timedOut: code.slice(0, 40) }))]);
  let screen = first;
  const emulate = async (s: typeof first) => {
    screen = s;
    await send("Emulation.setDeviceMetricsOverride", {
      width: s.width,
      height: s.height,
      deviceScaleFactor: s.scale,
      mobile: s.mobile,
      screenWidth: s.width,
      screenHeight: s.height,
    });
  };
  const shot = async (name: string) => {
    const from = now();
    const r = await Promise.race([send("Page.captureScreenshot", { format: "png" }), wait(5000).then(() => null)]);
    const took = ms(from);
    if (!r) return { ms: took, timedOut: true };
    pictures.push({ name, data: r.data });
    const image = nativeImage.createFromBuffer(Buffer.from(r.data, "base64"));
    const size = image.getSize();
    const bitmap = image.resize({ width: 48 }).toBitmap();
    let min = 255;
    let max = 0;
    const colors = new Set<number>();
    for (let i = 0; i < bitmap.length; i += 4) {
      const v = (bitmap[i]! + bitmap[i + 1]! + bitmap[i + 2]!) / 3;
      min = Math.min(min, v);
      max = Math.max(max, v);
      colors.add((bitmap[i]! << 16) | (bitmap[i + 1]! << 8) | bitmap[i + 2]!);
    }
    return { ms: took, width: size.width, height: size.height, range: Math.round(max - min), colors: colors.size };
  };
  const wheel = async (dy: number) =>
    send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: Math.round(screen.width / 2),
      y: Math.round(screen.height / 2),
      deltaX: 0,
      deltaY: dy,
    });
  /** Wheels until the element's top is near the top of the screen, as a person scrolls. */
  const scrollTo = async (selector: string) => {
    const from = now();
    let events = 0;
    let lastTop = Number.POSITIVE_INFINITY;
    let stuck = 0;
    if (a.jump) {
      await js(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return;
          scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + scrollY - innerHeight), behavior: "instant" }); })()`,
      );
      await js("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
    }
    for (let i = 0; i < 120; i++) {
      const top = await js(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? Math.round(el.getBoundingClientRect().top) : null; })()`,
      );
      if (top === null) return { found: false };
      if (top <= screen.height * 0.1) break;
      if (Math.abs(top - lastTop) < 2 && ++stuck > 8) return { stuck: true, top, events, ms: ms(from) };
      if (Math.abs(top - lastTop) >= 2) stuck = 0;
      lastTop = top;
      await wheel(Math.min(top, 360));
      events++;
      await wait(40);
    }
    const settle = await js(a.settle);
    return { events, ms: ms(from), settle };
  };
  const key = async (key: string, code: string, vk: number, modifiers = 0) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers });
  };
  const focusState = () =>
    js(`(() => { const el = document.activeElement; return { tag: el && el.tagName, text: el && (el.textContent || "").trim().slice(0, 30),
      focusVisible: !!el && el !== document.body && el.matches(":focus-visible"), hasFocus: document.hasFocus() }; })()`);
  const memory = () => {
    const pid = contents.getOSProcessId();
    const m = app.getAppMetrics().find((p) => p.pid === pid);
    return m && { workingSetMB: Math.round(m.memory.workingSetSize / 1024), privateMB: Math.round((m.memory.privateBytes ?? 0) / 1024) };
  };

  try {
    const focusedBefore = BrowserWindow.getFocusedWindow()?.id ?? null;
    tools.attach("1.3");
    contents.on("dom-ready", () => void emulate(screen).catch(() => {}));
    const loadFrom = now();
    await contents.loadURL(a.url);
    await emulate(first);
    // Visitor mode, as the preview's own script sets it.
    await js("document.documentElement.setAttribute('data-up-moving', ''); window.__upStart && window.__upStart.go()");
    for (let i = 0; i < 100 && !(await js("!window.__upStart || window.__upStart.started")); i++) await wait(50);
    await js(a.ready);
    result.loadMs = ms(loadFrom);
    result.fps = await js(a.fps);
    result.visibility = await js("document.visibilityState");
    result.firstSettle = await js(a.settle);
    result.firstScreen = await shot("desktop-top");
    result.pageHeight = await js("document.documentElement.scrollHeight");

    // Tab, first without focus emulation, then with it.
    await key("Tab", "Tab", 9);
    await wait(80);
    result.tabWithoutEmulation = await focusState();
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await js("document.activeElement && document.activeElement.blur()");
    await key("Tab", "Tab", 9);
    await wait(80);
    await key("Tab", "Tab", 9);
    await wait(80);
    result.tabWithEmulation = await focusState();
    result.focusedWindowBefore = focusedBefore;
    result.focusedWindowAfter = BrowserWindow.getFocusedWindow()?.id ?? null;
    result.contentsFocused = contents.isFocused();
    await key("Escape", "Escape", 27);
    await js("document.activeElement && document.activeElement.blur()");

    // What each template moves on scroll.
    if (a.template === "pocket") {
      const reveal = await js(`(() => { const el = [...document.querySelectorAll("[data-reveal]")].find((e) => e.getBoundingClientRect().top > innerHeight * 1.2);
        if (!el) return null; el.setAttribute("data-probe-reveal", ""); return getComputedStyle(el).opacity; })()`);
      const scrolled = reveal === null ? null : await scrollTo("[data-probe-reveal]");
      result.reveal = {
        before: reveal,
        scrolled,
        after: await js(`(() => { const el = document.querySelector("[data-probe-reveal]"); return el && getComputedStyle(el).opacity; })()`),
      };
      result.revealShot = await shot("desktop-reveal");
      const story = await scrollTo("[data-phone-story]");
      const on = await js(`!!document.querySelector("[data-phone-story][data-story-on]")`);
      const seen: number[] = [];
      for (let i = 0; i < 40; i++) {
        const state = await js(`(() => { const s = document.querySelector("[data-phone-story]"); const texts = [...s.querySelectorAll("[data-chapter]")];
          return { active: texts.findIndex((t) => t.hasAttribute("data-active")), bottom: Math.round(s.getBoundingClientRect().bottom) }; })()`);
        if (!seen.includes(state.active)) seen.push(state.active);
        if (state.bottom < screen.height) break;
        await wheel(240);
        await wait(120);
      }
      result.story = { scrolled: story, pinned: on, chaptersSeen: seen };
    }
    if (a.template === "reel") {
      const reel = await scrollTo("[data-reel]");
      const pinned = await js(`!!document.querySelector("[data-reel][data-pinned]")`);
      const xs: string[] = [];
      for (let i = 0; i < 30; i++) {
        const state = await js(`(() => { const s = document.querySelector("[data-reel]"); const t = s.querySelector("[data-reel-track]");
          return { x: t.style.transform, bottom: Math.round(s.getBoundingClientRect().bottom) }; })()`);
        if (!xs.includes(state.x)) xs.push(state.x);
        if (state.bottom < screen.height) break;
        await wheel(240);
        await wait(100);
      }
      result.reel = { scrolled: reel, pinned, positions: xs.length, sample: xs.slice(0, 4) };
      result.reelShot = await shot("desktop-reel");
    }
    if (a.template === "ember") {
      const before = await js(`getComputedStyle(document.querySelector(".site-header")).backgroundColor`);
      for (let i = 0; i < 4; i++) {
        await wheel(240);
        await wait(40);
      }
      const settle = await js(a.settle);
      const after = await js(`getComputedStyle(document.querySelector(".site-header")).backgroundColor`);
      const drift = await js(`(() => { const img = document.querySelector("[data-drift] img"); return img && getComputedStyle(img).transform; })()`);
      const scrolled = await scrollTo("[data-drift]");
      const drift2 = await js(`(() => { const img = document.querySelector("[data-drift] img"); return img && getComputedStyle(img).transform; })()`);
      result.timelines = { header: { before, after, settle }, drift: { before: drift, after: drift2, scrolled } };
      result.driftShot = await shot("desktop-drift");
    }
    // A look after the first load: a part further down, settled, and its picture.
    const last = await js(`(() => { const s = [...document.querySelectorAll("body section")]; const el = s[Math.floor(s.length * 0.75)];
      if (!el) return false; el.setAttribute("data-probe-look", ""); return true; })()`);
    if (last) {
      const from = now();
      const scrolled = await scrollTo("[data-probe-look]");
      const picture = await shot("desktop-look");
      result.look = { ms: ms(from), scrolled, picture };
    }
    result.memoryDesktop = memory();

    // The other screens: laid out again, a picture, a look further down.
    for (const name of ["tablet", "phone"] as const) {
      const from = now();
      await emulate(a.screens[name]);
      await js("scrollTo({ top: 0, behavior: 'instant' })");
      const settle = await js(a.settle);
      const top = await shot(`${name}-top`);
      const relayoutMs = ms(from);
      const look = last ? await scrollTo("[data-probe-look]") : null;
      const picture = last ? await shot(`${name}-look`) : null;
      result[name] = {
        relayoutMs,
        settle,
        top,
        look,
        picture,
        lookMs: ms(from) - relayoutMs,
        innerWidth: await js("innerWidth"),
        overflow: await js("document.documentElement.scrollWidth > innerWidth"),
      };
    }
    result.memory = memory();
    return { result, pictures };
  } catch (error) {
    result.error = String(error);
    return { result, pictures };
  } finally {
    try {
      tools.detach();
    } catch {}
    dispose();
  }
}

const launched = await launchApp();
const results: unknown[] = [];
try {
  await launched.window.getByTestId("message-input").waitFor();
  const host = await _electron.launch({ executablePath: backgroundElectron(), args: [join(import.meta.dirname, "host")] });
  try {
    for (const template of TEMPLATES) {
      const copy = join(launched.projectsDir, template);
      cpSync(join(root, "apps/desktop/templates", template), copy, {
        recursive: true,
        filter: (src) => !/\/(pictures|blocks)(\/|$)|TEMPLATE\.md$|template\.json$/.test(src),
      });
      const project = await launched.app.evaluate(
        // biome-ignore lint/suspicious/noExplicitAny: the app's globals, set for checks
        (_e: unknown, path: string) => (globalThis as any).upstart.projects.openFolder(path),
        copy,
      );
      await launched.window.evaluate(
        // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
        (id: string) => (window as any).upstart.invoke("projects:open", id),
        project.id,
      );
      await new Promise((r) => setTimeout(r, 1500));
      const origin = await launched.app.evaluate(
        // biome-ignore lint/suspicious/noExplicitAny: the app's globals, set for checks
        () => (globalThis as any).upstart.preview.origin as string,
      );
      for (const [inApp, target] of JUMP
        ? ([[true, launched.app]] as const)
        : ([
            [true, launched.app],
            [false, host],
          ] as const)) {
        for (const variant of JUMP ? (["offscreen"] as const) : (["parked", "offscreen"] as const)) {
          const args: Args = {
            url: new URL("/", origin).toString(),
            variant,
            inApp,
            template,
            screens: SCREENS,
            settle: SETTLE,
            fps: FPS,
            ready: READY,
            jump: JUMP,
          };
          const started = Date.now();
          const { result, pictures } = await target.evaluate(probe, args);
          result.totalMs = Date.now() - started;
          const dir = join(out, `${template}-${inApp ? "app" : "host"}-${variant}`);
          mkdirSync(dir, { recursive: true });
          for (const p of pictures) writeFileSync(join(dir, `${p.name}.png`), Buffer.from(p.data, "base64"));
          results.push(result);
          console.log(JSON.stringify(result));
          writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
        }
      }
    }
  } finally {
    await host.close();
  }
} finally {
  await launched.close();
}
console.log(`\n${out}`);
