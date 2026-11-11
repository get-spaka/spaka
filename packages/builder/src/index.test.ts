import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memorySource } from "@upstart/runtime";
import { afterEach, beforeEach, expect, test } from "vitest";
import { buildStatic, candidates, copyAddress, imagesIn, withSrcset } from "./index.ts";

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

test("record pages and the credits page exported; the datasources and what is kept beside an image not copied (Q147, Q157)", async () => {
  const files: Record<string, string> = {
    "pages/index.liquid": page(
      "Home",
      `<img src="/media/cafe.jpg">{% for post in data.posts %}<a href="/blog/{{ post.id }}">{{ post.title }}</a>{% endfor %}`,
    ),
    "pages/blog/[posts].liquid": page("Post", "<h1>{{ record.title }}</h1>{{ record.body }}"),
    "parts/header.liquid": "<header><footer></footer></header>",
    "data/posts/_datasource.yaml": "label: Posts\nfields:\n  - name: title\n    kind: text\n",
    "data/posts/hello.md": "---\ntitle: Hello\n---\nFirst *words*.\n",
    "media/cafe.jpg": "jpeg",
    "media/cafe.json":
      '{ "alt": "The café", "credit": { "author": "Jane", "license": "CC BY 4.0", "source": "https://example.org/cafe" } }',
    "media/prices.json": "{}",
  };
  const result = await buildStatic({
    source: memorySource(files),
    outDir: out,
    files: Object.keys(files),
    readFile: (path) => Buffer.from(files[path]!),
  });
  expect(result.pages).toEqual(["/", "/blog/hello", "/credits"]);
  expect(readFileSync(join(out, "blog/hello/index.html"), "utf8")).toContain(
    "<h1>Hello</h1><p>First <em>words</em>.</p>",
  );
  const home = readFileSync(join(out, "index.html"), "utf8");
  expect(home).toContain('<img alt="The café" src="/media/cafe.jpg">');
  expect(home).toContain('href="/credits"');
  expect(readFileSync(join(out, "credits/index.html"), "utf8")).toContain("Jane");
  expect(existsSync(join(out, "data"))).toBe(false);
  expect(existsSync(join(out, "media/cafe.json"))).toBe(false);
  // A JSON file of the library's own is copied.
  expect(existsSync(join(out, "media/prices.json"))).toBe(true);
  expect(existsSync(join(out, "media/cafe.jpg"))).toBe(true);
});

test("the images the pages show get WebP copies and a srcset; the original stays the src (Q156)", async () => {
  const files: Record<string, string> = {
    "pages/index.liquid": page(
      "Home",
      `<img src="/media/cafe.jpg" alt="x"><img src="/media/logo.svg" alt="y"><img src="/media/shop.jpg" srcset="/media/shop.jpg 1x" alt="z">`,
    ),
    "parts/header.liquid": "",
    "media/cafe.jpg": "jpeg",
    "media/logo.svg": "<svg/>",
    "media/shop.jpg": "jpeg",
    "media/unused.jpg": "jpeg",
  };
  const asked: string[] = [];
  const result = await buildStatic({
    source: memorySource(files),
    outDir: out,
    files: Object.keys(files),
    readFile: (path) => Buffer.from(files[path]!),
    images: async (path, _data, widths) => {
      asked.push(path);
      if (path.endsWith(".svg")) return undefined;
      return widths
        .filter((w) => w <= 1200)
        .concat(1200)
        .map((width) => ({ width, data: Buffer.from(`webp ${width}`) }));
    },
  });
  expect(asked.sort()).toEqual(["media/cafe.jpg", "media/logo.svg", "media/shop.jpg"]);
  const home = readFileSync(join(out, "index.html"), "utf8");
  expect(home).toContain(
    '<img srcset="/media/cafe-480w.webp 480w, /media/cafe-960w.webp 960w, /media/cafe-1200w.webp 1200w" sizes="100vw" src="/media/cafe.jpg" alt="x">',
  );
  expect(home).toContain('<img src="/media/logo.svg" alt="y">');
  expect(home).toContain('<img src="/media/shop.jpg" srcset="/media/shop.jpg 1x" alt="z">');
  expect(readFileSync(join(out, "media/cafe-960w.webp"), "utf8")).toBe("webp 960");
  expect(result.files).toContain("media/cafe-1200w.webp");
});

test("the images of a page, and their copies' addresses", () => {
  expect(
    imagesIn(
      `<img src="/media/a%20b.jpg"><img src='media/c.png'><img src="https://x.org/d.jpg"><img src="/media/a%20b.jpg">`,
    ),
  ).toEqual(["media/a b.jpg", "media/c.png"]);
  expect(copyAddress("/media/a%20b.jpg", 480)).toBe("/media/a%20b-480w.webp");
  expect(withSrcset(`<img src="/media/c.png" sizes="50vw">`, new Map([["media/c.png", [480]]]))).toBe(
    `<img srcset="/media/c-480w.webp 480w" src="/media/c.png" sizes="50vw">`,
  );
});
