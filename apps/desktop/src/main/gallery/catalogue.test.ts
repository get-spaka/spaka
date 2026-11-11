import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memorySource, Runtime } from "@upstart/runtime";
import { expect, test, vi } from "vitest";
import { described, Gallery, readGallery } from "./catalogue";

const block = (dir: string, kind: string, id: string, json: object | string, source = `<section>${id}</section>`) => {
  mkdirSync(join(dir, kind, id), { recursive: true });
  writeFileSync(join(dir, kind, id, "block.json"), typeof json === "string" ? json : JSON.stringify(json));
  writeFileSync(join(dir, kind, id, "block.liquid"), source);
};
const about = (kind: string, name: string) => ({ kind, name, description: `A ${name}.`, tags: ["x"] });

test("blocks are read with their description, in the kinds' order", () => {
  const dir = mkdtempSync(join(tmpdir(), "gallery-"));
  block(dir, "footer", "footer-simple", about("footer", "Simple footer"));
  block(dir, "hero", "hero-split", about("hero", "Split hero"));
  block(dir, "hero", "hero-centered", { ...about("hero", "Centered hero"), synonyms: ["bannière"] });
  const list = readGallery(dir);
  expect(list.map((b) => b.id)).toEqual(["hero-centered", "hero-split", "footer-simple"]);
  expect(list[0]).toMatchObject({
    kind: "hero",
    synonyms: ["bannière"],
    mood: [],
    source: "<section>hero-centered</section>",
  });
  expect(described(list[0]!)).not.toHaveProperty("source");
});

test("a block that does not describe itself is left out", () => {
  const dir = mkdtempSync(join(tmpdir(), "gallery-"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  block(dir, "hero", "hero-ok", about("hero", "Ok"));
  block(dir, "hero", "hero-broken", "{ not json");
  block(dir, "hero", "hero-odd-kind", about("carousel", "Carousel"));
  mkdirSync(join(dir, "hero", "Bad Name"));
  expect(new Gallery(dir).list().map((b) => b.id)).toEqual(["hero-ok"]);
  expect(warn).toHaveBeenCalledTimes(2);
  warn.mockRestore();
  expect(readGallery(join(dir, "nowhere"))).toEqual([]);
});

// The gallery shipped with the app: every block describes itself and keeps
// to the rules a dropped block relies on (one root element, plain texts).
test("the shipped gallery's blocks keep to the rules", () => {
  const list = readGallery(join(__dirname, "../../../gallery"));
  expect(list.length).toBeGreaterThanOrEqual(24);
  for (const b of list) {
    expect(b.id, b.id).toMatch(new RegExp(`^${b.kind}-`));
    expect(b.source, b.id).not.toMatch(/\{\{|\{%|<script|<style|<img|https?:\/\//);
    const root = /^\s*<(\w+)/.exec(b.source)?.[1];
    expect(root, b.id).toBe(b.kind === "header" ? "header" : b.kind === "footer" ? "footer" : "section");
    expect(b.source.trim().endsWith(`</${root}>`), b.id).toBe(true);
  }
});

test("every shipped block renders with no note from the runtime, once dropped as a part", () => {
  for (const b of readGallery(join(__dirname, "../../../gallery"))) {
    const runtime = new Runtime(
      memorySource({
        "pages/index.liquid": `<!doctype html><html><body>{% render '${b.id}' %}</body></html>`,
        [`parts/${b.id}.liquid`]: b.source,
      }),
    );
    const result = runtime.renderRoute("/");
    expect(result.status, b.id).toBe(200);
    expect(result.notes, b.id).toEqual([]);
  }
});
