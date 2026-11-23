import { join } from "node:path";
import { expect, test } from "vitest";
import type { Block } from "./catalogue";
import { readGallery } from "./catalogue";
import { BlockIndex, findWithDesign, words } from "./search";

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
  // Reviews shown, or a form to leave one.
  expect(top("customer reviews")).toMatch(/testimonials|forms/);
  expect(top("avis clients")).toBe("testimonials");
  expect(top("foire aux questions")).toBe("faq");
  expect(top("navigation bar")).toBe("header");
  expect(top("pied de page")).toBe("footer");
  expect(top("newsletter signup")).toMatch(/newsletter|cta/);
  expect(top("formulaire de contact")).toBe("forms");
  expect(top("horaires d'ouverture")).toBe("contact");
});

/** The web-design skill's moves, each the tag of the hero made for it (Q441). */
const MOVES: Record<string, string> = {
  "giant type": "hero-giant-type",
  "full-bleed photo": "hero-full-bleed-photo",
  "picture first": "hero-picture-first",
  "split screen": "hero-split-screen",
  "dark statement": "hero-dark-statement",
  index: "hero-index",
  overlap: "hero-overlap",
  "magazine serif": "hero-editorial",
  "picture mosaic": "hero-mosaic",
  "local details": "hero-local-shop",
  "friendly checklist": "hero-benefits",
};

test("a hero asked for by its move is the one made for it, whatever words of the direction come with it (Q441)", () => {
  const list = readGallery(join(__dirname, "../../../gallery"));
  const index = new BlockIndex(list);
  const hero = (q: string) => index.find(q, { kind: "hero" })[0]?.id;
  for (const [move, id] of Object.entries(MOVES)) {
    expect(list.find((x) => x.id === id)?.tags, id).toContain(move);
    expect(hero(move), move).toBe(id);
    expect(hero(`${move} hero`), `${move} hero`).toBe(id);
  }
  // As the skill asks: the move first, then a few words of the direction.
  expect(hero("giant type hero, graphic and loud")).toBe("hero-giant-type");
  expect(hero("full-bleed photo hero, warm and tender")).toBe("hero-full-bleed-photo");
  expect(hero("index hero, precise and calm")).toBe("hero-index");
  expect(hero("dark statement hero, late and moody")).toBe("hero-dark-statement");
  expect(hero("split screen hero, playful and colorful")).toBe("hero-split-screen");
});

test("a project's own design first: what fits, or its block of the kind asked for, then the gallery's (Q235)", () => {
  const design = new BlockIndex([
    b("team-reel-pile", "team", "Pile of cards", { description: "The team as tilted cards.", design: true }),
    b("hero-reel-kinetic", "hero", "Kinetic headline", { description: "Letters that rise.", design: true }),
  ]);
  const gallery = new BlockIndex([
    b("team-grid", "team", "Team grid", { description: "The team in a grid of portraits." }),
    b("team-list", "team", "Team list", { description: "The team as a list." }),
  ]);
  expect(findWithDesign(design, gallery, "team", { limit: 3 }).map((x) => x.id)).toEqual([
    "team-reel-pile",
    "team-grid",
    "team-list",
  ]);
  // Of the kind asked for, its own even with no word in common.
  expect(findWithDesign(design, gallery, "portraits", { kind: "team", limit: 2 }).map((x) => x.id)).toEqual([
    "team-reel-pile",
    "team-grid",
  ]);
  // None of its own fits: the gallery's alone.
  expect(findWithDesign(design, gallery, "portraits", { limit: 2 }).map((x) => x.id)).toEqual(["team-grid"]);
  expect(findWithDesign(new BlockIndex([]), gallery, "team", { limit: 1 }).map((x) => x.id)).toEqual(["team-grid"]);
});
