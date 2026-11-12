import { join } from "node:path";
import { expect, test } from "vitest";
import type { Block } from "./catalogue";
import { readGallery } from "./catalogue";
import { BlockIndex, words } from "./search";

const b = (id: string, kind: Block["kind"], name: string, more: Partial<Block> = {}): Block => ({
  id,
  kind,
  name,
  description: "",
  tags: [],
  mood: [],
  synonyms: [],
  source: "",
  origin: "upstart",
  ...more,
});

const blocks = [
  b("pricing-three-tiers", "pricing", "Three tiers", {
    description: "Three plans side by side, the middle one highlighted.",
    tags: ["cards", "monthly"],
    synonyms: ["plans", "prices", "tarifs", "offres"],
  }),
  b("pricing-table", "pricing", "Comparison table", {
    description: "A table comparing what each plan includes.",
    tags: ["table", "comparison"],
    synonyms: ["plans", "tarifs"],
  }),
  b("faq-accordion", "faq", "Accordion", {
    description: "Questions that open one at a time.",
    tags: ["collapse"],
    synonyms: ["questions", "foire aux questions", "aide"],
  }),
  b("hero-dark", "hero", "Dark band", {
    description: "A bold headline on a dark band.",
    mood: ["bold", "dark"],
    synonyms: ["banner", "bannière", "accroche"],
  }),
];

test("words are folded: case, accents, plurals, small words", () => {
  expect(words("Les Bannières de prix")).toEqual(["banniere", "prix"]);
  expect(words("Testimonials, quotes & FAQ")).toEqual(["testimonial", "quote", "faq"]);
  expect(words("boxes, companies")).toEqual(["box", "company"]);
});

test("a query finds the blocks whose words it has, the best first", () => {
  const index = new BlockIndex(blocks);
  expect(index.find("tarifs comparaison table").map((x) => x.id)).toEqual(["pricing-table", "pricing-three-tiers"]);
  expect(index.find("pricing plans")[0]!.kind).toBe("pricing");
  expect(index.find("bannière sombre")[0]!.id).toBe("hero-dark");
  expect(index.find("foire aux questions").map((x) => x.id)).toEqual(["faq-accordion"]);
  expect(index.find("nothing like this")).toEqual([]);
});

test("a kind narrows the search; with no words, the kind's blocks in order", () => {
  const index = new BlockIndex(blocks);
  expect(index.find("plans", { kind: "faq" })).toEqual([]);
  expect(index.find("", { kind: "pricing" }).map((x) => x.id)).toEqual(["pricing-three-tiers", "pricing-table"]);
  expect(index.find("", { limit: 2 })).toHaveLength(2);
});

// On the shipped gallery: what a maker or the agent would ask for, in either language.
test("the shipped gallery answers everyday requests", () => {
  const list = readGallery(join(__dirname, "../../../gallery"));
  if (list.length === 0) return;
  const index = new BlockIndex(list);
  const top = (q: string) => index.find(q)[0]?.kind;
  expect(top("pricing plans")).toBe("pricing");
  expect(top("tarifs")).toBe("pricing");
  expect(top("customer reviews")).toBe("testimonials");
  expect(top("avis clients")).toBe("testimonials");
  expect(top("foire aux questions")).toBe("faq");
  expect(top("navigation bar")).toBe("header");
  expect(top("pied de page")).toBe("footer");
  expect(top("newsletter signup")).toMatch(/cta|footer/);
});
