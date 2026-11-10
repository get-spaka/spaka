// Electrobun's side of the shell contract: builds the bridge the shared
// interface talks to, on top of Electrobun's RPC and its <electrobun-webview>.
import "./index.css";
import { Electroview } from "electrobun/view";
import { mount, type ShellBridge } from "../../../shared/ui/mount";
import type { AgentEvent, CaptureResult, PreviewEvent } from "../../../shared/ui/types";
import type { SpikeRPC } from "../rpc";

type WebviewTag = HTMLElement & {
  loadURL(url: string): void;
  executeJavascript(js: string): void;
  on(event: string, listener: (event: CustomEvent) => void): void;
};

const previewListeners: ((event: PreviewEvent) => void)[] = [];
const agentListeners: ((event: AgentEvent) => void)[] = [];

const rpc = Electroview.defineRPC<SpikeRPC>({
  maxRequestTime: 600_000,
  handlers: {
    requests: {},
    messages: {
      agentEvent: (event) => agentListeners.forEach((listener) => listener(event)),
    },
  },
});
const view = new Electroview({ rpc });
const info = await view.rpc!.request.info({});

let webview: WebviewTag | null = null;

// In-page captures come back from the preview in slices.
const captures = new Map<string, { parts: string[]; resolve: (r: CaptureResult) => void; name: string }>();

function onPreviewMessage(detail: unknown) {
  const event = (typeof detail === "string" ? JSON.parse(detail) : detail) as PreviewEvent;
  if (event.type === "capture-slice" || event.type === "capture-failed") {
    const pending = captures.get(event.id);
    if (!pending) return;
    if (event.type === "capture-failed") {
      captures.delete(event.id);
      pending.resolve({ ok: false, method: IN_PAGE, error: event.error });
      return;
    }
    pending.parts[event.index] = event.data;
    if (pending.parts.filter(Boolean).length === event.total) {
      captures.delete(event.id);
      const dataUrl = pending.parts.join("");
      view.rpc!.request.saveCapture({ name: pending.name, dataUrl }).then((saved) =>
        pending.resolve({
          ok: true,
          method: IN_PAGE,
          dataUrl,
          width: event.width,
          height: event.height,
          ms: event.ms,
          ...saved,
        }),
      );
    }
    return;
  }
  previewListeners.forEach((listener) => listener(event));
}

const IN_PAGE =
  "drawn by the page itself (modern-screenshot: DOM → SVG foreignObject → canvas), because Electrobun has no capture API";

const sendToPreview = (message: Record<string, unknown>) =>
  webview?.executeJavascript(
    `window.__upstartEditorReceive && window.__upstartEditorReceive(${JSON.stringify(message)})`,
  );

const shell: ShellBridge = {
  name: "electrobun",
  previewUrl: info.previewUrl,
  versions: info.versions,
  selftest: info.selftest,

  // The preview is an <electrobun-webview>: a native webview that Electrobun
  // keeps positioned over this element.
  mountPreview(container) {
    const tag = document.createElement("electrobun-webview") as WebviewTag;
    tag.setAttribute("src", `${info.previewUrl}?${info.previewQuery}`);
    tag.setAttribute("preload", "views://previewpreload/index.js");
    // The tag does not follow the build's default renderer by itself.
    tag.setAttribute("renderer", info.renderer);
    // sandbox: the page gets no RPC to the main process, only the one-way
    // message channel the editing script reports through.
    tag.setAttribute("sandbox", "");
    tag.style.cssText = "display:block;width:100%;height:100%;";
    // Electrobun creates the native webview from a requestAnimationFrame
    // callback, which WebKit never runs while the window is not being
    // displayed (hidden, minimised, screen locked). Start it ourselves if
    // that has not happened shortly after mounting, and make sure it only
    // ever starts once.
    const init = (tag as any).initWebview.bind(tag);
    let started = false;
    (tag as any).initWebview = () => {
      if (started) return;
      started = true;
      return init();
    };
    container.appendChild(tag);
    setTimeout(() => (tag as any).initWebview(), 400);
    tag.on("host-message", (event) => onPreviewMessage(event.detail));
    webview = tag;
  },
  onPreviewEvent: (listener) => void previewListeners.push(listener),
  sendToPreview,
  loadPreview: (url) => webview?.loadURL(url),

  captureMethods: ["in-page", "in-page-full"],
  capturePreview(how = "in-page") {
    return new Promise<CaptureResult>((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      captures.set(id, { parts: [], resolve, name: how });
      sendToPreview({ type: "capture", id, fullPage: how === "in-page-full" });
      setTimeout(() => {
        if (captures.delete(id)) resolve({ ok: false, method: IN_PAGE, error: "no answer from the preview after 20 s" });
      }, 20_000);
    });
  },

  agentTurn: (prompt) => view.rpc!.request.agentTurn({ prompt }),
  onAgentEvent: (listener) => void agentListeners.push(listener),

  mark: (name) => view.rpc!.send.mark({ name }),
  report: (result) => view.rpc!.send.report(result),
};

mount(shell);

// Diagnostic for the spike: does an answer that takes a while still reach
// this interface? (SPIKE_SELFTEST=sleep)
if (info.selftest?.includes("sleep")) {
  for (const [ms, chatter] of [[1500, 0], [4000, 0], [8000, 0], [8000, 6]] as const) {
    shell.mark(`sleep-${ms}-${chatter}-asked`);
    await view.rpc!.request.sleep({ ms, chatter });
    shell.mark(`sleep-${ms}-${chatter}-answered`);
  }
  shell.mark(`sleep-done-${document.visibilityState}`);
}
