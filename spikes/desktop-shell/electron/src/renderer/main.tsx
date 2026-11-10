// Electron's side of the shell contract: builds the bridge the shared
// interface talks to, on top of the few IPC channels the preload exposes.
//
// Two embeddings of the preview, chosen by the main process (SPIKE_EMBED):
//   "view"    a WebContentsView owned by the main process, laid over the window;
//   "iframe"  an <iframe> in this document.
import "./index.css";
import { mount, type ShellBridge } from "../../../shared/ui/mount";

type Ipc = {
  invoke(channel: string, ...args: unknown[]): Promise<any>;
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, listener: (...args: any[]) => void): void;
};

const ipc = (window as unknown as { electronIpc: Ipc }).electronIpc;
const info = await ipc.invoke("shell:info");
const framed = info.embed === "iframe";

// What the framed page may do. No `allow-top-navigation`, no `allow-popups`,
// no `allow-modals`. `allow-same-origin` keeps the page's own origin (its
// requests, cookies and storage); it is safe here because that origin is not
// the interface's.
const SANDBOX = "allow-scripts allow-same-origin allow-forms";

let container: HTMLElement | null = null;
let iframe: HTMLIFrameElement | null = null;

function makeIframe(url: string, sandboxed = true) {
  iframe?.remove();
  iframe = document.createElement("iframe");
  iframe.name = "upstart-preview";
  if (sandboxed) iframe.setAttribute("sandbox", SANDBOX);
  // Experiment: Blink's unshipped policy against focus taken without a user gesture.
  if (info.focusPolicy) iframe.setAttribute("allow", "focus-without-user-activation 'none'");
  iframe.style.cssText = "display:block;width:100%;height:100%;border:0;background:#fff";
  iframe.src = url;
  container!.appendChild(iframe);
}

const shell: ShellBridge = {
  name: "electron",
  embedding: framed ? "<iframe>" : info.overlayView ? "view + overlay view" : "WebContentsView",
  previewUrl: info.previewUrl,
  versions: info.versions,
  selftest: info.selftest,

  mountPreview(element) {
    container = element;
    // Either way the main process is told where the preview sits: the view is
    // positioned there, and for the iframe it is where captures are cropped
    // and where test input is aimed.
    const sendBounds = () => {
      const r = element.getBoundingClientRect();
      ipc.send("preview:bounds", {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };
    new ResizeObserver(sendBounds).observe(element);
    window.addEventListener("resize", sendBounds);
    sendBounds();
    if (framed) makeIframe(`${info.previewUrl}?${info.previewQuery}`);
  },
  onPreviewEvent: (listener) => ipc.on("preview:event", listener),
  sendToPreview: (message) => ipc.send("preview:send", message),
  loadPreview: (url) => {
    if (framed) iframe!.src = url;
    else ipc.send("preview:load", url);
  },
  capturePreview: (how) => ipc.invoke("preview:capture", how),
  captureMethods: framed
    ? ["page", "devtools", "devtools-full", "devtools-frame"]
    : ["page", "devtools", "devtools-full"],

  // Experiment: bubbles drawn in a transparent view laid over the preview.
  ...(info.overlayView
    ? { overlayBubble: (anchor: { x: number; y: number; w: number; h: number }, modal: boolean) => ipc.send("spike:overlay-show", { anchor, modal }) }
    : {}),

  realInput: () => ipc.invoke("spike:real-input"),
  protocolDrag: () => ipc.invoke("spike:protocol-drag"),

  agentTurn: (prompt) => ipc.invoke("agent:turn", prompt),
  onAgentEvent: (listener) => ipc.on("agent:event", listener),

  mark: (name) => ipc.send("spike:mark", name),
  report: (result) => ipc.send("spike:report", result),
};

// --- test hooks ---------------------------------------------------------------
// Called by the main process (webContents.executeJavaScript) while it runs the
// spike's checks. Nothing here is part of the interface.
const received: unknown[] = [];
const keys: string[] = [];
window.addEventListener("message", (event) => {
  // A framed page can post messages to the window that contains it. The
  // interface must never act on them; the spike only counts them.
  received.push({
    origin: event.origin,
    data: event.data,
    fromThePreviewFrame: !!iframe && event.source === iframe.contentWindow,
  });
});
window.addEventListener("keydown", (event) => keys.push((event.metaKey ? "meta+" : "") + event.key), true);

let timer: { id: number; last: number; longest: number; ticks: number } | null = null;

(window as any).__spike = {
  embed: info.embed,
  bootId: Math.random().toString(36).slice(2),
  received,
  keys,
  rectOf(selector: string) {
    const r = document.querySelector(selector)?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  },
  remount(url: string, sandboxed: boolean) {
    makeIframe(url, sandboxed);
  },
  // A zoomed-out preview: the frame is laid out wider than its place and
  // scaled down with a CSS transform.
  setScale(scale: number | null) {
    if (!iframe) return;
    iframe.style.transformOrigin = "0 0";
    iframe.style.transform = scale ? `scale(${scale})` : "";
    iframe.style.width = scale ? `${100 / scale}%` : "100%";
    iframe.style.height = scale ? `${100 / scale}%` : "100%";
  },
  // For a capture of the whole page: the frame is made as tall as its page.
  grow(height: number) {
    if (!iframe || !container) return null;
    const r = container.getBoundingClientRect();
    Object.assign(iframe.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: `${r.width}px`,
      height: `${height}px`,
      zIndex: "2147483647",
    });
    return { width: r.width, height };
  },
  restore() {
    if (!iframe) return;
    Object.assign(iframe.style, { position: "", left: "", top: "", width: "100%", height: "100%", zIndex: "" });
  },
  // Is the interface's own thread kept busy by something else?
  timerStart() {
    const state = { id: 0, last: performance.now(), longest: 0, ticks: 0 };
    state.id = window.setInterval(() => {
      const now = performance.now();
      state.longest = Math.max(state.longest, now - state.last);
      state.last = now;
      state.ticks++;
    }, 10);
    timer = state;
  },
  timerStop() {
    if (!timer) return null;
    clearInterval(timer.id);
    const result = { ticks: timer.ticks, longestGapMs: Math.round(timer.longest) };
    timer = null;
    return result;
  },
  block(ms: number) {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      /* keep this thread busy */
    }
    return ms;
  },
  // Round trips interface → main process → editing script → main process → interface.
  pings(count: number) {
    return new Promise((resolve) => {
      const times: number[] = [];
      let sentAt = 0;
      const next = () => {
        if (times.length === count) {
          times.sort((a, b) => a - b);
          const round = (n: number) => Math.round(n * 100) / 100;
          resolve({ count, medianMs: round(times[count >> 1]), minMs: round(times[0]), maxMs: round(times[count - 1]) });
          return;
        }
        sentAt = performance.now();
        shell.sendToPreview({ type: "ping", echo: `round-trip-${times.length}` });
      };
      ipc.on("preview:event", (message) => {
        if (message.type === "pong" && String(message.echo).startsWith("round-trip-")) {
          times.push(performance.now() - sentAt);
          next();
        }
      });
      next();
    });
  },
  activeElement() {
    const a = document.activeElement;
    return a ? a.tagName.toLowerCase() : null;
  },
};

mount(shell);
