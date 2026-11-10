// The editing script as Electrobun injects it into the preview.
//
// Electrobun 2.0.6 has no isolated world for preload scripts: this code runs
// in the page's own JavaScript world, next to the page's scripts. What keeps
// the two apart is only this file being wrapped in a function, and the
// overlay living in a closed shadow root.
import { domToPng } from "modern-screenshot";
import { installEditor } from "../../../shared/editing/editor.js";

type Receive = (message: unknown) => void;
const w = window as unknown as {
  __electrobunSendToHost?: (message: unknown) => void;
  __upstartEditorReceive?: Receive;
};

const pending: unknown[] = [];
function send(message: unknown) {
  if (w.__electrobunSendToHost) w.__electrobunSendToHost(message);
  else pending.push(message);
}
// The bridge is installed by Electrobun's own preload; flush once it is there.
const flush = setInterval(() => {
  if (!w.__electrobunSendToHost) return;
  clearInterval(flush);
  for (const message of pending.splice(0)) w.__electrobunSendToHost(message);
}, 10);

const editor = installEditor({
  send,
  // The app reaches this script by evaluating a call to a global in the page.
  onMessage: (handler: Receive) => {
    w.__upstartEditorReceive = handler;
  },
});

// Capture workaround: Electrobun has no API that turns a webview into an
// image, so the page draws itself (DOM -> SVG foreignObject -> canvas -> PNG)
// and sends the result back in slices.
editor.handle("capture", async (message: { id: string; fullPage?: boolean }) => {
  const started = performance.now();
  try {
    const root = document.documentElement;
    const width = root.clientWidth;
    const height = message.fullPage ? root.scrollHeight : window.innerHeight;
    const dataUrl = await domToPng(root, {
      width,
      height,
      scale: window.devicePixelRatio,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      style: message.fullPage ? undefined : { transform: `translateY(-${window.scrollY}px)` },
      filter: (node) => !(node instanceof Element && node.hasAttribute("data-upstart-overlay")),
    });
    const SLICE = 200_000;
    const total = Math.ceil(dataUrl.length / SLICE);
    for (let i = 0; i < total; i++) {
      editor.send("capture-slice", {
        id: message.id,
        index: i,
        total,
        data: dataUrl.slice(i * SLICE, (i + 1) * SLICE),
        width: Math.round(width * window.devicePixelRatio),
        height: Math.round(height * window.devicePixelRatio),
        ms: Math.round(performance.now() - started),
      });
    }
  } catch (error) {
    editor.send("capture-failed", { id: message.id, error: String(error) });
  }
});
