import type { Bridge } from "../../shared/ipc";

/** The main process, through the preload's narrow bridge. */
export const upstart = (window as unknown as { upstart: Bridge }).upstart;
