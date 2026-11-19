// The system the app runs on, for what the interface names after it: the
// file manager, the system's own name, the shortcuts' modifiers.

/** Whether the app runs on macOS: in the main process from Node, in the interface from its browser. */
export const IS_MAC =
  typeof process !== "undefined" && typeof process.platform === "string"
    ? process.platform === "darwin"
    : !/Windows/.test(globalThis.navigator?.userAgent ?? "");

/** The system's own name. */
export const SYSTEM_NAME = IS_MAC ? "macOS" : "Windows";

/** Where the system shows a folder's files. */
export const FILE_MANAGER = IS_MAC ? "Finder" : "File Explorer";
