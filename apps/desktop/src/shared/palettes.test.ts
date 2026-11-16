import { STATUS_TEXT_AT, STATUS_TONES } from "@upstart/runtime";
import { expect, test } from "vitest";
import { contrast, PALETTES, parseColor, READ_TOGETHER } from "./palettes";

test("colours are read from hex, rgb and oklch notations", () => {
  expect(parseColor("#fff")).toEqual([255, 255, 255, 1]);
  expect(parseColor("#9A3412")).toEqual([154, 52, 18, 1]);
  expect(parseColor("rgb(10, 20, 30)")).toEqual([10, 20, 30, 1]);
  expect(parseColor("rgba(10 20 30 / 0.5)")).toEqual([10, 20, 30, 0.5]);
  // OKLCH, as the templates write it: sRGB's red, white and black, a color's alpha.
  expect(parseColor("oklch(0.628 0.2577 29.23)")).toEqual([255, 0, 0, 1]);
  expect(parseColor("oklch(1 0 0)")).toEqual([255, 255, 255, 1]);
  expect(parseColor("oklch(0% 0 none)")).toEqual([0, 0, 0, 1]);
  expect(parseColor("oklch(0.9 0.2 125 / 50%)")?.[3]).toBe(0.5);
});

test("contrast is WCAG's ratio", () => {
  expect(contrast("#000", "#fff")).toBeCloseTo(21, 5);
  expect(contrast("#fff", "#fff")).toBeCloseTo(1, 5);
  expect(contrast("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
});

test("twelve palettes, every text readable on its background", () => {
  expect(PALETTES).toHaveLength(12);
  expect(new Set(PALETTES.map((p) => p.id)).size).toBe(12);
  for (const p of PALETTES)
    for (const [bg, text] of READ_TOGETHER) {
      const ratio = contrast(p.colors[bg], p.colors[text]);
      // Body text on the surfaces reads at 4.5; a button's label is large and bold.
      expect(ratio, `${p.id}: ${text} on ${bg}`).toBeGreaterThanOrEqual(bg.includes("surface") ? 7 : 4.5);
    }
});

// The status colors as the browser derives them from the background (Q225).
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function oklabL(hex: string): number {
  const [r, g, b] = parseColor(hex)!
    .slice(0, 3)
    .map((v) => toLinear(v / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}
function oklchHex(L: number, C: number, h: number): string {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, fromLinear(v))) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

test("the status colors, derived from each palette's background, read with their text and on the page", () => {
  for (const p of PALETTES) {
    const surface = p.colors["--theme-color-surface"];
    for (const tone of STATUS_TONES) {
      const L = tone.from - tone.by * oklabL(surface);
      const color = oklchHex(L, tone.chroma, tone.hue);
      const text = oklchHex(L < STATUS_TEXT_AT ? 0.99 : 0.2, 0.02, tone.hue);
      expect(contrast(color, text), `${p.id}: ${tone.name}-content on ${tone.name}`).toBeGreaterThanOrEqual(4.5);
      // An alert or a badge stands out from the page; a warning is meant light, with dark text.
      const apart = tone.name === "warning" && !p.dark ? 1.9 : 3;
      expect(contrast(color, surface), `${p.id}: ${tone.name} on the surface`).toBeGreaterThanOrEqual(apart);
    }
  }
});
