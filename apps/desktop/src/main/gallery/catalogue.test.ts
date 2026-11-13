import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { described, Gallery, ProjectBlocks, readGallery } from "./catalogue";

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
  expect(warn.mock.calls[0]?.join(" ")).toContain("_datasource.yaml");
  warn.mockRestore();
});

test("a project's blocks: its own design's first, marked, then the gallery's; read again when blocks/ changes (Q235)", () => {
  const gallery = mkdtempSync(join(tmpdir(), "gallery-"));
  block(gallery, "hero", "hero-split", about("hero", "Split hero"));
  block(gallery, "team", "team-grid", about("team", "Team grid"));
  const root = mkdtempSync(join(tmpdir(), "project-"));
  block(join(root, "blocks"), "team", "team-pile", about("team", "Pile of cards"));
  // A block of the project's with a gallery block's id: the project's.
  block(join(root, "blocks"), "hero", "hero-split", about("hero", "The design's split hero"));
  let open: string | undefined = root;
  const blocks = new ProjectBlocks(new Gallery(gallery), () => open);
  expect(blocks.list().map((b) => [b.id, !!b.design])).toEqual([
    ["hero-split", true],
    ["team-pile", true],
    ["team-grid", false],
  ]);
  expect(blocks.get("hero-split")?.name).toBe("The design's split hero");
  expect(described(blocks.get("team-pile")!).design).toBe(true);
  expect(described(blocks.get("team-grid")!)).not.toHaveProperty("design");
  block(join(root, "blocks"), "about", "about-statement", about("about", "Statement"));
  expect(blocks.list().some((b) => b.id === "about-statement")).toBe(false);
  blocks.changed("blocks/about/about-statement/block.json");
  expect(blocks.list().some((b) => b.id === "about-statement")).toBe(true);
  // No project open: the gallery's alone.
  open = undefined;
  expect(blocks.list().map((b) => b.id)).toEqual(["hero-split", "team-grid"]);
});
