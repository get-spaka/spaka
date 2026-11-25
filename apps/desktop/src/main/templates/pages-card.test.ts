// The card of pages (Q302, Q310): what the agent may show, what Spaka
// refuses, and what the maker's answer does to the adaptation.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { copyTemplate } from "./adapt";
import { readAdaptation } from "./adaptation";
import { pagesAnswered, readPagesCard } from "./pages-card";

const EMBER = join(import.meta.dirname, "../../../templates/ember");

function ember() {
  const root = mkdtempSync(join(tmpdir(), "spaka-pages-card-"));
  copyTemplate(EMBER, root);
  return root;
}
const page = (route: string, name: string, checked = true) => ({ route, name, line: `${name}.`, checked });
const CARD = {
  language: "English",
  pages: [
    page("/", "Home"),
    page("/visit", "Visit"),
    page("/menu", "Tapas"),
    page("/wine", "Sherry"),
    page("/events", "Flamenco"),
    page("/private-dining", "Private dining", false),
    page("/story", "Story"),
  ],
  new: [{ route: "/shop", name: "Shop", line: "Sherry to take home." }],
};

describe("the card of pages", () => {
  test("the template's page types in the guide's order, the agent's names and checks, the new pages last", () => {
    const read = readPagesCard(ember(), CARD);
    if (!("pages" in read)) throw new Error(read.problem);
    expect(read.pages.map((p) => p.route)).toEqual([
      "/",
      "/visit",
      "/menu",
      "/wine",
      "/events",
      "/private-dining",
      "/story",
      "/shop",
    ]);
    expect(read.pages.find((p) => p.route === "/menu")).toEqual({
      route: "/menu",
      name: "Tapas",
      line: "Tapas.",
      checked: true,
    });
    expect(read.pages.find((p) => p.route === "/private-dining")?.checked).toBe(false);
    expect(read.pages.at(-1)).toEqual({
      route: "/shop",
      name: "Shop",
      line: "Sherry to take home.",
      checked: true,
      new: true,
    });
  });

  test("the home page is always kept; a page type left out is kept under the guide's name", () => {
    const read = readPagesCard(ember(), {
      language: "English",
      pages: [page("/", "Home", false), page("/visit", "Visit")],
    });
    if (!("pages" in read)) throw new Error(read.problem);
    expect(read.pages[0]!.checked).toBe(true);
    expect(read.pages.find((p) => p.route === "/story")).toMatchObject({ name: "Story", checked: true });
  });

  test("Spaka refuses a card it cannot show, saying why", () => {
    const root = ember();
    const problem = (input: unknown) => {
      const read = readPagesCard(root, input);
      return "problem" in read ? read.problem : "";
    };
    // The language first, which the names are written in.
    expect(problem({ pages: CARD.pages })).toMatch(/language/);
    expect(problem({ ...CARD, pages: [page("/", "Home"), page("/bar", "Bar")] })).toMatch(
      /No page type of the template has the route \/bar/,
    );
    expect(problem({ ...CARD, new: [{ route: "/our shop", name: "Shop", line: "" }] })).toMatch(/route/);
    expect(problem({ ...CARD, new: [{ route: "/menu", name: "Menu", line: "" }] })).toMatch(/put it in `pages`/);
    expect(problem(CARD)).toBe("");
    // Outside an adaptation, and once the maker chose.
    expect("problem" in readPagesCard(mkdtempSync(join(tmpdir(), "spaka-no-adaptation-")), CARD)).toBe(true);
    const read = readPagesCard(root, CARD);
    if (!("pages" in read)) throw new Error(read.problem);
    pagesAnswered(root, read.pages, { kind: "skipped" });
    expect(problem(CARD)).toMatch(/chose the pages already/);
  });

  test("the maker's answer: the pages kept in order, those to remove now, the new ones last", () => {
    const root = ember();
    const read = readPagesCard(root, CARD);
    if (!("pages" in read)) throw new Error(read.problem);
    const text = pagesAnswered(root, read.pages, {
      kind: "pages",
      kept: ["/", "/visit", "/menu", "/events", "/shop"],
    });
    expect(text).toMatch(
      /^The maker kept these pages, adapted one at a time in this order: Home \(\/\), Visit \(\/visit\), Tapas \(\/menu\), Flamenco \(\/events\), Shop \(\/shop, new\)\./,
    );
    expect(text).toMatch(
      /Not kept, to remove in this turn .*: Sherry \(\/wine\), Private dining \(\/private-dining\), Story \(\/story\)\./,
    );
    const state = readAdaptation(root)!;
    expect(state.chosen).toBe(true);
    expect(Object.fromEntries(state.steps.map((s) => [s.route, s.status]))).toEqual({
      "/": "doing",
      "/visit": "todo",
      "/menu": "todo",
      "/wine": "removed",
      "/events": "todo",
      "/private-dining": "removed",
      "/story": "removed",
      "/shop": "todo",
    });
  });

  test("skipped, the agent's checks stand; in the maker's own words, the card comes again", () => {
    const root = ember();
    const read = readPagesCard(root, CARD);
    if (!("pages" in read)) throw new Error(read.problem);
    expect(pagesAnswered(root, read.pages, { kind: "words", text: "No wine page, please." })).toMatch(
      /Show the card of pages again with choose_pages/,
    );
    expect(readAdaptation(root)!.chosen).toBe(false);
    expect(pagesAnswered(root, read.pages, { kind: "skipped" })).toMatch(/did not change your choice/);
    expect(readAdaptation(root)!.steps.find((s) => s.route === "/private-dining")?.status).toBe("removed");
  });
});
