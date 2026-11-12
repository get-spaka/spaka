import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("a data block is read with its datasource, its sample records, its detail and where it comes from", () => {
  const dir = mkdtempSync(join(tmpdir(), "gallery-"));
  block(dir, "blog", "blog-cards", {
    ...about("blog", "Blog cards"),
    source: "meraki-ui",
    data: { name: "blog", family: "collection" },
  });
  mkdirSync(join(dir, "blog/blog-cards/data"));
  writeFileSync(
    join(dir, "blog/blog-cards/data/_datasource.yaml"),
    "label: Posts\nfields:\n  - name: title\n    kind: text\n",
  );
  writeFileSync(join(dir, "blog/blog-cards/data/first-post.md"), "---\ntitle: First post\n---\n");
  writeFileSync(join(dir, "blog/blog-cards/detail.liquid"), "<section>{{ record.title }}</section>");
  const [b] = readGallery(dir);
  expect(b).toMatchObject({
    origin: "meraki-ui",
    data: { name: "blog", family: "collection" },
    datasource: { records: { "first-post.md": "---\ntitle: First post\n---\n" } },
    detail: "<section>{{ record.title }}</section>",
  });
  expect(described(b!)).toEqual({
    id: "blog-cards",
    kind: "blog",
    name: "Blog cards",
    description: "A Blog cards.",
    tags: ["x"],
    mood: [],
    synonyms: [],
    data: { name: "blog", family: "collection" },
  });
});

test("a data block without its definition is left out", () => {
  const dir = mkdtempSync(join(tmpdir(), "gallery-"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  block(dir, "team", "team-grid", { ...about("team", "Team grid"), data: { name: "team", family: "collection" } });
  expect(readGallery(dir)).toEqual([]);
  expect(String(warn.mock.calls[0]?.[1])).toContain("_datasource.yaml");
  warn.mockRestore();
});
