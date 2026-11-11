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
});
const pricing = block("pricing-three-tiers", "pricing", "Three tiers");
const faq = block("faq-accordion", "faq", "Accordion");

test("one section: up to four blocks, each with its template and how to use it", () => {
  const limits: number[] = [];
  const text = blocksAnswer([{ kind: "pricing", query: "plans" }], (_q, _k, limit) => {
    limits.push(limit);
    return [pricing];
  });
  expect(limits).toEqual([4]);
  expect(text).toMatch(/^Blocks of Upstart's gallery\. To use one, write it as a shared part/);
  expect(text).toContain(
    '# pricing: "plans"\n\n## Three tiers (pricing, id pricing-three-tiers)\nThree tiers, side by side.',
  );
  expect(text).toContain("```liquid\n<section>\n  <h2>Three tiers</h2>\n</section>\n```");
});

test("several sections in one call: two blocks each, a block found twice shown once, none found said so", () => {
  const found: Record<string, Block[]> = { plans: [pricing, faq], questions: [faq], map: [] };
  const text = blocksAnswer(
    [{ query: "plans" }, { kind: "faq", query: "questions" }, { query: "map" }],
    (q, _k, limit) => {
      expect(limit).toBe(2);
      return found[q]!;
    },
  );
  expect(text.match(/```liquid/g)).toHaveLength(2);
  expect(text).toContain('# faq: "questions"\n\n## Accordion (faq, id faq-accordion)\nShown above.');
  expect(text).toContain('# "map"\nNo block of the gallery fits: write this section yourself.');
});

test("past the budget, a section's second block comes without its template; each section's best always has one", () => {
  const big = (id: string, kind: Block["kind"]) => ({ ...block(id, kind, id), source: "x".repeat(1000) });
  const found: Record<string, Block[]> = {
    a: [big("a1", "hero"), big("a2", "hero")],
    b: [big("b1", "faq"), big("b2", "faq")],
    c: [big("c1", "cta"), big("c2", "cta")],
  };
  const text = blocksAnswer([{ query: "a" }, { query: "b" }, { query: "c" }], (q) => found[q]!, 3500);
  expect(text.match(/```liquid/g)).toHaveLength(3);
  expect(text).toContain("## a1 (hero, id a1)\na1, side by side.\n\n```liquid");
  expect(text).toContain(
    "## a2 (hero, id a2)\na2, side by side.\nIts template is left out to keep this answer short; ask for this section alone to see it.",
  );
  expect(
    blocksAnswer([{ query: "a" }, { query: "b" }, { query: "c" }], (q) => found[q]!, 6000).match(/```liquid/g),
  ).toHaveLength(6);
});

test("the answer for every kind of section at once stays under the budget", async () => {
  const { readGallery } = await import("../gallery/catalogue");
  const { BlockIndex } = await import("../gallery/search");
  const { BLOCK_KINDS } = await import("../../shared/ipc");
  const { join } = await import("node:path");
  const index = new BlockIndex(readGallery(join(__dirname, "../../../gallery")));
  const text = blocksAnswer(
    BLOCK_KINDS.map((kind) => ({ kind, query: kind })),
    (q, kind, limit) => index.find(q, { kind, limit }),
  );
  expect(text.length).toBeLessThan(40_000);
});
