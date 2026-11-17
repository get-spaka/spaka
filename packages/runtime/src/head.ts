// What the runtime puts into the <head> of every page of the preview: the
// libraries a project is written for (ADR 0004, ADR 0006) and its theme.
// Projects never load them themselves.
import { LAYER_ORDER } from "./layers.ts";
import { NO_ASSETS, type SiteAssets, STILL_CSS, scriptTags } from "./scripts.ts";
import { BRIDGE_CSS, TAILWIND_THEME, themeStyle } from "./theme.ts";

/**
 * The libraries the preview serves, by file name, with the package file each
 * comes from. daisyui.css is served with its components in the daisyui layer
 * (daisyuiBelowComponents), as in an export.
 */
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
export function previewHead({
  vendorBase,
  theme,
  assets = NO_ASSETS,
  styles = "",
}: {
  vendorBase: string;
  theme: string;
  /** The site's scripts (ADR 0011); its modules start only in visitor mode. */
  assets?: SiteAssets;
  /** The site's stylesheets, styles/*.css, compiled in the page with Tailwind's. */
  styles?: string;
}): string {
  const base = vendorBase.replace(/\/$/, "");
  return [
    `<meta charset="utf-8" data-up-runtime>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" data-up-runtime>`,
    `<style id="up-layers" data-up-runtime>${LAYER_ORDER}</style>`,
    `<link rel="stylesheet" href="${base}/daisyui.css" data-up-runtime>`,
    `<style id="up-theme" data-up-runtime>${themeStyle(theme)}</style>`,
    `<style id="up-bridge" data-up-runtime>${BRIDGE_CSS}</style>`,
    `<style id="up-still" data-up-runtime>${STILL_CSS}</style>`,
    `<style id="up-styles" type="text/tailwindcss" data-up-runtime>${tailwindStyle(styles)}</style>`,
    `<script src="${base}/tailwind.js" data-up-runtime></script>`,
    `<script src="${base}/htmx.js" data-up-runtime></script>`,
    ...scriptTags(assets, `${base}/${START_SCRIPT}`, { wait: true }),
  ].join("");
}

/** What the preview's Tailwind compiles beside the classes: the theme's names, then the site's stylesheets. */
export function tailwindStyle(styles: string): string {
  return styles ? `${TAILWIND_THEME}\n${styles}` : TAILWIND_THEME;
}

/** Upstart's start script (ADR 0011), served beside the libraries in the preview, in assets/ once exported. */
export const START_SCRIPT = "up-start.js";

/** Where an export puts the site's own assets: the compiled stylesheet and htmx. */
export const ASSETS = "assets";

/** The head of every page of an exported or published site: its compiled stylesheet, its theme, htmx, its scripts. */
export function exportHead(hasTheme: boolean, assets: SiteAssets = NO_ASSETS): string {
  return [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    hasTheme ? `<link rel="stylesheet" href="/theme.css">` : "",
    `<link rel="stylesheet" href="/${ASSETS}/site.css">`,
    `<script src="/${ASSETS}/htmx.js" defer></script>`,
    ...scriptTags(assets, `/${ASSETS}/${START_SCRIPT}`, { wait: false }),
  ].join("");
}
