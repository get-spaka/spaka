import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import type { DroppedBlock } from "./data-drop";
import { GALLERY_SAMPLES, samplesLeftNote, unchangedSamples, useBlocks } from "./use-blocks";

const faq: DroppedBlock = {
  id: "faq-accordion",
  kind: "faq",
  source: "<section>{% for q in data.faq %}{{ q.question }}{% endfor %}</section>",
  data: { name: "faq", family: "section" },
  datasource: {
    definition: "label: Questions\nfields:\n  - name: question\n    kind: text\n",
    records: { "delivery.md": "---\nquestion: Do you deliver?\n---\n", "hours.md": "---\nquestion: When?\n---\n" },
  },
};
const block = (id: string) => (id === faq.id ? faq : undefined);

let root: string;
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("written into the project, its samples noted; those the agent rewrites or deletes are forgotten (Q217)", () => {
  root = mkdtempSync(join(tmpdir(), "use-blocks-"));
  const { text, samples } = useBlocks(
    root,
    {
      page: "pages/index.liquid",
      title: "Chez Margot",
      description: "A bakery",
      blocks: [{ block: faq.id, name: "questions" }],
    },
    block,
  );
  expect(text).toContain("Created pages/index.liquid");
  expect(readFileSync(join(root, "pages/index.liquid"), "utf8")).toContain("{% render 'questions' %}");
  expect(readFileSync(join(root, "parts/questions.liquid"), "utf8")).toContain('data["home-faq"]');
  expect(samples).toEqual(["data/home-faq/delivery.md", "data/home-faq/hours.md"]);
  expect(Object.keys(JSON.parse(readFileSync(join(root, GALLERY_SAMPLES), "utf8")))).toEqual(samples);
  expect(unchangedSamples(root)).toEqual(samples);

  writeFileSync(join(root, "data/home-faq/delivery.md"), "---\nquestion: Livrez-vous ?\n---\n");
  rmSync(join(root, "data/home-faq/hours.md"));
  expect(unchangedSamples(root)).toEqual([]);
  expect(JSON.parse(readFileSync(join(root, GALLERY_SAMPLES), "utf8"))).toEqual({});
  expect(samplesLeftNote(["data/a.md"])).toContain("data/a.md");
});

test("a refusal is answered, nothing written", () => {
  root = mkdtempSync(join(tmpdir(), "use-blocks-"));
  const { text, samples } = useBlocks(
    root,
    { page: "pages/index.liquid", blocks: [{ block: "nope", name: "x" }] },
    block,
  );
  expect(text).toMatch(/title and description|No block nope/);
  expect(samples).toEqual([]);
  expect(unchangedSamples(root)).toEqual([]);
});

test("a site from the real gallery: two pages placed, a collection shared, each list its page's, all rendering clean", async () => {
  const { Runtime } = await import("@upstart/runtime");
  const { diskSource } = await import("@upstart/runtime/node");
  const { Gallery } = await import("../gallery/catalogue");
  const gallery = new Gallery(join(__dirname, "../../../gallery"));
  const get = (id: string) => gallery.get(id);
  root = mkdtempSync(join(tmpdir(), "use-blocks-"));
  const home = useBlocks(
    root,
    {
      page: "pages/index.liquid",
      title: "Chez Margot",
      description: "A bakery in Lyon",
      lang: "fr",
      blocks: [
        { block: "header-dark", name: "header" },
        { block: "hero-local-shop", name: "hero" },
        { block: "services-price-list", name: "services" },
        { block: "faq-accordion", name: "questions" },
        { block: "footer-local-shop", name: "footer" },
        { block: "banner-centered-primary", name: "banner" },
      ],
    },
    get,
  );
  expect(home.text).toContain("Created pages/index.liquid");
  const services = useBlocks(
    root,
    {
      page: "pages/services.liquid",
      title: "Nos services",
      description: "Ce que nous faisons",
      blocks: [
        { block: "services-icon-cards", name: "services" },
        { block: "faq-grid", name: "questions" },
      ],
    },
    get,
  );
  expect(services.text).toContain("which the site already has");
  // The collection's samples come once; each page has its own questions.
  expect(services.samples.some((f) => f.startsWith("data/services/"))).toBe(false);
  expect(services.samples.some((f) => f.startsWith("data/services-faq/"))).toBe(true);
  const page = readFileSync(join(root, "pages/services.liquid"), "utf8");
  expect([...page.matchAll(/\{% render '([\w-]+)' %\}/g)].map((m) => m[1])).toEqual([
    "banner",
    "header",
    "services-2",
    "questions-2",
    "footer",
  ]);
  const runtime = new Runtime(diskSource(root));
  for (const route of ["/", "/services"]) {
    const result = runtime.renderRoute(route);
    expect(result.status).toBe(200);
    expect(result.notes).toEqual([]);
  }
  expect(unchangedSamples(root).length).toBeGreaterThan(4);
});
