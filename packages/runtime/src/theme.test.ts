import { expect, test } from "vitest";
import { BRIDGE_CSS, repairCss, TAILWIND_THEME, THEME_VARIABLES } from "./theme.ts";

test("repairs a stylesheet that is still being written", () => {
  expect(repairCss(":root {\n  --a: #fff;\n  --b: #1a")).toBe(":root {\n  --a: #fff;}");
  expect(repairCss('@import url("https://fonts.example/css?family=Fra')).toBe("");
  expect(repairCss(":root { --a: 1; }\n/* half a comm")).toBe(":root { --a: 1; }");
  expect(repairCss(":root { --a: 1; }")).toBe(":root { --a: 1; }");
});

test("the bridge points daisyUI and Tailwind at the fifteen theme variables", () => {
  expect(THEME_VARIABLES).toHaveLength(15);
  expect(BRIDGE_CSS).toContain("--color-primary: var(--theme-color-primary, #4f46e5);");
  expect(TAILWIND_THEME).toContain("--font-heading: var(--theme-font-heading,");
});
