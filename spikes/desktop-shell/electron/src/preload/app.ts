// Preload of the app's window.
//
// In the main frame it exposes a narrow IPC surface to the interface.
//
// When the preview is an <iframe> (SPIKE_EMBED=iframe) the window is created
// with `nodeIntegrationInSubFrames`, and Electron then runs this same preload
// in every frame of the window, each time in an isolated world of that frame.
// In the preview's frame it installs the editing script instead. The page in
// that frame gets nothing: no `electronIpc`, no Node, no IPC.
import { contextBridge, ipcRenderer } from "electron";
import { installEditor } from "../../../shared/editing/editor.js";

// How many frames up the top window is. 0 = the app's interface, 1 = the
// preview, 2 and more = frames the project's page embeds itself.
let depth = 0;
for (let w: Window = window; w !== w.parent; w = w.parent) depth++;

if (depth === 0) {
  const allowed = /^(shell|preview|agent|spike):/;
  const check = (channel: string) => {
    if (!allowed.test(channel)) throw new Error(`channel not allowed: ${channel}`);
  };
  contextBridge.exposeInMainWorld("electronIpc", {
    invoke: (channel: string, ...args: unknown[]) => (check(channel), ipcRenderer.invoke(channel, ...args)),
    send: (channel: string, ...args: unknown[]) => (check(channel), ipcRenderer.send(channel, ...args)),
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      check(channel);
      ipcRenderer.on(channel, (_event, ...args) => listener(...args));
    },
  });
} else {
  // Tells the main process that the preload ran here (the spike counts them).
  ipcRenderer.send("spike:preload-ran", {
    depth,
    href: location.href,
    processIsMainFrame: (process as unknown as { isMainFrame?: boolean }).isMainFrame ?? null,
    contextIsolated: process.contextIsolated,
    sandboxed: process.sandboxed,
  });
  if (depth === 1) {
    const editor = installEditor({
      send: (message) => ipcRenderer.send("preview:event", message),
      onMessage: (handler) => ipcRenderer.on("editor:message", (_event, message) => handler(message)),
    });
    // Probe: this frame's preload asks for something only the interface may
    // ask for. The main process must refuse, because of where it comes from.
    ipcRenderer.invoke("shell:info").then(
      () => editor.send("interface-channel-probe", { answered: true }),
      (error) => editor.send("interface-channel-probe", { answered: false, refusal: String(error) }),
    );
  }
}
