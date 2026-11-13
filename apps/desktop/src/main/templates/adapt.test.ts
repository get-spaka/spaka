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
  sentencesOf,
  TEMPLATE_TEXTS,
  templateLeftNote,
  templateTextsLeft,
} from "./adapt";

const CORNER = join(import.meta.dirname, "../../../templates/corner");
const project = () => mkdtempSync(join(tmpdir(), "upstart-adapt-"));

describe("a template copied into a new project", () => {
  test("its site, its blocks and design notes; not its manifest or pictures", () => {
    const root = project();
    const manifest = copyTemplate(CORNER, root);
    expect(manifest).toMatchObject({ id: "corner", name: "Corner" });
    expect(existsSync(join(root, "pages/index.liquid"))).toBe(true);
    expect(existsSync(join(root, "theme.css"))).toBe(true);
    expect(existsSync(join(root, ".upstart/skills/corner-design/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, "template.json"))).toBe(false);
    expect(existsSync(join(root, "pictures"))).toBe(false);
    const stored = JSON.parse(readFileSync(join(root, TEMPLATE_TEXTS), "utf8"));
    expect(stored.template).toBe("corner");
    expect(stored.texts.length).toBeGreaterThan(50);
  });

  test("the agent is told what adapting means, the design notes to read, then the maker's message", () => {
    const text = adaptMessage(
      { id: "corner", name: "Corner", description: "A neighborhood shop." },
      "A flower shop in Ghent.",
    );
    expect(text).toContain('template "Corner"');
    expect(text).toContain("corner-design skill");
    expect(text).toMatch(/Rewrite every text/);
    expect(text).toMatch(/find_images/);
    expect(text).toMatch(/Keep the design/);
    expect(text).toMatch(/look at each page with look_at_preview/);
    expect(text.endsWith("A flower shop in Ghent.")).toBe(true);
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
