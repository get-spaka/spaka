import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readTheme, themeColors, writeTheme } from "./theme-file";

const agentTheme = `@import url("https://fonts.googleapis.com/css2?family=Fraunces&display=swap");

/* Chez Margot: warm, floury */
:root {
  --theme-color-primary: #9a3412;
  --theme-color-primary-content: #fff7ed;
  --theme-color-surface: #fffbeb; /* cream */
  --theme-font-heading: "Fraunces", Georgia, serif;
  --theme-radius: 0.75rem;
  --shadow-soft: 0 1px 2px rgb(0 0 0 / .1);
}

.hero-title { letter-spacing: -0.02em; }
`;

test("the core values are read from the theme's :root, comments and other variables aside", () => {
  expect(readTheme(agentTheme)).toEqual({
    "--theme-color-primary": "#9a3412",
    "--theme-color-primary-content": "#fff7ed",
    "--theme-color-surface": "#fffbeb",
    "--theme-font-heading": '"Fraunces", Georgia, serif',
    "--theme-radius": "0.75rem",
  });
  expect(readTheme("")).toEqual({});
});

test("values are changed where they are written; everything else stays as it was", () => {
  const out = writeTheme(agentTheme, { "--theme-color-primary": "#166534", "--theme-color-surface": "#fafaf9" });
  expect(out).toBe(
    agentTheme
      .replace("#9a3412", "#166534")
      .replace("--theme-color-surface: #fffbeb;", "--theme-color-surface: #fafaf9;"),
  );
  expect(writeTheme(agentTheme, { "--theme-color-primary": "#9a3412" })).toBe(agentTheme);
});

test("a value the theme lacks is added at the end of its block, with its indentation", () => {
  const out = writeTheme(agentTheme, { "--theme-color-accent": "#4d7c0f" });
  expect(out).toContain("  --shadow-soft: 0 1px 2px rgb(0 0 0 / .1);\n  --theme-color-accent: #4d7c0f;\n}");
  expect(readTheme(out)["--theme-color-accent"]).toBe("#4d7c0f");
  // A last declaration without its semicolon gets one.
  expect(writeTheme(":root { --theme-radius: 1rem }", { "--theme-color-text": "#111" })).toBe(
    ":root { --theme-radius: 1rem;\n  --theme-color-text: #111; }",
  );
  // Only the core values are written.
  expect(writeTheme(agentTheme, { "--evil": "x" } as never)).toBe(agentTheme);
});

test("with no :root yet, one is written", () => {
  expect(writeTheme("", { "--theme-radius": "1rem" })).toBe(":root {\n  --theme-radius: 1rem;\n}\n");
  expect(writeTheme(".a{}", { "--theme-radius": "1rem" })).toBe(".a{}\n\n:root {\n  --theme-radius: 1rem;\n}\n");
});

test("on a theme the agent wrote in a real run, reading and writing round-trips", () => {
  const css = readFileSync(
    join(
      __dirname,
      "../../../../../spikes/live-generation/runs/A-business-5-live-2026-11-09T22-22-50/project/theme.css",
    ),
    "utf8",
  );
  const values = readTheme(css);
  expect(Object.keys(values).length).toBeGreaterThanOrEqual(12);
  expect(writeTheme(css, values)).toBe(css);
  const changed = writeTheme(css, { "--theme-color-primary": "#123456" });
  expect(readTheme(changed)).toEqual({ ...values, "--theme-color-primary": "#123456" });
  expect(changed.length - css.length).toBe("#123456".length - values["--theme-color-primary"]!.length);
});

test("a theme's colours alone, or nothing when it has none", () => {
  const colors = themeColors(agentTheme)!;
  expect(Object.keys(colors).length).toBeGreaterThan(0);
  expect(Object.keys(colors).every((n) => n.startsWith("--theme-color-"))).toBe(true);
  expect(themeColors(":root { --theme-radius: 1rem; }")).toBeUndefined();
  expect(themeColors(undefined)).toBeUndefined();
});
