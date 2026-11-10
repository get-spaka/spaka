// What the runtime puts into the <head> of every page of the preview: the
// libraries a project is written for (ADR 0004, ADR 0006) and its theme.
// Projects never load them themselves.
import { BRIDGE_CSS, TAILWIND_THEME } from "./theme.ts";

/** The libraries the preview serves, by file name, with the package file each comes from. */
export const VENDOR = {
  "daisyui.css": { module: "daisyui/daisyui.css", type: "text/css" },
  "tailwind.js": { module: "@tailwindcss/browser", type: "text/javascript" },
  "htmx.js": { module: "htmx.org/dist/htmx.js", type: "text/javascript" },
} as const;

/**
 * The preview's head. Tailwind is compiled in the page by its browser build,
 * so a class the agent has just written is styled at once; an export compiles
 * the stylesheet instead. Every element carries data-up-runtime, so that the
 * preview tells them apart from the page's own.
 */
export function previewHead({ vendorBase, theme }: { vendorBase: string; theme: string }): string {
  const base = vendorBase.replace(/\/$/, "");
  return [
    `<meta charset="utf-8" data-up-runtime>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" data-up-runtime>`,
    `<link rel="stylesheet" href="${base}/daisyui.css" data-up-runtime>`,
    `<style id="up-theme" data-up-runtime>${theme}</style>`,
    `<style id="up-bridge" data-up-runtime>${BRIDGE_CSS}</style>`,
    `<style type="text/tailwindcss" data-up-runtime>${TAILWIND_THEME}</style>`,
    `<script src="${base}/tailwind.js" data-up-runtime></script>`,
    `<script src="${base}/htmx.js" data-up-runtime></script>`,
  ].join("");
}
