import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import type { DroppedBlock } from "./data-drop";
import {
  GALLERY_SAMPLES,
  loremLeft,
  loremLeftNote,
  nameRecords,
  samplesLeftNote,
  unchangedSamples,
  useBlocks,
} from "./use-blocks";

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
const events: DroppedBlock = {
  id: "events-list",
  kind: "events",
  source: '<section>{% for e in data.events %}<a href="/events/{{ e.id }}">{{ e.title }}</a>{% endfor %}</section>',
  data: { name: "events", family: "collection" },
  datasource: {
    definition: "label: Events\nfields:\n  - name: title\n    kind: text\norder: [acoustic-evening, open-day, quiz]\n",
    records: {
      "acoustic-evening.md": "---\ntitle: Acoustic evening\n---\n",
      "open-day.md": "---\ntitle: Open day\n---\n",
      "quiz.md": "---\ntitle: Quiz night\n---\n",
    },
  },
  detail: "<section><h1>{{ record.title }}</h1></section>",
};
const block = (id: string) => (id === faq.id ? faq : id === events.id ? events : undefined);

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

test("a sample the agent rewrote is renamed after its title, its order and links following; one left as written is not (Q218)", () => {
  root = mkdtempSync(join(tmpdir(), "use-blocks-"));
  useBlocks(
    root,
    {
      page: "pages/index.liquid",
      title: "Le Petit Four",
      description: "A bistro",
      blocks: [{ block: events.id, name: "events" }],
    },
    block,
  );
  expect(readFileSync(join(root, "pages/events/[events].liquid"), "utf8")).toContain("record.title");
  const dir = join(root, "data/events");
  writeFileSync(join(dir, "acoustic-evening.md"), "---\ntitle: Rhône wine evening\n---\nFour wines.\n");
  // Rewritten, its title already giving its name: kept.
  writeFileSync(join(dir, "quiz.md"), "---\ntitle: Quiz\n---\n");
  writeFileSync(
    join(root, "parts/events.liquid"),
    '<section><a href="/events/acoustic-evening">Next</a> <a href="/events/acoustic-evenings">x</a></section>\n',
  );
  expect(nameRecords(root)).toEqual(["data/events/acoustic-evening.md → data/events/rhone-wine-evening.md"]);
  expect(existsSync(join(dir, "acoustic-evening.md"))).toBe(false);
  expect(readFileSync(join(dir, "rhone-wine-evening.md"), "utf8")).toContain("Four wines.");
  expect(readFileSync(join(dir, "_datasource.yaml"), "utf8")).toContain("order: [rhone-wine-evening, open-day, quiz]");
  expect(readFileSync(join(root, "parts/events.liquid"), "utf8")).toBe(
    '<section><a href="/events/rhone-wine-evening">Next</a> <a href="/events/acoustic-evenings">x</a></section>\n',
  );
  // The sample left as the gallery wrote it is still named to the agent.
  expect(unchangedSamples(root)).toEqual(["data/events/open-day.md"]);
  expect(nameRecords(root)).toEqual([]);
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
  const { Runtime } = await import("@spaka/runtime");
  const { diskSource } = await import("@spaka/runtime/node");
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

test("the parts and record pages it wrote are named while they hold lorem ipsum, and no longer once rewritten (Q223)", () => {
  root = mkdtempSync(join(tmpdir(), "use-blocks-"));
  const { files } = useBlocks(
    root,
    {
      page: "pages/index.liquid",
      title: "Le Petit Four",
      description: "A bistro",
      blocks: [{ block: events.id, name: "events" }],
    },
    block,
  );
  expect(files).toEqual(["parts/events.liquid", "pages/events/[events].liquid"]);
  writeFileSync(join(root, "parts/events.liquid"), "<section>Lorem ipsum</section>\n");
  expect(loremLeft(root, files)).toEqual(["parts/events.liquid"]);
  expect(loremLeftNote(["parts/events.liquid"])).toContain("parts/events.liquid");
  writeFileSync(join(root, "parts/events.liquid"), "<section>Our evenings</section>\n");
  expect(loremLeft(root, files)).toEqual([]);
});
