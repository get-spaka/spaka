import type { Bridge } from "../../shared/ipc";

/** The main process, through the preload's narrow bridge. */
export const spaka = (window as unknown as { spaka: Bridge }).spaka;
