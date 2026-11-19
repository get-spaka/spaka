// Preload of the app's window. It runs in an isolated world and gives the
// interface a narrow bridge: only the channels listed in the IPC contract.
import { contextBridge, ipcRenderer, webUtils } from "electron";
import { type Bridge, channels } from "../shared/ipc";

const allowed = {
  invoke: new Set<string>(channels.invoke),
  send: new Set<string>(channels.send),
  events: new Set<string>(channels.events),
};

function check(kind: keyof typeof allowed, channel: string) {
  if (!allowed[kind].has(channel)) throw new Error(`Channel not allowed: ${channel}`);
}

const bridge: Bridge = {
  invoke: (channel, ...args) => {
    try {
      check("invoke", channel);
    } catch (error) {
      return Promise.reject(error);
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  send: (channel, ...args) => {
    check("send", channel);
    ipcRenderer.send(channel, ...args);
  },
  on: (channel, listener) => {
    check("events", channel);
    const wrapped = (_event: unknown, ...args: unknown[]) => (listener as (...a: unknown[]) => void)(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.off(channel, wrapped);
  },
  pathOf: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld("upstart", bridge);

// The interface makes room for the window's own buttons where the system puts them.
if (process.platform === "win32")
  window.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("platform-win"));
