// The gallery shipped with the app (Q203): every block describes itself and
// keeps to the rules a dropped block relies on — one root element, the
// theme's colours only, no remote image, no script or style, Liquid only in a
// data block and only over its own datasource, whose definition and sample
// records read — and renders with no note from the runtime once dropped.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Datasources, memorySource, Runtime, sections } from "@upstart/runtime";
import { describe, expect, test } from "vitest";
import { BLOCK_KINDS } from "../../shared/ipc";
import { dropData } from "../editing/data-drop";
import { BLOCK_SOURCES, type Block, readGallery } from "./catalogue";

const GALLERY = join(__dirname, "../../../gallery");
const blocks = readGallery(GALLERY);

/** The moods a block is searched by, one spelling each. */
const MOODS = [
  "minimal",
  "friendly",
  "bold",
  "elegant",
  "playful",
  "warm",
  "professional",
  "editorial",
  "dark",
  "colorful",
];

/** Tailwind's own colours, which do not follow the theme: `bg-blue-600`, `text-white`, `bg-[#fff]`. */
const FIXED_COLOUR =
  /(?:^|[\s"':])(?:[a-z]+:)*!?(?:bg|text|border|ring|ring-offset|from|via|to|fill|stroke|outline|divide|shadow|decoration|placeholder|accent|caret)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|black|white|\[(?:#|rgb|hsl|oklch|color))/;

/** The files a block writes into a project when it is dropped, under its own names. */
function dropped(b: Block): Record<string, string> {
  const files: Record<string, string> = {
    "pages/index.liquid": `<!doctype html><html><body>{% render '${b.id}' %}</body></html>`,
    [`parts/${b.id}.liquid`]: b.source,
  };
  if (b.data && b.datasource) {
    files[`data/${b.data.name}/_datasource.yaml`] = b.datasource.definition;
    for (const [file, text] of Object.entries(b.datasource.records)) files[`data/${b.data.name}/${file}`] = text;
  }
  if (b.data && b.detail) {
    files[`pages/${b.data.name}/[${b.data.name}].liquid`] = `<!doctype html><html><body>${b.detail}</body></html>`;
  }
  return files;
}

/** The datasources a template reads: `data.team`, `data["home-faq"]`. */
function readsData(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/\bdata\.([a-z][\w-]*)|\bdata\[\s*["']([^"']+)["']\s*\]/g)) names.add(m[1] ?? m[2]!);
  return [...names];
}

test("the gallery holds blocks of every kind it knows of", () => {
  expect(blocks.length).toBeGreaterThanOrEqual(30);
  for (const b of blocks) expect(BLOCK_KINDS, b.id).toContain(b.kind);
});

test("each source's licence is kept beside the gallery", () => {
  for (const origin of new Set(blocks.map((b) => b.origin))) {
    const licence = BLOCK_SOURCES[origin];
    if (licence) expect(existsSync(join(GALLERY, licence)), origin).toBe(true);
  }
});

test("the blocks over one collection give each field the same kind, since the site shares it", () => {
  const kinds = new Map<string, { kind: string; block: string }>();
  for (const b of blocks) {
    if (b.data?.family !== "collection") continue;
    const fields = new Datasources(memorySource(dropped(b))).get(b.data.name)?.definition?.fields ?? [];
    for (const field of fields) {
      const key = `${b.data.name}.${field.name}`;
      const seen = kinds.get(key);
      if (seen) expect(`${key}: ${field.kind} in ${b.id}`).toBe(`${key}: ${seen.kind} in ${b.id}`);
      else kinds.set(key, { kind: field.kind, block: b.id });
    }
  }
});

describe.each(blocks.map((b) => [b.id, b] as const))("%s", (_id, b) => {
  test("describes itself", () => {
    expect(b.id).toMatch(new RegExp(`^${b.kind}-[a-z0-9-]+$`));
    expect(b.tags.length).toBeGreaterThan(0);
    expect(b.mood.length).toBeGreaterThan(0);
    for (const mood of b.mood) expect(MOODS, mood).toContain(mood);
    // English and French words the maker or the agent may search with.
    expect(b.synonyms.length).toBeGreaterThanOrEqual(4);
  });

  test("has one root element, closed at its end", () => {
    const root = /^\s*<(\w+)/.exec(b.source)?.[1];
    expect(root).toBe(b.kind === "header" ? "header" : b.kind === "footer" ? "footer" : "section");
    expect(b.source.trim().endsWith(`</${root}>`)).toBe(true);
    expect(sections(`<body>${b.source}</body>`)).toHaveLength(1);
    if (b.detail) expect(sections(`<body>${b.detail}</body>`)).toHaveLength(1);
  });

  test("uses the theme's colours only, with no script, style or remote address", () => {
    for (const text of [b.source, b.detail ?? "", ...Object.values(b.datasource?.records ?? {})]) {
      expect(text).not.toMatch(/<script|<style|\sstyle=|https?:\/\//i);
      expect(FIXED_COLOUR.exec(text)?.[0]).toBeUndefined();
    }
  });

  test("places nothing over the rest: no floating badge or sticker", () => {
    // An absolutely placed element is only ever a hidden decoration (a blurred shape, an icon in a placeholder).
    for (const text of [b.source, b.detail ?? ""])
      for (const tag of text.matchAll(/<[a-z][^>]*\bclass="[^"]*(?<![\w-])absolute\b[^"]*"[^>]*>/g))
        expect(tag[0], b.id).toMatch(/aria-hidden="true"/);
  });

  test("holds Liquid only as a data block, over its own datasource", () => {
    if (!b.data) {
      expect(b.source).not.toMatch(/\{\{|\{%|<img/);
      expect(b.detail).toBeUndefined();
      return;
    }
    expect(readsData(b.source)).toEqual([b.data.name]);
    // Only what Liquid's forloop has: forloop.even is nothing, and false.
    for (const m of `${b.source}${b.detail ?? ""}`.matchAll(/\bforloop\.(\w+)/g))
      expect(["index", "index0", "rindex", "rindex0", "first", "last", "length"]).toContain(m[1]);
    // An image comes from a record, shown only when the record has one.
    for (const img of b.source.matchAll(/<img\b[^>]*>/g)) expect(img[0]).toMatch(/src="\{\{/);
    if (b.detail) {
      expect(b.data.family).toBe("collection");
      expect(b.detail).toMatch(/\brecord\./);
      expect(readsData(b.detail).filter((n) => n !== b.data!.name)).toEqual([]);
    }
  });

  test.runIf(!!b.data)("brings a definition and sample records that read", () => {
    const data = new Datasources(memorySource(dropped(b)));
    const ds = data.get(b.data!.name);
    expect(ds?.definition?.label).toBeTruthy();
    expect(ds?.problems).toEqual([]);
    const count = Object.keys(b.datasource!.records).length;
    // A collected datasource's samples are the preview's test records: none for a form no page shows (Q182).
    expect(count).toBeLessThanOrEqual(6);
    if (!ds?.definition?.collected) expect(count).toBeGreaterThanOrEqual(3);
    expect(ds?.records).toHaveLength(ds?.definition?.collected ? 0 : count);
  });

  test.runIf(!!b.data)("renders with no note once dropped as the app drops it, under its page's name", () => {
    const files: Record<string, string> = {
      "pages/services.liquid":
        "<!doctype html><html><head><title>Services</title></head><body>\n<section>Intro</section>\n</body></html>",
    };
    const view = {
      exists: (path: string) => Object.keys(files).some((f) => f === path || f.startsWith(`${path}/`)),
      read: (path: string) => files[path],
      templates: () => Object.fromEntries(Object.entries(files).filter(([f]) => /^(pages|parts)\//.test(f))),
    };
    const drop = dropData(b, "pages/services.liquid", view);
    Object.assign(files, drop.writes, { [`parts/${b.id}.liquid`]: drop.source });
    files["pages/services.liquid"] = files["pages/services.liquid"]!.replace(
      "</body>",
      `{% render '${b.id}' %}</body>`,
    );
    const runtime = new Runtime(memorySource(files));
    const result = runtime.renderRoute("/services");
    expect(result.notes).toEqual([]);
    expect(result.datasources).toContain(drop.datasource);
    if (drop.recordPage) {
      const first = Object.keys(files).find((f) => f.startsWith(`data/${drop.datasource}/`) && f.endsWith(".md"))!;
      const page = runtime.renderRoute(`/${drop.datasource}/${first.split("/").at(-1)!.replace(/\.md$/, "")}`);
      expect(page.notes).toEqual([]);
    }
  });

  test("renders with no note once dropped as a part", () => {
    const runtime = new Runtime(memorySource(dropped(b)));
    const result = runtime.renderRoute("/");
    expect(result.status).toBe(200);
    expect(result.notes).toEqual([]);
    // A sample without an image shows the block's placeholder, not an empty picture.
    expect(result.html).not.toMatch(/\b(?:src|href)=""/);
    if (b.data && b.detail) {
      const first = Object.keys(b.datasource!.records)[0]!.replace(/\.md$/, "");
      const page = runtime.renderRoute(`/${b.data.name}/${first}`);
      expect(page.status).toBe(200);
      expect(page.notes).toEqual([]);
    }
  });
});
