import { expect, test } from "vitest";
import { BRIDGE_CSS, lightnessOf, repairCss, TAILWIND_THEME, THEME_VARIABLES, themeStyle } from "./theme.ts";

test("repairs a stylesheet that is still being written", () => {
  expect(repairCss(":root {\n  --a: #fff;\n  --b: #1a")).toBe(":root {\n  --a: #fff;}");
  expect(repairCss('@import url("https://fonts.example/css?family=Fra')).toBe("");
  expect(repairCss(":root { --a: 1; }\n/* half a comm")).toBe(":root { --a: 1; }");
  expect(repairCss(":root { --a: 1; }")).toBe(":root { --a: 1; }");
});

test("the bridge points daisyUI and Tailwind at the nineteen theme variables", () => {
  expect(THEME_VARIABLES).toHaveLength(19);
  expect(BRIDGE_CSS).toContain("--color-primary: var(--theme-color-primary, #4f46e5);");
  expect(TAILWIND_THEME).toContain("--font-heading: var(--theme-font-heading,");
});

test("the style values fall back to the look a site had before them (Q226)", () => {
  expect(BRIDGE_CSS).toContain("--radius-field: var(--theme-radius-field, calc(var(--radius-box) * 0.5));");
  expect(BRIDGE_CSS).toContain("--depth: var(--theme-depth, 1);");
  expect(BRIDGE_CSS).toContain("--size-field: var(--theme-size, 0.25rem);");
  expect(BRIDGE_CSS).toContain("--size-selector: var(--theme-size, 0.25rem);");
  expect(BRIDGE_CSS).toContain("--border: var(--theme-border, 1px);");
  expect(TAILWIND_THEME).toContain("--radius-field: var(--theme-radius-field,");
});

test("the status colors are derived from the background, in daisyUI's names and Tailwind's (Q225)", () => {
  for (const css of [BRIDGE_CSS, TAILWIND_THEME])
    for (const name of ["info", "success", "warning", "error"]) {
      expect(css).toContain(`--color-${name}: oklch(from var(--theme-color-surface, #ffffff) calc(`);
      expect(css).toContain(`--color-${name}-content: oklch(from var(--color-${name}) clamp(`);
    }
});

test("a color's lightness, in the usual notations", () => {
  expect(lightnessOf("#fff")).toBeCloseTo(1, 3);
  expect(lightnessOf("#000000")).toBe(0);
  expect(lightnessOf("#18181bff")).toBeLessThan(0.3);
  expect(lightnessOf("rgb(250 250 249)")).toBeGreaterThan(0.95);
  expect(lightnessOf("rgba(10, 10, 10, 1)")).toBeLessThan(0.2);
  expect(lightnessOf("oklch(21% 0.01 260)")).toBeCloseTo(0.21);
  expect(lightnessOf("oklch(0.93 0.01 260)")).toBeCloseTo(0.93);
  expect(lightnessOf("hsl(220 20% 12%)")).toBeCloseTo(0.12);
  expect(lightnessOf("var(--x)")).toBeUndefined();
});

test("a page shows the theme with the color scheme its background calls for, light when unknown", () => {
  expect(themeStyle(":root { --theme-color-surface: #0f172a; }")).toMatch(/color-scheme: dark;/);
  expect(themeStyle(":root { --theme-color-surface: #ffffff; }")).toMatch(/color-scheme: light;/);
  expect(themeStyle(":root { --theme-color-surface: var(--brand); }")).toMatch(/color-scheme: light;/);
  expect(themeStyle("")).toMatch(/color-scheme: light;/);
  expect(themeStyle(":root { --a: 1; }")).toMatch(/^:root \{ --a: 1; \}\n/);
});
