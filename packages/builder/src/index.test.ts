import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memorySource } from "@upstart/runtime";
import { afterEach, beforeEach, expect, test } from "vitest";
import { buildStatic, candidates } from "./index.ts";

let out: string;
beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), "upstart-build-"));
});
afterEach(() => rmSync(out, { recursive: true, force: true }));

const page = (title: string, body: string) =>
  `<!doctype html>\n<html lang="en">\n<head><title>${title}</title></head>\n<body>\n{% render 'header' %}\n${body}\n</body>\n</html>\n`;

test("pages, fragments, a stylesheet with the classes used, the theme", async () => {
  const source = memorySource({
    "theme.css": ":root { --theme-color-primary: #b45309; }\n",
    "parts/header.liquid": `<header class="navbar bg-base-200"><a href="/menu" class="{% if page.url == '/menu' %}font-bold{% endif %}">Menu</a></header>`,
    "pages/index.liquid": page(
      "Home",
      `<h1 class="text-5xl text-primary">Chez Margot</h1><div hx-get="/fragments/hours" hx-trigger="load"></div>`,
    ),
    "pages/menu.liquid": page("Menu", `<ul class="grid md:grid-cols-3 gap-4"><li>Bread</li></ul>`),
    "fragments/hours.liquid": `<p class="italic">7am to 7pm</p>`,
    "fragments/search.liquid": `<p>{{ params.q }}</p>`,
  });
  const result = await buildStatic({ source, outDir: out });
  expect(result.pages).toEqual(["/", "/menu"]);
  expect(result.fragments).toEqual(["/fragments/hours", "/fragments/search"]);
  expect(result.warnings).toEqual([expect.stringMatching(/fragments\/search.liquid reads its parameters/)]);

  const home = readFileSync(join(out, "index.html"), "utf8");
  expect(home).toContain('<link rel="stylesheet" href="/theme.css">');
  expect(home).toContain("Chez Margot");
  // No preview machinery in the export.
  expect(home).not.toMatch(/data-up-|tailwindcss|up-theme/);
  expect(readFileSync(join(out, "menu/index.html"), "utf8")).toContain('class="font-bold"');
  expect(readFileSync(join(out, "fragments/hours/index.html"), "utf8")).toBe(`<p class="italic">7am to 7pm</p>`);

  const css = readFileSync(join(out, "assets/site.css"), "utf8");
  for (const used of [".text-5xl", ".text-primary", ".italic", ".font-bold", ".gap-4", "md\\:grid-cols-3"])
    expect(css).toContain(used);
  expect(css).not.toContain(".text-9xl");
  // daisyUI is compiled in too, with only the components the pages use.
  expect(css).toContain(".navbar");
  expect(css).not.toContain(".carousel");
  expect(readFileSync(join(out, "theme.css"), "utf8")).toContain("#b45309");
  expect(result.files).toContain("assets/htmx.js");
});

test("a page that fails is left out and said", async () => {
  const result = await buildStatic({ source: memorySource({ "pages/index.liquid": "{% if %}" }), outDir: out });
  expect(result.pages).toEqual([]);
  expect(result.warnings[0]).toMatch(/pages\/index.liquid was not exported/);
  expect(candidates(`<a class="btn btn-primary" href="/x">`)).toEqual(
    expect.arrayContaining(["btn", "btn-primary", "/x"]),
  );
});
