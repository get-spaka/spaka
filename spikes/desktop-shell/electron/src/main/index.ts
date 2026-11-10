// Electron main process of the spike. Throwaway code.
//
// The preview can be embedded in two ways, so that they can be compared:
//   SPIKE_EMBED=view    (default) a WebContentsView laid over the window;
//   SPIKE_EMBED=iframe  an <iframe> inside the interface's own document.
import {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  nativeImage,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type NativeImage,
  type WebContents,
  type WebFrameMain,
} from "electron";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { startCannedServer } from "../../../canned-server/server.mjs";
import { runAgentTurn } from "../../../shared/agent-turn.js";
import { createSpikeOut } from "../../../shared/spike-out.js";
import { runEmbedChecks, type Context, type Injector, type Preview } from "./embed-checks";

const out = createSpikeOut(() => app.quit());
out.mark("main-start");

const here = dirname(fileURLToPath(import.meta.url));
// Named so that it does not collide with the `require` electron-vite adds to ESM output.
const nodeRequire = createRequire(import.meta.url);

const EMBED: "view" | "iframe" = process.env.SPIKE_EMBED === "iframe" ? "iframe" : "view";
// One port per embedding, so that both apps can run side by side.
const PORT = EMBED === "iframe" ? 4519 : 4517;

// The official binary ships in the SDK's platform package. Inside a packaged
// app it has to sit outside the asar archive to be executable.
function claudeBinary(): string {
  const resolved = nodeRequire.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude`);
  return resolved.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`);
}

// Test aid: Chromium stops drawing frames for a window that is not being
// displayed (covered, minimised, screen locked). SPIKE_KEEP_DRAWING=1 turns
// that off, so the progressive painting can be timed on an unattended machine.
if (process.env.SPIKE_KEEP_DRAWING) {
  app.commandLine.appendSwitch("disable-features", "MacWebContentsOcclusion,CalculateNativeWinOcclusion");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
}

// Experiments for the iframe embedding, off by default.
//   SPIKE_ISOLATE=1       ask Chromium for a process of its own for the preview's origin
//   SPIKE_FOCUS_POLICY=1  switch on Blink's unshipped "no focus without a user gesture" policy
if (process.env.SPIKE_ISOLATE) app.commandLine.appendSwitch("isolate-origins", `http://127.0.0.1:${PORT}`);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The overlay view's page (SPIKE_OVERLAY): a bubble, and for the modal kind a
// dimming and a ring around what the bubble points at.
const overlayPage = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden;
               font: 13px ui-sans-serif, system-ui, sans-serif; color: #18181b; }
  #dim { position: fixed; inset: 0; background: rgba(0, 0, 0, .4); display: none; }
  #ring { position: fixed; display: none; border-radius: 6px; box-shadow: 0 0 0 4px #fbbf24; }
  #tip { position: fixed; box-sizing: border-box; width: 288px; background: #fff; border-radius: 8px;
         padding: 12px; box-shadow: 0 8px 14px rgba(0, 0, 0, .3); }
  #tip p { margin: 4px 0 0; font-size: 12px; color: #52525b; }
  button { margin-top: 8px; background: #18181b; color: #fff; border: 0; border-radius: 4px;
           padding: 4px 8px; font: 500 12px ui-sans-serif, system-ui, sans-serif; }
</style></head><body>
<div id="dim"></div><div id="ring"></div>
<div id="tip"><b id="title"></b><p id="text"></p><button id="ok">Got it</button></div>
<script>
  const $ = (id) => document.getElementById(id);
  electronIpc.on("spike:overlay", (m) => {
    $("dim").style.display = $("ring").style.display = m.modal ? "block" : "none";
    if (m.modal) {
      Object.assign($("ring").style, { left: m.anchor.x - 6 + "px", top: m.anchor.y - 6 + "px", width: m.anchor.w + 12 + "px", height: m.anchor.h + 12 + "px" });
      Object.assign($("tip").style, { left: m.anchor.x + "px", top: m.anchor.y + m.anchor.h + 16 + "px" });
      $("title").textContent = "This is the page's title";
      $("text").textContent = "This bubble and the dimming are drawn by a second, transparent view laid over the whole window.";
    } else {
      Object.assign($("tip").style, { left: m.margin + "px", top: m.margin + "px" });
      $("title").textContent = "A menu that overlaps the preview";
      $("text").textContent = "Drawn by a transparent view that is only as large as this box. The preview around it still gets the pointer.";
    }
    requestAnimationFrame(() => electronIpc.send("spike:overlay-painted"));
  });
  $("ok").onclick = () => electronIpc.send("spike:overlay-close", "button");
  $("dim").onclick = () => electronIpc.send("spike:overlay-close", "outside");
</script></body></html>`;

async function main() {
  await app.whenReady();
  out.mark("app-ready");

  const vendorDir = app.isPackaged
    ? join(process.resourcesPath, "canned-vendor")
    : join(app.getAppPath(), "..", "canned-server", "vendor");
  const server = await startCannedServer({ port: PORT, vendorDir });

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Upstart spike — Electron",
    webPreferences: {
      preload: join(here, "../preload/app.cjs"),
      contextIsolation: true,
      sandbox: true,
      // The iframe embedding needs the preload to run in the preview's frame
      // as well. This is the (experimental) option that does it. With
      // `sandbox` and `contextIsolation` on, it gives a frame's page nothing:
      // only the preload runs there, in an isolated world.
      nodeIntegrationInSubFrames: EMBED === "iframe",
      ...(process.env.SPIKE_FOCUS_POLICY ? { enableBlinkFeatures: "BlockingFocusWithoutUserActivation" } : {}),
    },
  });

  // Where the preview sits in the window, in CSS pixels. The interface reports it.
  let rect = { x: 0, y: 0, width: 0, height: 0 };

  // The WebContentsView embedding: a view of its own, with a preload of its
  // own (isolated world) and a session of its own.
  const view =
    EMBED === "view"
      ? new WebContentsView({
          webPreferences: {
            preload: join(here, "../preload/preview.cjs"),
            contextIsolation: true,
            sandbox: true,
            partition: "preview",
          },
        })
      : null;
  if (view) {
    win.contentView.addChildView(view);
    view.setBounds(rect);
  }

  // Experiment (SPIKE_OVERLAY=1, WebContentsView embedding only): a second,
  // transparent view laid over everything, in which the app draws what has
  // to appear over the preview (a bubble, a menu, a dimming). It is the
  // app's own page, loaded once and kept hidden until needed. A view takes
  // every click inside its bounds, transparent or not, so it is given the
  // bounds of what it shows, or the whole window when it dims everything.
  const overlay =
    view && process.env.SPIKE_OVERLAY
      ? new WebContentsView({
          webPreferences: { preload: join(here, "../preload/app.cjs"), contextIsolation: true, sandbox: true, transparent: true },
        })
      : null;
  let overlayShown: { modal: boolean } | null = null;
  const overlayPainted = new EventEmitter();
  const hideOverlay = () => {
    // A click in the overlay gives it the keyboard, and it keeps it once
    // hidden: keys then go nowhere. The interface gets the keyboard back.
    if (overlay?.webContents.isFocused() && !process.env.SPIKE_OVERLAY_KEEPS_FOCUS) win.webContents.focus();
    overlay?.setVisible(false);
    overlayShown = null;
  };
  // Resolves with the milliseconds until the overlay's page has drawn a frame.
  const showOverlay = (anchor: { x: number; y: number; w: number; h: number }, modal: boolean) =>
    new Promise<number | null>((resolve) => {
      if (!overlay) return resolve(null);
      const started = Date.now();
      const [width, height] = win.getContentSize();
      const margin = 14; // room for the bubble's shadow
      overlay.setBounds(
        modal
          ? { x: 0, y: 0, width, height }
          : {
              x: Math.min(Math.round(anchor.x) - margin, width - 288 - 2 * margin),
              y: Math.round(anchor.y + anchor.h) + 4 - margin,
              width: 288 + 2 * margin,
              height: 132 + 2 * margin,
            },
      );
      overlay.setVisible(true);
      overlayShown = { modal };
      overlayPainted.once("painted", () => resolve(Date.now() - started));
      setTimeout(() => resolve(null), 2000);
      overlay.webContents.send("spike:overlay", { modal, anchor, margin });
    });
  if (overlay) {
    overlay.setBackgroundColor("#00000000");
    win.contentView.addChildView(overlay);
    overlay.setVisible(false);
    ipcMain.on("spike:overlay-painted", (event) => {
      if (event.sender === overlay.webContents) overlayPainted.emit("painted");
    });
    ipcMain.on("spike:overlay-close", (event) => {
      if (event.sender === overlay.webContents) hideOverlay();
    });
    ipcMain.on("spike:overlay-show", (event, request) => {
      if (event.sender !== win.webContents) return;
      if (overlayShown && overlayShown.modal === request.modal) hideOverlay();
      else void showOverlay(request.anchor, request.modal);
    });
    void overlay.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayPage)}`);
  }

  const interfaceFrame = () => win.webContents.mainFrame;
  // The iframe embedding: the preview is the interface's only child frame.
  const previewFrame = (): WebFrameMain | null => (view ? view.webContents.mainFrame : (interfaceFrame().frames[0] ?? null));

  const preview: Preview = {
    embed: EMBED,
    contents: view ? view.webContents : win.webContents,
    origin: () => (view ? { x: 0, y: 0 } : { x: rect.x, y: rect.y }),
    size: () => ({ width: rect.width, height: rect.height }),
    frame: previewFrame,
    send(message) {
      if (view) view.webContents.send("editor:message", message);
      else previewFrame()?.send("editor:message", message);
    },
    // Is this IPC message from the preview's own preload?
    owns(event) {
      if (view) return event.sender === view.webContents;
      if (event.sender !== win.webContents) return false;
      const frame = event.senderFrame;
      return !!frame && !!frame.parent && frame.parent.frameTreeNodeId === interfaceFrame().frameTreeNodeId;
    },
    pageWorld(code, userGesture = false) {
      const frame = previewFrame();
      if (!frame) return Promise.reject(new Error("the preview has no frame"));
      return frame.executeJavaScript(code, userGesture);
    },
    async load(url, sandboxed = true) {
      if (view) void view.webContents.loadURL(url).catch(() => {});
      else await win.webContents.executeJavaScript(`window.__spike.remount(${JSON.stringify(url)}, ${sandboxed})`);
    },
  };

  // With the preload running in sub-frames, any frame of the window can send
  // IPC messages. Every channel meant for the interface checks its sender.
  const fromInterface = (event: IpcMainEvent | IpcMainInvokeEvent) => {
    if (event.sender !== win.webContents) return false;
    const frame = event.senderFrame;
    return !!frame && frame.frameTreeNodeId === interfaceFrame().frameTreeNodeId;
  };
  const refused: { channel: string; from: string }[] = [];
  const refuse = (channel: string, event: IpcMainEvent | IpcMainInvokeEvent) => {
    refused.push({ channel, from: event.senderFrame?.url ?? "a frame that is gone" });
  };
  const ui = {
    handle(channel: string, fn: (...args: any[]) => unknown) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!fromInterface(event)) {
          refuse(channel, event);
          throw new Error("refused: this channel is for the app's interface");
        }
        return fn(...args);
      });
    },
    on(channel: string, fn: (...args: any[]) => void) {
      ipcMain.on(channel, (event, ...args) => {
        if (fromInterface(event)) fn(...args);
        else refuse(channel, event);
      });
    },
  };

  // What the editing script reports. Checked for its sender, then passed on
  // to the interface and to the spike's own checks.
  const previewEvents = new EventEmitter();
  ipcMain.on("preview:event", (event, message) => {
    if (!preview.owns(event)) return refuse("preview:event", event);
    previewEvents.emit("event", message);
    if (!win.isDestroyed()) win.webContents.send("preview:event", message);
  });
  const nextPreviewEvent = (type: string, timeout = 3000) =>
    new Promise<any>((resolve) => {
      const listener = (message: any) => {
        if (message.type !== type) return;
        previewEvents.off("event", listener);
        resolve(message);
      };
      previewEvents.on("event", listener);
      setTimeout(() => {
        previewEvents.off("event", listener);
        resolve(null);
      }, timeout);
    });
  const collectPreviewEvents = () => {
    const seen: any[] = [];
    const listener = (message: any) => seen.push(message);
    previewEvents.on("event", listener);
    return { seen, stop: () => previewEvents.off("event", listener) };
  };

  const preloadRuns: unknown[] = [];
  ipcMain.on("spike:preload-ran", (event, info) => {
    let depthSeenByMain = 0;
    for (let frame = event.senderFrame; frame?.parent; frame = frame.parent) depthSeenByMain++;
    preloadRuns.push({ ...info, depthSeenByMain });
  });

  // What the main process sees a page try, and stops.
  const guards: Context["guards"] = {
    topNavigations: [],
    frameNavigations: [],
    windowOpens: [],
    previewSelfNavigations: [],
    holdPreview: false,
    gone: [],
    unresponsive: [],
  };
  // The interface is one document and never navigates. Anything that tries
  // to move the window somewhere else is stopped here.
  win.webContents.on("will-navigate", (details) => {
    if (details.url === win.webContents.getURL()) return; // a reload (development)
    guards.topNavigations.push({ url: details.url, initiator: details.initiator?.url ?? null, stopped: true });
    details.preventDefault();
  });
  win.webContents.on("will-frame-navigate", (details) => {
    guards.frameNavigations.push({ url: details.url, isMainFrame: details.isMainFrame });
  });
  for (const contents of view ? [win.webContents, view.webContents] : [win.webContents]) {
    contents.setWindowOpenHandler((details) => {
      guards.windowOpens.push(details.url);
      return { action: "deny" };
    });
    contents.on("render-process-gone", (_event, details) => {
      guards.gone.push({ event: "render-process-gone", on: contents === win.webContents ? "window" : "preview view", reason: details.reason });
    });
    contents.on("unresponsive", () => {
      guards.unresponsive.push(contents === win.webContents ? "window" : "preview view");
    });
  }
  view?.webContents.on("will-navigate", (details) => {
    guards.previewSelfNavigations.push(details.url);
    if (guards.holdPreview) details.preventDefault();
  });
  app.on("child-process-gone", (_event, details) => {
    guards.gone.push({ event: "child-process-gone", type: details.type, reason: details.reason });
  });

  ui.handle("shell:info", () => ({
    embed: EMBED,
    focusPolicy: !!process.env.SPIKE_FOCUS_POLICY,
    overlayView: !!overlay,
    previewUrl: server.url,
    // SPIKE_PREVIEW_QUERY picks how the canned page is delivered on first load,
    // e.g. "mode=push&delay=60" for pieces pushed over server-sent events.
    previewQuery: process.env.SPIKE_PREVIEW_QUERY ?? "delay=90",
    selftest: out.selftest,
    versions: {
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
    },
  }));

  ui.on("preview:bounds", (bounds) => {
    rect = bounds;
    view?.setBounds(bounds);
  });
  ui.on("preview:load", (url: string) => void preview.load(url));
  ui.on("preview:send", (message) => preview.send(message));

  // --- capture ------------------------------------------------------------------
  // capturePage() copies what the window is showing. The DevTools protocol
  // asks the engine to render a frame, so it does not depend on the window
  // being displayed, and it can render more than the visible part.
  const attach = (contents: WebContents) => {
    if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
    return contents.debugger;
  };
  const shot = async (contents: WebContents, params: Record<string, unknown> = {}, sessionId?: string) => {
    const { data } = await attach(contents).sendCommand("Page.captureScreenshot", { format: "png", ...params }, sessionId);
    return nativeImage.createFromBuffer(Buffer.from(data, "base64"));
  };

  // The iframe's own DevTools target, when the frame runs in a process of its own.
  const frameTargets = new Map<string, { type: string; url: string }>();
  let autoAttached = false;
  async function frameSession() {
    const dbg = attach(win.webContents);
    if (!autoAttached) {
      dbg.on("message", (_event, method, params) => {
        if (method === "Target.attachedToTarget") frameTargets.set(params.sessionId, params.targetInfo);
        if (method === "Target.detachedFromTarget") frameTargets.delete(params.sessionId);
      });
      await dbg.sendCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
      autoAttached = true;
      await wait(300);
    }
    for (const [sessionId, target] of frameTargets) if (target.type === "iframe") return sessionId;
    return null;
  }

  async function wholeViewPage() {
    const { cssContentSize } = await attach(view!.webContents).sendCommand("Page.getLayoutMetrics");
    return shot(view!.webContents, {
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 },
    });
  }
  // An iframe only draws the part of it that the window shows. For the whole
  // page the frame is made as tall as its page for the time of the capture.
  // `stretchTheWindow` also tells the engine that the window itself is that
  // tall (a device-metrics override); without it the frame's process only
  // draws what the real window would show and the rest comes out blank.
  async function wholeFramedPage(stretchTheWindow: boolean) {
    const answer = nextPreviewEvent("measured");
    preview.send({ type: "measure" });
    const measured = await answer;
    if (!measured) throw new Error("the editing script did not answer");
    const dbg = attach(win.webContents);
    const size = await win.webContents.executeJavaScript(`window.__spike.grow(${measured.scrollHeight})`);
    try {
      if (stretchTheWindow) {
        const [width, height] = win.getContentSize();
        await dbg.sendCommand("Emulation.setDeviceMetricsOverride", {
          width,
          height: Math.max(height, Math.ceil(size.height)),
          deviceScaleFactor: 0,
          mobile: false,
        });
      }
      await wait(500); // the frame's own process has to lay out and draw at its new size
      return await shot(win.webContents, {
        captureBeyondViewport: !stretchTheWindow,
        clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
      });
    } finally {
      if (stretchTheWindow) await dbg.sendCommand("Emulation.clearDeviceMetricsOverride");
      await win.webContents.executeJavaScript(`window.__spike.restore()`);
    }
  }
  // The whole page from a second, hidden window that loads the same address:
  // nothing moves on screen, but it is another rendering of the page, not the
  // preview the maker is looking at.
  async function hiddenWindowPage() {
    const url = previewFrame()?.url;
    if (!url) throw new Error("the preview has no address yet");
    const hidden = new BrowserWindow({
      show: false,
      width: Math.max(320, rect.width),
      height: Math.max(320, rect.height),
      webPreferences: { contextIsolation: true, sandbox: true, session: preview.contents.session },
    });
    try {
      await hidden.loadURL(url);
      await wait(300); // Tailwind's browser build styles the page after load
      const { cssContentSize } = await attach(hidden.webContents).sendCommand("Page.getLayoutMetrics");
      return await shot(hidden.webContents, {
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 },
      });
    } finally {
      hidden.destroy();
    }
  }
  async function frameTarget() {
    const sessionId = await frameSession();
    if (!sessionId) throw new Error("the iframe has no DevTools target of its own");
    return shot(win.webContents, {}, sessionId);
  }

  const captureMethods: Record<string, { label: string; run: () => Promise<NativeImage> }> = view
    ? {
        page: {
          label: "webContents.capturePage() on the preview's WebContentsView",
          run: () => view.webContents.capturePage(),
        },
        devtools: {
          label: "Page.captureScreenshot through webContents.debugger (works while the window is not displayed)",
          run: () => shot(view.webContents),
        },
        "devtools-full": {
          label: "Page.captureScreenshot of the whole page through webContents.debugger",
          run: wholeViewPage,
        },
        "hidden-window-full": {
          label: "the whole page, from a second hidden window that loads the same address",
          run: hiddenWindowPage,
        },
      }
    : {
        page: {
          label: "webContents.capturePage(rect) on the window, cropped to where the iframe is",
          run: () => win.webContents.capturePage(rect),
        },
        devtools: {
          label: "Page.captureScreenshot on the window through webContents.debugger, clipped to where the iframe is",
          run: () => shot(win.webContents, { clip: { ...rect, scale: 1 } }),
        },
        "devtools-full": {
          label: "Page.captureScreenshot on the window, the iframe made as tall as its page and the window told it is that tall, for the time of the capture",
          run: () => wholeFramedPage(true),
        },
        "devtools-full-unstretched": {
          label: "the same without telling the window it is taller (captureBeyondViewport)",
          run: () => wholeFramedPage(false),
        },
        "hidden-window-full": {
          label: "the whole page, from a second hidden window that loads the same address",
          run: hiddenWindowPage,
        },
        "devtools-frame": {
          label: "Page.captureScreenshot sent to the iframe's own DevTools target",
          run: frameTarget,
        },
      };

  // How much is in the picture: a blank or half-drawn capture has few colours.
  function pictureStats(png: Buffer) {
    const flat = nativeImage.createFromBuffer(png);
    const { width, height } = flat.getSize();
    const bitmap = flat.toBitmap();
    const all = new Set<number>();
    const low = new Set<number>();
    const stepX = Math.max(1, Math.floor(width / 96));
    const stepY = Math.max(1, Math.floor(height / 96));
    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        const colour = bitmap.readUInt32LE((y * width + x) * 4) & 0xffffff;
        all.add(colour);
        if (y > (height * 2) / 3) low.add(colour);
      }
    }
    return { pixels: `${width}×${height}`, coloursSampled: all.size, coloursInTheLowerThird: low.size };
  }

  const outDir = () => {
    const dir = out.dir ?? join(tmpdir(), "upstart-spike");
    mkdirSync(dir, { recursive: true });
    return dir;
  };

  async function capture(how?: string, name?: string) {
    const started = Date.now();
    const attempts: string[] = [];
    for (const key of how ? [how] : ["page", "devtools"]) {
      const method = captureMethods[key];
      if (!method) {
        attempts.push(`${key}: no such method in this embedding`);
        continue;
      }
      try {
        const image = await method.run();
        if (image.isEmpty()) throw new Error("empty image");
        const png = image.toPNG();
        const file = join(outDir(), `electron-${EMBED}-capture-${name ?? key}.png`);
        writeFileSync(file, png);
        const size = image.getSize();
        return {
          ok: true,
          method: method.label + (attempts.length ? ` — after: ${attempts.join("; ")}` : ""),
          dataUrl: image.toDataURL(),
          width: size.width,
          height: size.height,
          bytes: png.length,
          ms: Date.now() - started,
          file,
          picture: pictureStats(png),
        };
      } catch (error) {
        attempts.push(`${key} failed (${String(error)})`);
      }
    }
    return { ok: false, method: how ?? "capturePage(), then the DevTools protocol", error: attempts.join("; "), ms: Date.now() - started };
  }
  ui.handle("preview:capture", (how?: string) => capture(how));

  // A picture of the whole window's web contents, as the engine composes it.
  // With the iframe that includes the preview; a WebContentsView is a
  // separate surface and is not in it.
  async function windowShot(name: string) {
    const image = await shot(win.webContents);
    const file = join(outDir(), `electron-${EMBED}-window-${name}.png`);
    writeFileSync(file, image.toPNG());
    return file;
  }

  ui.handle("agent:turn", async (prompt: string) => {
    const cwd = join(tmpdir(), "upstart-spike", "electron-project");
    mkdirSync(cwd, { recursive: true });
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const result = await runAgentTurn({
      query,
      prompt,
      cwd,
      executablePath: claudeBinary(),
      onEvent: (e: unknown) => {
        if (!win.isDestroyed()) win.webContents.send("agent:event", e);
      },
    });
    const full = { ...result, cwd, packaged: app.isPackaged, binary: claudeBinary() };
    out.save("agent", { ...full, launchEnvPath: process.env.PATH });
    out.mark("agent-done");
    return full;
  });

  // Injected input, aimed at a point of some web contents (CSS pixels).
  //
  // Electron's sendInputEvent hands the event straight to the process of the
  // web contents' main frame, and it stops there: it never reaches a frame
  // that runs in another process, which is what a cross-origin iframe does.
  // The DevTools protocol's Input domain enters one step earlier, where the
  // browser decides which frame an event is for. So the window gets its input
  // through the protocol when the preview is an iframe.
  function injector(contents: WebContents, routed: boolean): Injector {
    if (!routed) {
      return {
        how: "webContents.sendInputEvent",
        move: async (x, y, held = false) =>
          contents.sendInputEvent({ type: "mouseMove", x, y, ...(held ? { button: "left", modifiers: ["leftButtonDown"] } : {}) }),
        down: async (x, y, clickCount = 1) => contents.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount }),
        up: async (x, y, clickCount = 1) => contents.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount }),
        text: async (text) => {
          for (const character of text) contents.sendInputEvent({ type: "char", keyCode: character });
        },
        key: async (key, meta = false) => {
          const modifiers = meta ? (["meta"] as const) : [];
          contents.sendInputEvent({ type: "keyDown", keyCode: key, modifiers: [...modifiers] });
          contents.sendInputEvent({ type: "keyUp", keyCode: key, modifiers: [...modifiers] });
        },
      };
    }
    const send = (method: string, params: Record<string, unknown>) => attach(contents).sendCommand(method, params);
    const mouse = (type: string, x: number, y: number, buttons: number, clickCount: number) =>
      send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" && !buttons ? "none" : "left", buttons, clickCount });
    return {
      how: "the DevTools protocol's Input domain (Input.dispatchMouseEvent, Input.dispatchKeyEvent)",
      move: (x, y, held = false) => mouse("mouseMoved", x, y, held ? 1 : 0, 0),
      down: (x, y, clickCount = 1) => mouse("mousePressed", x, y, 1, clickCount),
      up: (x, y, clickCount = 1) => mouse("mouseReleased", x, y, 0, clickCount),
      text: async (text) => {
        for (const character of text) await send("Input.dispatchKeyEvent", { type: "char", text: character });
      },
      key: async (key, meta = false) => {
        const virtual = key === "Enter" ? 13 : key.toUpperCase().charCodeAt(0);
        const base = {
          key,
          code: key === "Enter" ? "Enter" : `Key${key.toUpperCase()}`,
          windowsVirtualKeyCode: virtual,
          nativeVirtualKeyCode: virtual,
          modifiers: meta ? 4 : 0,
        };
        await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
        if (key === "Enter") await send("Input.dispatchKeyEvent", { type: "char", text: "\r", ...base });
        await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      },
    };
  }
  const windowInput = injector(win.webContents, !view);
  const previewInput = view ? injector(view.webContents, false) : windowInput;

  // Real input injected into the engine's own input pipeline: move over a
  // heading, click it, double-click it, type, press Enter. With the iframe
  // the input enters the window and the engine routes it to the frame.
  async function realInput() {
    const contents = preview.contents;
    const events = collectPreviewEvents();
    try {
      await preview.pageWorld(`document.querySelector("main h2").scrollIntoView({ block: "center" })`);
      await wait(200);
      const located = nextPreviewEvent("located", 1500);
      preview.send({ type: "locate", selector: "main h2" });
      const rect = (await located)?.rect;
      if (!rect) return { error: "the editing script did not locate the heading" };
      const x = Math.round(preview.origin().x + rect.x + rect.width / 2);
      const y = Math.round(preview.origin().y + rect.y + rect.height / 2);
      contents.focus();
      await previewInput.move(x, y);
      await wait(150);
      await previewInput.down(x, y, 1);
      await previewInput.up(x, y, 1);
      await wait(150);
      await previewInput.down(x, y, 2);
      await previewInput.up(x, y, 2);
      await wait(250);
      await previewInput.text("OK");
      await wait(150);
      await previewInput.key("Enter");
      await wait(300);
      return {
        inputInjectedWith: previewInput.how,
        inputInjectedInto: view ? "the preview's own webContents" : "the window's webContents, at the iframe's place",
        aimedAt: { x, y },
        reported: events.seen
          .filter((m) => ["hover", "click", "text-edit-started", "text-edited"].includes(m.type))
          .map((m) => ({ type: m.type, tag: m.element?.tag, highlightDrawn: m.highlightDrawn, before: m.before, after: m.after })),
      };
    } finally {
      events.stop();
    }
  }
  ui.handle("spike:real-input", realInput);

  // A drag from the sidebar into the preview without a person's pointer: the
  // DevTools protocol starts a real drag in the interface (the gallery's own
  // dragstart handler fills the data), hands the dragged data over, and
  // delivers it as drag events at a point of the preview. It goes through the
  // engine's real drag-and-drop code; what it skips is the operating system's
  // own drag session. With a WebContentsView the drag also has to pass from
  // one web contents to another; with the iframe it stays inside one.
  async function protocolDrag() {
    const source = attach(win.webContents);
    const target = attach(preview.contents);
    const events = collectPreviewEvents();
    try {
      const { result } = await source.sendCommand("Runtime.evaluate", {
        expression: `(() => { const r = document.querySelector('[data-block="cta-banner"]').getBoundingClientRect(); return JSON.stringify({ x: r.x + 24, y: r.y + 10 }); })()`,
        returnByValue: true,
      });
      const from = JSON.parse(result.value);
      if (!view) {
        // The iframe is in the same web contents as the sidebar, so pointer
        // input alone drives the whole drag: press on the block, move into
        // the preview, release. The engine starts the drag, finds the frame
        // under the pointer, and delivers dragenter, dragover and drop to it.
        const to = { x: preview.origin().x + 300, y: preview.origin().y + 420 };
        await windowInput.move(from.x, from.y);
        await windowInput.down(from.x, from.y);
        for (let i = 1; i <= 10; i++) {
          await windowInput.move(Math.round(from.x + ((to.x - from.x) * i) / 10), Math.round(from.y + ((to.y - from.y) * i) / 10), true);
          await wait(50);
        }
        await wait(200);
        await windowInput.up(to.x, to.y);
        await wait(900);
        return {
          drivenBy: "pointer input alone, injected into the window: press on the block, move into the iframe, release",
          inputInjectedWith: windowInput.how,
          reported: events.seen
            .filter((m) => ["drag-entered", "drop", "inserted"].includes(m.type))
            .map((m) => ({ type: m.type, via: m.via, blockId: m.blockId, index: m.index, carriedAs: m.carriedAs, types: m.types, sections: m.sections })),
        };
      }
      await source.sendCommand("Input.setInterceptDrags", { enabled: true });
      const intercepted = new Promise<any>((resolve) => {
        source.on("message", (_event, method, params) => {
          if (method === "Input.dragIntercepted") resolve(params.data);
        });
      });
      const mouse = (type: string, dx: number, buttons: number) =>
        source.sendCommand("Input.dispatchMouseEvent", { type, x: from.x + dx, y: from.y + dx / 4, button: "left", buttons, clickCount: 1 });
      await mouse("mousePressed", 0, 1);
      await mouse("mouseMoved", 20, 1);
      await mouse("mouseMoved", 60, 1);
      const data = await Promise.race([intercepted, wait(2500).then(() => null)]);
      if (!data) return { error: "the interface did not start a drag" };
      const at = { x: preview.origin().x + 300, y: preview.origin().y + 420 };
      for (const type of ["dragEnter", "dragOver", "dragOver", "drop"]) {
        await target.sendCommand("Input.dispatchDragEvent", { type, ...at, data });
        await wait(120);
      }
      await mouse("mouseReleased", 60, 0);
      await source.sendCommand("Input.setInterceptDrags", { enabled: false });
      await wait(700);
      return {
        drivenBy:
          "the DevTools protocol: a drag started in the interface is intercepted, and its data is delivered to the preview's web contents as drag events",
        draggedTypes: (data.items ?? []).map((item: any) => item.mimeType),
        reported: events.seen
          .filter((m) => ["drag-entered", "drop", "inserted"].includes(m.type))
          .map((m) => ({ type: m.type, via: m.via, blockId: m.blockId, index: m.index, carriedAs: m.carriedAs, types: m.types, sections: m.sections })),
      };
    } catch (error) {
      return { error: String(error) };
    } finally {
      events.stop();
    }
  }
  ui.handle("spike:protocol-drag", protocolDrag);

  ui.on("spike:mark", (name: string) => out.mark(name));
  ui.on("spike:report", (result) =>
    out.report({ ...result, embedding: EMBED, packaged: app.isPackaged, launchEnvPath: process.env.PATH }),
  );

  // Experiment (SPIKE_INTERFACE=http): the interface served from the same
  // host as the preview, on another port, instead of from a file. The two
  // are then the same *site* for the browser (cookies), though still
  // different origins.
  let interfaceUrl: string | null = process.env.ELECTRON_RENDERER_URL ?? null;
  if (!interfaceUrl && process.env.SPIKE_INTERFACE === "http") {
    const root = join(here, "../renderer");
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    const files = createServer((req, res) => {
      const path = normalize(new URL(req.url ?? "/", "http://x").pathname).replace(/^\/+/, "") || "index.html";
      readFile(join(root, path))
        .then((data) => {
          res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
          res.end(data);
        })
        .catch(() => {
          res.writeHead(404);
          res.end();
        });
    });
    await new Promise<void>((resolve) => files.listen(4520, "127.0.0.1", resolve));
    interfaceUrl = "http://127.0.0.1:4520/index.html";
  }
  const loadInterface = () => (interfaceUrl ? win.loadURL(interfaceUrl) : win.loadFile(join(here, "../renderer/index.html")));

  // SPIKE_SELFTEST=embed: the checks that compare the two embeddings, driven
  // from here once the preview has loaded for the first time.
  if (out.selftest?.includes("embed")) {
    void nextPreviewEvent("loaded", 60_000).then(async (loaded) => {
      if (!loaded) return out.mark("embed-never-loaded");
      const context: Context = {
        embed: EMBED,
        url: server.url,
        win,
        view,
        preview,
        previewEvents,
        guards,
        preloadRuns,
        refused,
        out,
        outDir,
        capture,
        captureMethodNames: Object.keys(captureMethods),
        windowShot,
        windowInput,
        previewInput,
        overlay: overlay ? { view: overlay, show: showOverlay, hide: hideOverlay } : null,
        realInput,
        protocolDrag,
        loadInterface,
      };
      const results = await runEmbedChecks(context);
      out.save("embed-checks", results);
      out.mark("embed-done");
    });
  }

  await loadInterface();
  win.setTitle(`Upstart spike — Electron — preview in ${EMBED === "iframe" ? "an <iframe>" : "a WebContentsView"}`);
  out.mark("window-loaded");
  // The view is loaded from here; the iframe is created by the interface.
  if (view) void view.webContents.loadURL(`${server.url}?${process.env.SPIKE_PREVIEW_QUERY ?? "delay=90"}`).catch(() => {});

  app.on("window-all-closed", () => {
    server.close();
    app.quit();
  });
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
