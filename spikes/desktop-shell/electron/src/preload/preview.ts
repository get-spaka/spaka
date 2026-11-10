// Preload of the preview. With contextIsolation on, Electron runs it in a
// JavaScript world of its own: it shares the DOM with the page and nothing
// else. That is the isolation criterion 2 asks for.
import { ipcRenderer } from "electron";
import { installEditor } from "../../../shared/editing/editor.js";

installEditor({
  send: (message) => ipcRenderer.send("preview:event", message),
  onMessage: (handler) => ipcRenderer.on("editor:message", (_event, message) => handler(message)),
});
