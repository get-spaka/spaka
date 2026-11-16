// Every color of the interface is a token of renderer/index.css, light and dark
// (Q330, Q335), but the few in colors.ts that stay the same in both.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const RENDERER = join(__dirname, "..");
const PALETTE =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|placeholder|caret|decoration|accent|shadow)-(?:neutral|gray|zinc|slate|stone|red|green|blue|amber|yellow|emerald|sky|rose|orange|violet|purple|indigo|teal|cyan|lime|pink|fuchsia|white|black)(?:-\d{2,3})?(?:\/\d+)?\b|-\[#[0-9a-fA-F]{3,8}\]/g;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("the interface's colors", () => {
  test("are tokens, but the few that stay the same in light and dark", () => {
    const found = sources(RENDERER)
      .filter((path) => relative(RENDERER, path) !== join("lib", "colors.ts"))
      .flatMap((path) =>
        readFileSync(path, "utf8")
          .split("\n")
          .flatMap((line, i) => [...line.matchAll(PALETTE)].map((m) => `${relative(RENDERER, path)}:${i + 1} ${m[0]}`)),
      );
    expect(found).toEqual([]);
  });

  test("have a dark version of every token", () => {
    const css = readFileSync(join(RENDERER, "index.css"), "utf8");
    const names = (block: string) => [...block.matchAll(/^\s*(--[a-z-]+):/gm)].map((m) => m[1]);
    const light = names(css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {"))));
    const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
    const dark = names(css.slice(darkStart, css.indexOf("}\n}", darkStart)));
    expect(light.filter((n) => n !== "--radius" && !dark.includes(n))).toEqual([]);
  });
});
