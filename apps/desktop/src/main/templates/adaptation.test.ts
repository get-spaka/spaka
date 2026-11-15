// A website's adaptation from its template, page type by page type (Q302-Q313):
// where it stands, what Continue does, the page types taken off, and which
// files the check for the template's texts looks at meanwhile.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { copyTemplate, templateTextsLeft } from "./adapt";
import {
  ADAPTATION,
  adaptationGuide,
  adaptationScope,
  adaptationView,
  choosePages,
  continueAdaptation,
  pickNext,
  readAdaptation,
  removalsLeft,
  removeStep,
  turnEnded,
  upcomingStep,
} from "./adaptation";

const EMBER = join(import.meta.dirname, "../../../templates/ember");
const ROUTES = ["/", "/events", "/menu", "/private-dining", "/story", "/visit", "/wine"];

function ember() {
  const root = mkdtempSync(join(tmpdir(), "upstart-adaptation-"));
  copyTemplate(EMBER, root);
  return root;
}
const statuses = (root: string) => Object.fromEntries(readAdaptation(root)!.steps.map((s) => [s.route, s.status]));

describe("an adaptation", () => {
  test("starts with the copy: every page type to do, the guide kept beside it, not in the website", () => {
    const root = ember();
    const state = readAdaptation(root)!;
    expect(state).toMatchObject({ template: "ember", chosen: false });
    expect(state.steps.map((s) => s.route).sort()).toEqual(ROUTES);
    expect(state.steps[0]!.route).toBe("/");
    expect(state.steps.every((s) => s.status === "todo")).toBe(true);
    expect(existsSync(join(root, ADAPTATION, "TEMPLATE.md"))).toBe(true);
    expect(existsSync(join(root, "TEMPLATE.md"))).toBe(false);
    expect(readFileSync(join(root, ADAPTATION, "TEMPLATE.md"), "utf8")).toContain("# Ember");
    expect(adaptationGuide(root)?.general).toContain("Ember");
  });

  test("the card of pages: the home page adapted first, the others to do, those not kept removed, new ones last", () => {
    const root = ember();
    choosePages(root, ["/menu", "/events", "/visit", "/shop"], { "/menu": { name: "La carte", line: "Les plats." } }, [
      { route: "/shop", name: "Boutique", line: "Les bons cadeaux." },
      { route: "/blog", name: "Journal", line: "Unchecked." },
    ]);
    const state = readAdaptation(root)!;
    expect(state.chosen).toBe(true);
    expect(statuses(root)).toEqual({
      "/": "doing",
      "/events": "todo",
      "/menu": "todo",
      "/private-dining": "removed",
      "/story": "removed",
      "/visit": "todo",
      "/wine": "removed",
      "/shop": "todo",
    });
    expect(state.steps.at(-1)).toMatchObject({ route: "/shop", name: "Boutique", new: true });
    expect(state.steps.find((s) => s.route === "/menu")).toMatchObject({ name: "La carte", line: "Les plats." });
    expect(adaptationView(state)?.steps.find((s) => s.route === "/shop")).toEqual({
      route: "/shop",
      name: "Boutique",
      status: "todo",
      new: true,
    });
  });

  test("Continue: the page looked at is done, the next one adapted; a pick comes next; the last ends it", () => {
    const root = ember();
    choosePages(root, ["/menu", "/events"], {}, []);
    // The home page's turn ends: the maker looks at it.
    expect(turnEnded(root, true).finished).toBe(false);
    expect(statuses(root)["/"]).toBe("ready");
    expect(upcomingStep(readAdaptation(root)!)?.route).toBe("/events");
    // A click on a page to do makes it the next one (Q313).
    pickNext(root, "/menu");
    expect(readAdaptation(root)!.next).toBe("/menu");
    expect(continueAdaptation(root)?.route).toBe("/menu");
    expect(statuses(root)).toMatchObject({ "/": "done", "/menu": "doing", "/events": "todo" });
    expect(readAdaptation(root)!.next).toBeUndefined();
    turnEnded(root, true);
    expect(continueAdaptation(root)?.route).toBe("/events");
    // The last page type's turn ends: the adaptation is over, its folder gone (Q307).
    const removed = readAdaptation(root)!.steps.filter((s) => s.status === "removed");
    for (const s of removed) rmSync(join(root, "pages", `${s.route.slice(1)}.liquid`), { force: true });
    expect(turnEnded(root, true)).toEqual({ finished: true });
    expect(existsSync(join(root, ADAPTATION))).toBe(false);
    expect(readAdaptation(root)).toBeUndefined();
  });

  test("a turn stopped or left by Upstart closing keeps its page being adapted; Continue takes it up again", () => {
    const root = ember();
    choosePages(root, ["/menu"], {}, []);
    turnEnded(root, true);
    continueAdaptation(root);
    turnEnded(root, false);
    expect(statuses(root)["/menu"]).toBe("doing");
    expect(continueAdaptation(root)?.route).toBe("/menu");
  });

  test("a first turn that never showed the card keeps every page type", () => {
    const root = ember();
    turnEnded(root, true);
    const state = readAdaptation(root)!;
    expect(state.chosen).toBe(true);
    expect(statuses(root)["/"]).toBe("ready");
    expect(state.steps.filter((s) => s.status === "todo")).toHaveLength(ROUTES.length - 1);
  });

  test("a page type taken off the list is removed: its pages are named until they are gone", () => {
    const root = ember();
    choosePages(root, ROUTES, {}, []);
    removeStep(root, "/wine");
    removeStep(root, "/"); // never the home page
    expect(statuses(root)).toMatchObject({ "/": "doing", "/wine": "removed" });
    expect(removalsLeft(root).map((r) => [r.step.route, r.files])).toEqual([["/wine", ["pages/wine.liquid"]]]);
    rmSync(join(root, "pages/wine.liquid"));
    expect(removalsLeft(root)).toEqual([]);
  });
});

describe("the check for the template's texts during the adaptation (Q305)", () => {
  test("the home page and what every page shares; not the pages to do, nor the records the home page only teases", () => {
    const root = ember();
    choosePages(root, ROUTES, {}, []);
    const scope = adaptationScope(root)!;
    const files = templateTextsLeft(root).map((l) => l.file);
    const inScope = files.filter(scope);
    expect(inScope).toContain("pages/index.liquid");
    expect(inScope).toContain("parts/header.liquid");
    expect(inScope).toContain("parts/footer.liquid");
    // Only the home page shows them.
    expect(inScope.some((f) => f.startsWith("data/home-evening/"))).toBe(true);
    // Every page shows the footer's hours.
    expect(inScope.some((f) => f.startsWith("data/hours/"))).toBe(true);
    expect(inScope).not.toContain("pages/menu.liquid");
    expect(inScope).not.toContain("parts/reserve.liquid");
    expect(inScope.some((f) => f.startsWith("data/menu/") || f.startsWith("data/events/"))).toBe(false);
    // Once the menu is being adapted, its page and its dishes are looked at.
    turnEnded(root, true);
    pickNext(root, "/menu");
    continueAdaptation(root);
    const now = adaptationScope(root)!;
    expect(now("pages/menu.liquid")).toBe(true);
    expect(files.filter(now).some((f) => f.startsWith("data/menu/"))).toBe(true);
    expect(now("pages/visit.liquid")).toBe(false);
  });

  test("outside an adaptation, every file", () => {
    expect(adaptationScope(mkdtempSync(join(tmpdir(), "upstart-none-")))).toBeUndefined();
  });
});
