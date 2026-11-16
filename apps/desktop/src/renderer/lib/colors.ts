// The interface's few colors that stay the same in light and dark: the
// settings' category tiles and the account's picture (after macOS System
// Settings), the window's close button, a device's bezel around the preview
// and the white of a page while it is drawn. Every other color is a token of
// renderer/index.css; colors.test.ts keeps it so.

/** A settings category's tile, its picture in white. */
export const TILES = {
  general: "bg-[#8e8e93] text-white",
  agent: "bg-[#d97757] text-white",
  skills: "bg-[#8b5cf6] text-white",
  connectors: "bg-[#2f7cf6] text-white",
  privacy: "bg-[#1f9d55] text-white",
  about: "bg-[#737373] text-white",
} as const;

/** The account's round picture, in the agent tile's color. */
export const ACCOUNT = "bg-[#d97757] text-white";

/** macOS's red close button, and its cross shown on hover. */
export const CLOSE_BUTTON = "bg-[#ff5f57] ring-black/10";
export const CLOSE_CROSS = "text-black/60";

/** A tablet's or a phone's bezel around the page. */
export const BEZEL = "bg-zinc-800 ring-black/10";

/** A page's white while its picture stands in for it. */
export const PAGE_WHITE = "bg-white";
