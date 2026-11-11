// Main-process side of the IPC contract. A channel answers only messages that
// come from the main frame of one of the interface's own windows (the app's
// window, the settings window): a page loaded anywhere else in the app (the
// preview) cannot call it. Events go to every one of those windows.
import { type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent, ipcMain } from "electron";
import type { EventChannel, Events, InvokeChannel, Invokes, SendChannel, Sends } from "../shared/ipc";

export function createIpc(windows: () => BrowserWindow[]) {
  const open = () => windows().filter((w) => !w.isDestroyed());
  const fromInterface = (event: IpcMainEvent | IpcMainInvokeEvent) =>
    open().some((w) => event.sender === w.webContents && event.senderFrame === w.webContents.mainFrame);

  return {
    handle<C extends InvokeChannel>(
      channel: C,
      fn: (...args: Parameters<Invokes[C]>) => ReturnType<Invokes[C]> | Promise<Awaited<ReturnType<Invokes[C]>>>,
    ) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!fromInterface(event)) throw new Error(`Refused: ${channel} is for the app's interface`);
        return fn(...(args as Parameters<Invokes[C]>));
      });
    },
    on<C extends SendChannel>(channel: C, fn: (...args: Parameters<Sends[C]>) => void) {
      ipcMain.on(channel, (event, ...args) => {
        if (fromInterface(event)) fn(...(args as Parameters<Sends[C]>));
      });
    },
    emit<C extends EventChannel>(channel: C, ...args: Parameters<Events[C]>) {
      for (const w of open()) w.webContents.send(channel, ...args);
    },
  };
}

export type Ipc = ReturnType<typeof createIpc>;
