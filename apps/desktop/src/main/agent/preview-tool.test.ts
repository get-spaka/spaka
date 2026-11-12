import { expect, test } from "vitest";
import type { Block } from "../gallery/catalogue";
import { blocksAnswer } from "./preview-tool";

const block = (id: string, kind: Block["kind"], name: string): Block => ({
  id,
  kind,
  name,
  description: `${name}, side by side.`,
  tags: [],
  mood: [],
  synonyms: [],
  source: `<section>\n  <h2>${name}</h2>\n</section>\n`,
  origin: "hyperui",
});
const pricing = block("pricing-three-tiers", "pricing", "Three tiers");
const faq = block("faq-accordion", "faq", "Accordion");

test("one section: up to five blocks, described by their metadata, never their templates (Q213)", () => {
  const limits: number[] = [];
  const text = blocksAnswer([{ kind: "pricing", query: "plans" }], (_q, _k, limit) => {
    limits.push(limit);
    return [{ ...pricing, mood: ["minimal", "friendly"], tags: ["plans", "monthly"] }];
  });
  expect(limits).toEqual([5]);
  expect(text).toMatch(
    /^Blocks of Upstart's gallery\. Choose one per section, then put them into the page with use_block/,
  );
  expect(text).toContain(
    '# pricing: "plans"\n- pricing-three-tiers: Three tiers (pricing)\n  Three tiers, side by side. Mood: minimal, friendly. Tags: plans, monthly.',
  );
  expect(text).not.toContain("<section>");
});

test("several sections in one call: three blocks each, a block found twice described once, none found said so", () => {
  const found: Record<string, Block[]> = { plans: [pricing, faq], questions: [faq], map: [] };
  const text = blocksAnswer(
    [{ query: "plans" }, { kind: "faq", query: "questions" }, { query: "map" }],
    (q, _k, limit) => {
      expect(limit).toBe(3);
      return found[q]!;
    },
  );
  expect(text).toContain('# faq: "questions"\n- faq-accordion: Accordion (faq), described above.');
  expect(text).toContain('# "map"\nNo block of the gallery fits: write this section yourself.');
});

test("the answer for every kind of section at once stays short", async () => {
  const { readGallery } = await import("../gallery/catalogue");
  const { BlockIndex } = await import("../gallery/search");
  const { BLOCK_KINDS } = await import("../../shared/ipc");
  const { join } = await import("node:path");
  const index = new BlockIndex(readGallery(join(__dirname, "../../../gallery")));
  const text = blocksAnswer(
    BLOCK_KINDS.map((kind) => ({ kind, query: kind })),
    (q, kind, limit) => index.find(q, { kind, limit }),
  );
  // 24 kinds, three blocks each: well under the 25,000 tokens past which the agent's kit puts an answer in a file.
  expect(text.length / 4).toBeLessThan(8_000);
});

test("a data block says what it lists: a collection, with its page per record, a section's own list, the navigation", () => {
  const datasource = { definition: "label: Posts\n", records: {} };
  const blog: Block = {
    ...block("blog-cards", "blog", "Cards"),
    data: { name: "blog", family: "collection" },
    datasource,
    detail: "<section></section>",
  };
  const list: Block = { ...faq, data: { name: "faq", family: "section" }, datasource };
  const header: Block = {
    ...block("header-simple", "header", "Simple"),
    data: { name: "navigation", family: "collection" },
    datasource,
  };
  const text = blocksAnswer([{ query: "posts" }, { query: "questions" }, { query: "menu" }], (q) => [
    q === "posts" ? blog : q === "questions" ? list : header,
  ]);
  expect(text).toContain("It lists the collection blog, shared by the whole site, with a page per record.");
  expect(text).toContain("It lists faq, a list of this section of its own.");
  expect(text).toContain("It reads the site's navigation.");
});
