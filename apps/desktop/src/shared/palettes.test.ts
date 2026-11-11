import { expect, test } from "vitest";
import { contrast, PALETTES, parseColor, READ_TOGETHER } from "./palettes";

test("colours are read from hex and rgb notations", () => {
  expect(parseColor("#fff")).toEqual([255, 255, 255, 1]);
  expect(parseColor("#9A3412")).toEqual([154, 52, 18, 1]);
  expect(parseColor("rgb(10, 20, 30)")).toEqual([10, 20, 30, 1]);
  expect(parseColor("rgba(10 20 30 / 0.5)")).toEqual([10, 20, 30, 0.5]);
  expect(parseColor("oklch(50% 0.1 200)")).toBeUndefined();
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
