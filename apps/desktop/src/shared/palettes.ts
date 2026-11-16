// The theme's ready-made palettes (Q93): the twelve colours of a theme, each
// pair of a colour and its -content readable together, and the contrast
// measure the Theme tab and the gallery's checks use.

export type PaletteColors = {
  "--theme-color-primary": string;
  "--theme-color-primary-content": string;
  "--theme-color-secondary": string;
  "--theme-color-secondary-content": string;
  "--theme-color-accent": string;
  "--theme-color-accent-content": string;
  "--theme-color-neutral": string;
  "--theme-color-neutral-content": string;
  "--theme-color-surface": string;
  "--theme-color-surface-alt": string;
  "--theme-color-border": string;
  "--theme-color-text": string;
};
export type Palette = { id: string; name: string; dark: boolean; colors: PaletteColors };

const palette = (
  id: string,
  name: string,
  dark: boolean,
  [primary, primaryContent, secondary, secondaryContent, accent, accentContent, neutral, neutralContent]: string[],
  [surface, surfaceAlt, border, text]: string[],
): Palette => ({
  id,
  name,
  dark,
  colors: {
    "--theme-color-primary": primary!,
    "--theme-color-primary-content": primaryContent!,
    "--theme-color-secondary": secondary!,
    "--theme-color-secondary-content": secondaryContent!,
    "--theme-color-accent": accent!,
    "--theme-color-accent-content": accentContent!,
    "--theme-color-neutral": neutral!,
    "--theme-color-neutral-content": neutralContent!,
    "--theme-color-surface": surface!,
    "--theme-color-surface-alt": surfaceAlt!,
    "--theme-color-border": border!,
    "--theme-color-text": text!,
  },
});

export const PALETTES: Palette[] = [
  palette(
    "paper",
    "Paper",
    false,
    ["#4f46e5", "#ffffff", "#be185d", "#ffffff", "#0f766e", "#ffffff", "#27272a", "#fafafa"],
    ["#ffffff", "#f4f4f5", "#e4e4e7", "#18181b"],
  ),
  palette(
    "bakery",
    "Bakery",
    false,
    ["#9a3412", "#fff7ed", "#92400e", "#fffbeb", "#4d7c0f", "#f7fee7", "#292524", "#fafaf9"],
    ["#fffbeb", "#fef3c7", "#fde68a", "#292524"],
  ),
  palette(
    "forest",
    "Forest",
    false,
    ["#166534", "#f0fdf4", "#a16207", "#fefce8", "#0e7490", "#ecfeff", "#1c1917", "#f5f5f4"],
    ["#fafaf9", "#eef3ea", "#d6e0d0", "#1c2a1e"],
  ),
  palette(
    "ocean",
    "Ocean",
    false,
    ["#0369a1", "#f0f9ff", "#0f766e", "#f0fdfa", "#f59e0b", "#1c1917", "#0f172a", "#f1f5f9"],
    ["#ffffff", "#f0f7fc", "#d6e4f0", "#0f172a"],
  ),
  palette(
    "rose",
    "Rose",
    false,
    ["#be123c", "#fff1f2", "#6d28d9", "#f5f3ff", "#0e7490", "#ecfeff", "#3f1d2b", "#fdf2f8"],
    ["#fffafb", "#ffe4e6", "#fecdd3", "#3f1d2b"],
  ),
  palette(
    "sand",
    "Sand",
    false,
    ["#44403c", "#fafaf9", "#d6d3d1", "#1c1917", "#b45309", "#fffbeb", "#1c1917", "#f5f5f4"],
    ["#faf8f5", "#f1ede6", "#e2dcd2", "#292524"],
  ),
  palette(
    "citrus",
    "Citrus",
    false,
    ["#c2410c", "#ffffff", "#4d7c0f", "#ffffff", "#facc15", "#422006", "#1f2937", "#f9fafb"],
    ["#fffdf5", "#fef9c3", "#fde68a", "#1f2937"],
  ),
  palette(
    "lavender",
    "Lavender",
    false,
    ["#6d28d9", "#ffffff", "#be185d", "#ffffff", "#0f766e", "#ffffff", "#2e1065", "#f5f3ff"],
    ["#fdfcff", "#f3efff", "#e4dcfa", "#1e1b2e"],
  ),
  palette(
    "slate",
    "Slate",
    false,
    ["#1d4ed8", "#ffffff", "#334155", "#f8fafc", "#0e7490", "#ffffff", "#0f172a", "#f8fafc"],
    ["#ffffff", "#f8fafc", "#e2e8f0", "#0f172a"],
  ),
  palette(
    "mono",
    "Mono",
    false,
    ["#18181b", "#fafafa", "#52525b", "#fafafa", "#dc2626", "#ffffff", "#09090b", "#fafafa"],
    ["#ffffff", "#f4f4f5", "#d4d4d8", "#09090b"],
  ),
  palette(
    "midnight",
    "Midnight",
    true,
    ["#818cf8", "#1e1b4b", "#f472b6", "#500724", "#2dd4bf", "#042f2e", "#030712", "#e5e7eb"],
    ["#111827", "#1f2937", "#374151", "#e5e7eb"],
  ),
  palette(
    "espresso",
    "Espresso",
    true,
    ["#f59e0b", "#1c1206", "#fb7185", "#2a0a12", "#a3e635", "#1a2e05", "#0c0a09", "#e7e5e4"],
    ["#1c1917", "#292524", "#44403c", "#f5f5f4"],
  ),
];

/** An sRGB colour, 0–255 a channel, from #rgb, #rrggbb, rgb() or rgba(). */
export function parseColor(text: string): [number, number, number, number] | undefined {
  const t = text.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)).concat(1) as [
      number,
      number,
      number,
      number,
    ];
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(t)?.[1];
  if (rgb) {
    const parts = rgb
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n)))
      return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
  }
  // The templates write their colors in OKLCH: turned into sRGB, clamped to it.
  const oklch = /^oklch\(([^)]+)\)$/.exec(t)?.[1];
  if (oklch) {
    const [l, c, h, a] = oklch.split(/[\s/]+/).filter(Boolean);
    const number = (v: string | undefined, percent: number) =>
      v === undefined || v === "none"
        ? 0
        : v.endsWith("%")
          ? (Number.parseFloat(v) / 100) * percent
          : Number.parseFloat(v);
    const L = number(l, 1);
    const C = number(c, 0.4);
    const H = (number(h?.replace(/deg$/, ""), 1) * Math.PI) / 180;
    if (![L, C, H].every(Number.isFinite)) return undefined;
    const [A, B] = [C * Math.cos(H), C * Math.sin(H)];
    const lms = [
      L + 0.3963377774 * A + 0.2158037573 * B,
      L - 0.1055613458 * A - 0.0638541728 * B,
      L - 0.0894841775 * A - 1.291485548 * B,
    ].map((v) => v ** 3) as [number, number, number];
    const linear = [
      4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
      -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
      -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
    ];
    const [r, g, b] = linear.map((v) => {
      const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, s)) * 255);
    }) as [number, number, number];
    return [r, g, b, a === undefined ? 1 : number(a, 1)];
  }
  return undefined;
}

function luminance([r, g, b]: number[]): number {
  const [R, G, B] = [r!, g!, b!].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R! + 0.7152 * G! + 0.0722 * B!;
}

/** WCAG's contrast ratio between two opaque colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return 21;
  const [l1, l2] = [luminance(x), luminance(y)].sort((m, n) => n - m);
  return (l1! + 0.05) / (l2! + 0.05);
}

/** The pairs of a theme that are read together: text on its background. */
export const READ_TOGETHER: [background: keyof PaletteColors, text: keyof PaletteColors][] = [
  ["--theme-color-surface", "--theme-color-text"],
  ["--theme-color-surface-alt", "--theme-color-text"],
  ["--theme-color-primary", "--theme-color-primary-content"],
  ["--theme-color-secondary", "--theme-color-secondary-content"],
  ["--theme-color-accent", "--theme-color-accent-content"],
  ["--theme-color-neutral", "--theme-color-neutral-content"],
];
