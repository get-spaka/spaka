// The theme: about fifteen core values every project defines in theme.css
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

/** The core variables a theme.css defines. */
export const THEME_VARIABLES = [
  ...THEME_MAP.map(([, theme]) => theme),
  "--theme-font-heading",
  "--theme-font-body",
] as const;

const FONT_FALLBACK = 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"';

/** Plain CSS: daisyUI's variables pointed at the theme's, and the fonts. */
export const BRIDGE_CSS = `/* daisyUI's variables pointed at the theme's */
:root {
${THEME_MAP.map(([d, t, f]) => `  ${d}: var(${t}, ${f});`).join("\n")}
  --radius-field: calc(var(--radius-box) * 0.5);
  --radius-selector: calc(var(--radius-box) * 0.5);
}
body { font-family: var(--theme-font-body, ${FONT_FALLBACK}); background-color: var(--color-base-100); color: var(--color-base-content); }
h1, h2, h3, h4 { font-family: var(--theme-font-heading, var(--theme-font-body, ${FONT_FALLBACK})); }
`;

/** Tailwind's `@theme`: the same names as utilities (bg-primary, rounded-box, font-heading…). */
export const TAILWIND_THEME = `@theme inline {
${THEME_MAP.map(([d, t, f]) => `  ${d}: var(${t}, ${f});`).join("\n")}
  --radius-field: calc(var(--theme-radius, 0.75rem) * 0.5);
  --radius-selector: calc(var(--theme-radius, 0.75rem) * 0.5);
  --font-heading: var(--theme-font-heading, ${FONT_FALLBACK});
  --font-body: var(--theme-font-body, ${FONT_FALLBACK});
}`;

/** A stylesheet that is still being written: keep the finished declarations, close the open blocks. */
export function repairCss(css: string): string {
  let cut = Math.max(css.lastIndexOf(";"), css.lastIndexOf("}"), css.lastIndexOf("{")) + 1;
  const openComment = css.lastIndexOf("/*");
  if (openComment >= 0 && css.indexOf("*/", openComment) < 0) cut = Math.min(cut, openComment);
  const kept = css.slice(0, cut);
  const depth = (kept.match(/{/g)?.length ?? 0) - (kept.match(/}/g)?.length ?? 0);
  return kept + "}".repeat(Math.max(0, depth));
}
