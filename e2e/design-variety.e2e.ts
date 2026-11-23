import { expect, test } from "vitest";
import { luminance, themeTraits, varietyTable } from "./design-variety.ts";

const theme = `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond&display=swap');
:root {
  --theme-color-primary: #6E2231;
  --theme-color-surface: #FBF7F0;
  --theme-font-heading: 'Cormorant Garamond', Georgia, serif;
  --theme-font-body: "Plus Jakarta Sans", system-ui, sans-serif;
}`;

test("a theme's fonts and colors", () => {
  expect(themeTraits(theme)).toEqual({
    headingFont: "Cormorant Garamond",
    bodyFont: "Plus Jakarta Sans",
    surface: "#FBF7F0",
    primary: "#6E2231",
    dark: false,
  });
  expect(themeTraits(theme.replace("#FBF7F0", "#121212")).dark).toBe(true);
  expect(themeTraits("").headingFont).toBe("");
});

test("luminance", () => {
  expect(luminance("#000")).toBe(0);
  expect(luminance("#ffffff")).toBeCloseTo(1);
  expect(luminance("oklch(50% 0.1 20)")).toBe(1);
});

test("the variety table counts the different heroes and fonts", () => {
  const site = { heroQueries: [], seconds: 60, bodyFont: "Inter", surface: "#fff", primary: "#000", dark: false };
  const table = varietyTable("pi, before", [
    { ...site, brief: "a", hero: "hero-editorial", headingFont: "Fraunces" },
    { ...site, brief: "b", hero: "hero-editorial", headingFont: "Fraunces" },
    { ...site, brief: "c", hero: "hero-centered", headingFont: "Archivo", surface: "#111", dark: true },
  ]);
  expect(table).toContain("| c | hero-centered | Archivo / Inter | #111 (dark) | #000 | 60 s |");
  expect(table).toContain("3 websites: 2 different opening blocks, 2 heading fonts, 1 dark.");
});

test("the variety table says whether two businesses of one trade open differently (Q444)", () => {
  const site = {
    heroQueries: [],
    seconds: 60,
    headingFont: "Syne",
    bodyFont: "Inter",
    surface: "#fff",
    primary: "#000",
    dark: false,
  };
  const sites = [
    { ...site, brief: "tattoo", hero: "hero-giant-type" },
    { ...site, brief: "fineline", hero: "hero-index" },
    { ...site, brief: "patisserie", hero: "hero-mosaic" },
    { ...site, brief: "choux", hero: "hero-mosaic" },
  ];
  const pairs: [string, string][] = [
    ["tattoo", "fineline"],
    ["patisserie", "choux"],
    ["bar", "club"],
  ];
  const table = varietyTable("claude, after", sites, pairs);
  expect(table).toContain(
    "One trade, two characters: tattoo / fineline differ (hero-giant-type, hero-index); patisserie / choux alike (hero-mosaic).",
  );
  // A pair with a brief not run is left out; with no pair run, no line.
  expect(varietyTable("claude, after", sites.slice(0, 1), pairs)).not.toContain("One trade");
});
