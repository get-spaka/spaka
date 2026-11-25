// Starting from a template (Q229, Q246): copied into the project without its
// manifest and pictures, its sentences kept; the agent's instruction; the
// template's texts left after a turn, named once, then forgotten.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  adaptMessage,
  copyTemplate,
  forgetTemplateTexts,
  removalMessage,
  reviewNote,
  sentencesOf,
  stepMessage,
  TEMPLATE_TEXTS,
  templateLeftNote,
  templateTextsLeft,
} from "./adapt";
import type { Adaptation } from "./adaptation";
import { guideSections } from "./pages";

const CORNER = join(import.meta.dirname, "../../../templates/corner");
const project = () => mkdtempSync(join(tmpdir(), "spaka-adapt-"));

describe("a template copied into a new project", () => {
  test("its site, its blocks and design notes; not its manifest or pictures", () => {
    const root = project();
    const { manifest, guide } = copyTemplate(CORNER, root);
    expect(manifest).toMatchObject({ id: "corner", name: "Corner" });
    // Its guide is for the agent, kept with the adaptation, never among the website's files (Q299, Q307).
    expect(guide).toMatch(/^# Corner/);
    expect(existsSync(join(root, "TEMPLATE.md"))).toBe(false);
    expect(existsSync(join(root, ".spaka/adaptation/TEMPLATE.md"))).toBe(true);
    expect(existsSync(join(root, "pages/index.liquid"))).toBe(true);
    expect(existsSync(join(root, "theme.css"))).toBe(true);
    expect(existsSync(join(root, ".spaka/skills/corner-design/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, "template.json"))).toBe(false);
    expect(existsSync(join(root, "pictures"))).toBe(false);
    const stored = JSON.parse(readFileSync(join(root, TEMPLATE_TEXTS), "utf8"));
    expect(stored.template).toBe("corner");
    expect(stored.texts.length).toBeGreaterThan(50);
  });

  const GUIDE = `# Ember

An evening restaurant.

## Pages

### Home (\`/\`)

The hearth and the evening.

#### Is there a bar menu?

- **Yes** (as built): the bar menu stays.
- **No**: it goes.

### Visit (\`/visit\`)

Hours, the way, the booking.

#### How do guests book a table?

- **Online, with the form** (as built): the reservation form stays.
- **By phone**: a call button in place of the form.

### Private dining (\`/private-dining\`)

The rooms for groups.

When removed: point the visit page's "Eight or more" line to the phone.`;
  const STEPS = [
    { route: "/", name: "Home", line: "The hearth and the evening." },
    { route: "/visit", name: "Visit", line: "Hours, the way, the booking." },
    { route: "/private-dining", name: "Private dining", line: "The rooms for groups." },
  ];
  const EMBER = { id: "ember", name: "Ember", description: "An evening restaurant." };

  test("the first turn: the card of pages, the home page's choices left open, then the home page alone (Q302-Q309)", () => {
    const text = adaptMessage(EMBER, "A jazz bar in Lyon, booking by phone only.", GUIDE, STEPS);
    expect(text).toContain('template "Ember"');
    expect(text).toContain("ember-design skill");
    expect(text).toContain(`<template-guide>\n${GUIDE}\n</template-guide>`);
    expect(text).toMatch(/it is not in the website/);
    // Before any file, the card of pages with every page type, the home page always kept, new pages added.
    expect(text).toMatch(/before you change any file: show the maker the card of pages with choose_pages/);
    expect(text).toContain("  - /visit (Visit): Hours, the way, the booking.");
    expect(text).toMatch(/the home page always kept/);
    expect(text).toMatch(/as new pages, those the message asks for that the template lacks/);
    // Then the home page's choices only, those the message leaves open.
    expect(text).toMatch(/of the choices in the guide's section for the home page/);
    expect(text).toMatch(/the guide's first option recommended/);
    expect(text).toMatch(/Ask nothing yet of the other pages/);
    // The home page and what every page shares; the page types not kept removed; the others left.
    expect(text).toMatch(/Adapt the home page and what every page shares/);
    expect(text).toMatch(/Remove the page types the maker did not keep, as their sections' "When removed" say/);
    expect(text).toMatch(/Leave the other pages as they are/);
    expect(text).toMatch(/find_images/);
    expect(text).toMatch(/Keep the design/);
    expect(text).toMatch(/Look at the home page with look_at_preview/);
    // It ends with a line on what it invented, no card (Q308).
    expect(text).toMatch(/one or two sentences in the maker's language on what you invented on this page/);
    expect(text).toMatch(/no card/);
    expect(text.indexOf("choose_pages")).toBeLessThan(text.indexOf("AskUserQuestion"));
    expect(text.indexOf("AskUserQuestion")).toBeLessThan(text.indexOf("Adapt the home page"));
    expect(text.endsWith("A jazz bar in Lyon, booking by phone only.")).toBe(true);
    // Without a guide: the card of pages still, the page types from the files.
    const plain = adaptMessage(EMBER, "A bar.", undefined, STEPS);
    expect(plain).not.toContain("<template-guide>");
    expect(plain).toMatch(/choose_pages/);
    expect(plain).not.toMatch(/When removed/);
  });

  const state = (statuses: Record<string, Adaptation["steps"][number]["status"]>): Adaptation => ({
    template: "ember",
    chosen: true,
    steps: STEPS.map((s) => ({ ...s, status: statuses[s.route] ?? "todo" })),
  });

  test("Continue: the next page type with its section, its choices asked first, alone (Q303, Q304)", () => {
    const sections = guideSections(GUIDE);
    const text = stepMessage(state({ "/": "done", "/visit": "doing" }), STEPS[1]!, sections);
    expect(text).toMatch(
      /^Next page of the adaptation: Visit \(\/visit\)\. Adapted already: Home\. Still to do after it: Private dining\./,
    );
    expect(text).toContain("<template-guide-section>\n### Visit (`/visit`)");
    expect(text).toContain("#### How do guests book a table?");
    expect(text).not.toContain("Is there a bar menu?");
    // The guide's general part with it, without the other page types' sections (Q299 amended).
    expect(text).toContain(`<template-guide>\n${sections.general}\n</template-guide>`);
    expect(text.indexOf("<template-guide>")).toBeLessThan(text.indexOf("<template-guide-section>"));
    expect(sections.general).not.toContain("## Pages");
    expect(text).toMatch(
      /before you change its files: of this section's choices, those the maker's messages leave open/,
    );
    expect(text).toMatch(/Adapt this page type only: its pages \(pages\/visit\.liquid, pages\/visit\/…\)/);
    expect(text).toMatch(/no card/);
    // Taken up again after a stopped turn; the last one; the page types taken off, removed with it.
    const again = stepMessage(
      state({ "/": "done", "/visit": "done", "/private-dining": "doing" }),
      STEPS[2]!,
      sections,
      {
        again: true,
        removals: [{ name: "Wine", route: "/wine", files: ["pages/wine.liquid"] }],
      },
    );
    expect(again).toMatch(/^Taking up again/);
    expect(again).toMatch(/It is the last\./);
    expect(again).toMatch(
      /Also remove these page types, which the maker took off the website: Wine \(pages\/wine\.liquid\)/,
    );
    // A new page is built from the gallery (Q310).
    const shop = stepMessage(state({}), { route: "/shop", name: "Shop", new: true }, sections);
    expect(shop).toMatch(/Shop \(\/shop\), a new page/);
    expect(shop).toMatch(/find_blocks, then use_block into pages\/shop\.liquid/);
    expect(removalMessage([{ name: "Wine", files: ["pages/wine.liquid"] }], sections)).toMatch(
      /took these page types off the website: Wine \(pages\/wine\.liquid\)\. Remove them/,
    );
  });

  test("a message written meanwhile: the page looked at, the pages to come left alone", () => {
    const note = reviewNote(state({ "/": "ready" }));
    expect(note).toMatch(/The maker is looking at Home \(\/\)/);
    expect(note).toMatch(/leave the pages still to do as they are \(Visit \(\/visit\), Private dining/);
    expect(reviewNote({ ...state({}), chosen: false })).toMatch(/show them the card of pages with choose_pages/);
    expect(reviewNote(state({ "/": "ready" }), [{ name: "Wine", files: ["pages/wine.liquid"] }])).toMatch(
      /Also remove the pages the maker took off the website: Wine/,
    );
  });
});

describe("the template's texts left", () => {
  test("every file still the template's, until it is rewritten", () => {
    const root = project();
    copyTemplate(CORNER, root);
    const before = templateTextsLeft(root);
    expect(before.map((l) => l.file)).toContain("pages/index.liquid");
    expect(before.some((l) => l.file.startsWith("data/"))).toBe(true);
    // A page rewritten for another business has none left.
    writeFileSync(
      join(root, "pages/index.liquid"),
      "<!doctype html><html><head><title>Bloem — flowers in Ghent</title></head><body><h1>Flowers cut this morning, wrapped in paper.</h1></body></html>",
    );
    const after = templateTextsLeft(root);
    expect(after.map((l) => l.file)).not.toContain("pages/index.liquid");
    expect(after.length).toBe(before.length - 1);
  });

  test("what the agent kept after being told is forgotten; with nothing left the check is over", () => {
    const root = project();
    copyTemplate(CORNER, root);
    const left = templateTextsLeft(root);
    const note = templateLeftNote(left);
    expect(note).toMatch(/sentences of the template's invented business are still in the site/);
    expect(note).toContain(left[0]!.file);
    forgetTemplateTexts(
      root,
      left.flatMap((l) => l.texts),
    );
    expect(templateTextsLeft(root)).toEqual([]);
    expect(existsSync(join(root, TEMPLATE_TEXTS))).toBe(false);
  });

  test("a project not started from a template has nothing to check", () => {
    expect(templateTextsLeft(project())).toEqual([]);
  });
});

describe("a file's sentences", () => {
  test("a page: its texts across inline tags, its alternative texts and description; not Liquid, code or labels", () => {
    const page = `<html><head><title>Home — Corner</title><meta name="description" content="Bread baked slowly on Marlow Street."></head>
<body><h1>Bread, <em>baked</em> slowly. Every loaf takes two days.</h1>
<a href="/menu">See the menu</a>
<img src="/media/oven.jpg" alt="Loaves rising in the deck oven">
<p>Open {{ hours.today }} until seven in the evening.</p>
<script>const greeting = "this is not a sentence for visitors";</script>
{% comment %}A note for the template's author only.{% endcomment %}</body></html>`;
    const s = sentencesOf("pages/index.liquid", page);
    expect(s).toContain("Bread baked slowly on Marlow Street.");
    expect(s).toContain("Bread, baked slowly.");
    expect(s).toContain("Every loaf takes two days.");
    expect(s).toContain("Loaves rising in the deck oven");
    expect(s).toContain("until seven in the evening.");
    expect(s).not.toContain("See the menu");
    expect(s.join(" ")).not.toMatch(/greeting|author only|hours\.today/);
  });

  test("a record: its fields' strings and its Markdown, not its addresses", () => {
    const record = `---
title: "A skate hall that sounds like its own floor."
cover: "/media/hal-cover.jpg"
summary: An indoor skate hall in a former tram depot.
credits: ["Creative direction · Ines Bakker", "Film · Samir"]
---
### The brief

Hal 4 wanted skaters to feel it was theirs before it opened. See [the film](https://example.com) twice.
`;
    const s = sentencesOf("data/cases/hal.md", record);
    expect(s).toContain("A skate hall that sounds like its own floor.");
    expect(s).toContain("An indoor skate hall in a former tram depot.");
    expect(s).toContain("Creative direction · Ines Bakker");
    expect(s).toContain("Hal 4 wanted skaters to feel it was theirs before it opened.");
    expect(s).toContain("See the film twice.");
    expect(s.join(" ")).not.toMatch(/hal-cover|example\.com/);
  });
});
