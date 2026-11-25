// The gallery shipped with the app (Q203): every block describes itself and
// keeps to the rules a dropped block relies on — one root element, the
// theme's colours only, no remote image, no script or style, Liquid only in a
// data block and only over its own datasource, whose definition and sample
// records read — and renders with no note from the runtime once dropped.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Datasources, memorySource, Runtime, sections, TEST_RECORDS_DIR } from "@spaka/runtime";
import { describe, expect, test } from "vitest";
import { BLOCK_KINDS } from "../../shared/ipc";
import { dropData, isCollected } from "../editing/data-drop";
import { BLOCK_SOURCES, readGallery } from "./catalogue";
import { droppedFiles, FIXED_COLOUR, MOODS } from "./rules";

const GALLERY = join(__dirname, "../../../gallery");
const blocks = readGallery(GALLERY);

const dropped = droppedFiles;

/** A project's runtime, its test records read from where the app keeps them. */
function runtimeOf(files: Record<string, string>): Runtime {
  const prefix = `${TEST_RECORDS_DIR}/`;
  const tests = Object.fromEntries(
    Object.entries(files)
      .filter(([f]) => f.startsWith(prefix))
      .map(([f, text]) => [f.slice(prefix.length), text]),
  );
  return new Runtime(memorySource(files), { testRecords: memorySource(tests) });
}

/** The datasources a form posts to: `hx-post="/_data/contact"`. */
function postsTo(source: string): string[] {
  return [...new Set([...source.matchAll(/\/_data\/([a-z0-9][\w-]*)/g)].map((m) => m[1]!))];
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
      // A form posts to its collected datasource, which it brings: it is a data block.
      expect(postsTo(b.source)).toEqual([]);
      return;
    }
    // It reads its own datasource, or, a form, posts to it; nothing else.
    const reads = readsData(b.source);
    const posts = postsTo(b.source);
    expect([...new Set([...reads, ...posts])]).toEqual([b.data.name]);
    // Only what Liquid's forloop has: forloop.even is nothing, and false.
    for (const m of `${b.source}${b.detail ?? ""}`.matchAll(/\bforloop\.(\w+)/g))
      expect(["index", "index0", "rindex", "rindex0", "first", "last", "length"]).toContain(m[1]);
    // group_by makes new objects: the maker could no longer edit a record by clicking it. Filter with where.
    expect(`${b.source}${b.detail ?? ""}`).not.toMatch(/\|\s*group_by\b/);
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

  test.runIf(!!b.datasource && isCollected(b.datasource.definition))(
    "a form: a collection posting to itself, its problems shown in the block, answered with its own fragment (Q194)",
    () => {
      const name = b.data!.name;
      expect(b.data!.family).toBe("collection");
      const ds = new Datasources(memorySource(dropped(b))).get(name)!;
      const definition = ds.definition!;
      // Every field labeled, in the site's language once the agent rewrites it.
      for (const field of definition.fields) expect(field.label, field.name).toBeTruthy();
      for (const form of b.source.matchAll(/<form\b[^>]*>/g)) {
        expect(form[0]).toContain(`hx-post="/_data/${name}"`);
        expect(form[0]).toContain('hx-target="this"');
        expect(form[0]).toContain('hx-swap="outerHTML"');
        // The alert of a wrong submission goes into an element of the block, named after it.
        const target = /hx-status:422="target:#([\w-]+)/.exec(form[0])?.[1];
        expect(target, "hx-status:422 target").toBeTruthy();
        expect(target).toContain(b.id);
        expect(b.source).toContain(`id="${target}"`);
      }
      // Each input sends a field of the definition, and each required field has its input.
      const sent = new Set(
        [...b.source.matchAll(/<(?:input|textarea|select)\b[^>]*\sname="([\w-]+)"/g)].map((m) => m[1]),
      );
      for (const field of sent) expect(definition.fields.map((f) => f.name)).toContain(field);
      for (const field of definition.fields.filter((f) => f.required)) expect([...sent]).toContain(field.name);
      // Its answer is a fragment it brings, which renders with a record.
      if (definition.answer) {
        expect(Object.keys(b.fragments ?? {})).toContain(`${definition.answer}.liquid`);
        const record = Object.fromEntries(definition.fields.map((f) => [f.name, f.kind === "boolean" ? true : "Sam"]));
        const answer = runtimeOf(dropped(b)).renderFragment(definition.answer, { record, params: {} });
        expect(answer.status).toBe(200);
        expect(answer.notes).toEqual([]);
      }
      // Test records only where a page shows them (Q182): a contact form has none.
      const count = Object.keys(b.datasource!.records).length;
      if (readsData(b.source).includes(name)) expect(count).toBeGreaterThanOrEqual(3);
      else expect(count).toBe(0);
      for (const text of Object.values(b.datasource!.records)) expect(text).toMatch(/^submitted:\s*\S+/m);
    },
  );

  test("renders with no note once dropped as the app drops it, in lorem ipsum, under its page's name", () => {
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
    // Its records, in lorem ipsum (Q223), still read.
    if (drop.datasource) expect(new Datasources(memorySource(files)).get(drop.datasource)?.problems).toEqual([]);
    const runtime = runtimeOf(files);
    const result = runtime.renderRoute("/services");
    expect(result.notes).toEqual([]);
    // A form no page shows the records of is read by no page: it posts to its datasource.
    if (readsData(b.source).length) expect(result.datasources).toContain(drop.datasource);
    if (drop.recordPage) {
      const first = Object.keys(files).find((f) => f.startsWith(`data/${drop.datasource}/`) && f.endsWith(".md"))!;
      const page = runtime.renderRoute(`/${drop.datasource}/${first.split("/").at(-1)!.replace(/\.md$/, "")}`);
      expect(page.notes).toEqual([]);
    }
  });

  test("renders with no note once dropped as a part", () => {
    const runtime = runtimeOf(dropped(b));
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
