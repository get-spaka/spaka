// The theme: about twenty core values every project defines in theme.css
// (ADR 0006), and the bridge that points daisyUI's and Tailwind's names at
// them, so that `btn-primary`, `bg-base-200` or `font-heading` follow the theme.

/** daisyUI variable, theme variable, fallback used before theme.css exists. */
export const THEME_MAP: readonly (readonly [daisy: string, theme: string, fallback: string])[] = [
  ["--color-base-100", "--theme-color-surface", "#ffffff"],
  ["--color-base-200", "--theme-color-surface-alt", "#f4f4f5"],
  ["--color-base-300", "--theme-color-border", "#e4e4e7"],
  ["--color-base-content", "--theme-color-text", "#18181b"],
  ["--color-primary", "--theme-color-primary", "#4f46e5"],
  ["--color-primary-content", "--theme-color-primary-content", "#ffffff"],
  ["--color-secondary", "--theme-color-secondary", "#db2777"],
  ["--color-secondary-content", "--theme-color-secondary-content", "#ffffff"],
  ["--color-accent", "--theme-color-accent", "#0d9488"],
  ["--color-accent-content", "--theme-color-accent-content", "#ffffff"],
  ["--color-neutral", "--theme-color-neutral", "#27272a"],
  ["--color-neutral-content", "--theme-color-neutral-content", "#fafafa"],
  ["--radius-box", "--theme-radius", "0.75rem"],
];

/**
 * The theme's style values beside its colors (Q225-Q228): the corners of
 * buttons and fields (square 0rem, like the rest, or a 9999px pill), relief
 * (0 flat, 1 raised), density (the base size of buttons and fields, 0.25rem
 * normal) and the width of borders. Absent, a site looks as it did before.
 */
export const STYLE_MAP: readonly (readonly [daisy: string, theme: string, fallback: string])[] = [
  ["--radius-field", "--theme-radius-field", "calc(var(--radius-box) * 0.5)"],
  ["--depth", "--theme-depth", "1"],
  ["--size-field", "--theme-size", "0.25rem"],
  ["--size-selector", "--theme-size", "0.25rem"],
  ["--border", "--theme-border", "1px"],
];

/**
 * The status colors (info, success, warning, error), derived from the
 * theme's background (Q225): a fixed hue each, their lightness following the
 * background's so that they belong to it and read on it, and their text
 * black or white, whichever reads on them. Relative colors, computed by the
 * browser: a palette changed in the Theme tab carries them along.
 */
export const STATUS_TONES: readonly {
  name: string;
  /** Its lightness, `from - by` times the background's. */
  from: number;
  by: number;
  chroma: number;
  hue: number;
}[] = [
  { name: "info", from: 0.76, by: 0.23, chroma: 0.14, hue: 245 },
  { name: "success", from: 0.76, by: 0.23, chroma: 0.14, hue: 150 },
  { name: "warning", from: 0.85, by: 0.08, chroma: 0.16, hue: 75 },
  { name: "error", from: 0.76, by: 0.23, chroma: 0.18, hue: 27 },
];
/** A status color's text is near white below this lightness, near black above. */
export const STATUS_TEXT_AT = 0.66;
const SURFACE = "var(--theme-color-surface, #ffffff)";
export const STATUS_COLORS: readonly (readonly [name: string, value: string])[] = STATUS_TONES.flatMap(
  ({ name, from, by, chroma, hue }) => [
    [`--color-${name}`, `oklch(from ${SURFACE} calc(${from} - ${by} * l) ${chroma} ${hue})`],
    [
      `--color-${name}-content`,
      `oklch(from var(--color-${name}) clamp(0.2, (${STATUS_TEXT_AT} - l) * 1000, 0.99) 0.02 h)`,
    ],
  ],
);

/** The core variables a theme.css defines. */
export const THEME_VARIABLES = [
  ...THEME_MAP.map(([, theme]) => theme),
  "--theme-radius-field",
  "--theme-depth",
  "--theme-size",
  "--theme-border",
  "--theme-font-heading",
  "--theme-font-body",
] as const;

const FONT_FALLBACK = 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"';

/** Plain CSS: daisyUI's variables pointed at the theme's, and the fonts. */
export const BRIDGE_CSS = `/* daisyUI's variables pointed at the theme's */
:root {
${[...THEME_MAP, ...STYLE_MAP].map(([d, t, f]) => `  ${d}: var(${t}, ${f});`).join("\n")}
  --radius-selector: calc(var(--radius-box) * 0.5);
${STATUS_COLORS.map(([d, v]) => `  ${d}: ${v};`).join("\n")}
}
body { font-family: var(--theme-font-body, ${FONT_FALLBACK}); background-color: var(--color-base-100); color: var(--color-base-content); }
h1, h2, h3, h4 { font-family: var(--theme-font-heading, var(--theme-font-body, ${FONT_FALLBACK})); }
`;

/** Tailwind's `@theme`: the same names as utilities (bg-primary, rounded-box, font-heading…). */
export const TAILWIND_THEME = `@theme inline {
${THEME_MAP.map(([d, t, f]) => `  ${d}: var(${t}, ${f});`).join("\n")}
  --radius-field: var(--theme-radius-field, calc(var(--theme-radius, 0.75rem) * 0.5));
  --radius-selector: calc(var(--theme-radius, 0.75rem) * 0.5);
${STATUS_COLORS.map(([d, v]) => `  ${d}: ${v};`).join("\n")}
  --font-heading: var(--theme-font-heading, ${FONT_FALLBACK});
  --font-body: var(--theme-font-body, ${FONT_FALLBACK});
}`;

/**
 * The theme as a page shows it: theme.css, and the color scheme its
 * background calls for, so that a dark site has dark scrollbars and form
 * controls (Q225). Never written into theme.css itself.
 */
export function themeStyle(css: string): string {
  const surface = /--theme-color-surface\s*:\s*([^;}]+)/.exec(css)?.[1]?.trim();
  const l = surface ? lightnessOf(surface) : undefined;
  return `${css}\n:root { color-scheme: ${l !== undefined && l < 0.5 ? "dark" : "light"}; }\n`;
}

/** A color's perceived lightness, 0 to 1, for the common notations; none for another. */
export function lightnessOf(color: string): number | undefined {
  const c = color.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(c)?.[1];
  let rgb: number[] | undefined;
  if (hex) {
    const full = hex.length <= 4 ? [...hex.slice(0, 3)].map((x) => x + x).join("") : hex.slice(0, 6);
    rgb = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
  }
  const fn = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)/.exec(c);
  if (fn)
    rgb = fn.slice(1, 4).map((v) => (v!.endsWith("%") ? Number.parseFloat(v!) / 100 : Number.parseFloat(v!) / 255));
  if (rgb) {
    const lin = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const y = 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
    return Math.cbrt(y);
  }
  const ok = /^okl(?:ch|ab)\(\s*([\d.]+)(%?)/.exec(c);
  if (ok) return ok[2] ? Number.parseFloat(ok[1]!) / 100 : Number.parseFloat(ok[1]!);
  const hsl = /^hsla?\(\s*[\d.]+(?:deg)?[\s,]+[\d.]+%[\s,]+([\d.]+)%/.exec(c);
  if (hsl) return Number.parseFloat(hsl[1]!) / 100;
  if (c === "white") return 1;
  if (c === "black") return 0;
  return undefined;
}

/** A stylesheet that is still being written: keep the finished declarations, close the open blocks. */
export function repairCss(css: string): string {
  let cut = Math.max(css.lastIndexOf(";"), css.lastIndexOf("}"), css.lastIndexOf("{")) + 1;
  const openComment = css.lastIndexOf("/*");
  if (openComment >= 0 && css.indexOf("*/", openComment) < 0) cut = Math.min(cut, openComment);
  const kept = css.slice(0, cut);
  const depth = (kept.match(/{/g)?.length ?? 0) - (kept.match(/}/g)?.length ?? 0);
  return kept + "}".repeat(Math.max(0, depth));
}
