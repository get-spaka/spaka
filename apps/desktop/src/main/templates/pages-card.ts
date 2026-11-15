// The card of pages of a template's adaptation (Q302, Q310): the agent names
// and describes each page type of the template for the maker's business,
// checks those the message calls for, and adds the pages the template lacks;
// the maker keeps some, and the adaptation goes through them one at a time.
import { z } from "zod";
import type { PageChoice, QuestionAnswer } from "../../shared/conversation";
import { choosePages, readAdaptation } from "./adaptation";
import { HOME } from "./pages";

/** The tool the agent shows it with, in the first turn of an adaptation. */
export const PAGES_TOOL_NAME = "choose_pages";

/** choose_pages's input, field by field: the language first, which the names and lines are then written in. */
export const PAGES_SHAPE = {
  language: z
    .string()
    .describe(
      "The language the maker's message is written in, e.g. \"English\": the site's and this card's. Never the language of the business's country or city: a message in English about a bar in Seville is \"English\".",
    ),
  pages: z
    .array(
      z.object({
        route: z.string().describe('The page type\'s route, as listed in the first message: "/", "/menu", "/events"'),
        name: z.string().describe("Its name for this business, a word or two, in `language`"),
        line: z.string().describe("What it shows for this business, one short line in `language`"),
        checked: z.boolean().describe("Kept unless the maker unchecks it: false when the business has no use for it"),
      }),
    )
    .min(1)
    .max(40)
    .describe("Every page type of the template, the home page first"),
  new: z
    .array(
      z.object({
        route: z.string().describe('A route of its own, e.g. "/shop"'),
        name: z.string().describe("Its name, in `language`"),
        line: z.string().describe("What it will show, one short line in `language`"),
      }),
    )
    .max(8)
    .optional()
    .describe("Pages the maker's message asks for that the template lacks, built from the gallery after the others"),
};
const PagesInput = z.object(PAGES_SHAPE);
export type PagesInput = z.infer<typeof PagesInput>;

export const PAGES_DESCRIPTION = [
  "Only in the first turn of a website started from a template, before any file changes: shows the maker the card of pages and waits for their choice.",
  "First say the language the maker's message is written in, the site's (never the business's country's). Then list every page type of the template (the routes the first message gives), each named and described in one line for this business in that language, checked unless the business has no use for it; the home page is always kept.",
  "Add in `new` the pages the maker's message asks for that the template lacks.",
  "Answers with the pages kept, in the order they are adapted, and those to remove.",
].join(" ");

/** The card's pages, in the adaptation's order, new ones last; or why it cannot be shown. */
export function readPagesCard(root: string, input: unknown): { pages: PageChoice[] } | { problem: string } {
  const state = readAdaptation(root);
  if (!state)
    return {
      problem: "This website is not being adapted from a template: there are no pages to choose. Go on without it.",
    };
  if (state.chosen)
    return {
      problem:
        "The maker chose the pages already. Go on with the adaptation: a page type removed is said in the messages.",
    };
  const parsed = PagesInput.safeParse(input);
  if (!parsed.success)
    return {
      problem: `choose_pages needs \`pages\`: every page type, each with its route, name, line and checked. ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  const routes = state.steps.map((s) => s.route);
  const unknown = parsed.data.pages.filter((p) => !routes.includes(p.route)).map((p) => p.route);
  if (unknown.length)
    return {
      problem: `No page type of the template has the route ${unknown.join(", ")}: use those of the first message (${routes.join(", ")}), and put the pages it lacks in \`new\`.`,
    };
  const added = parsed.data.new ?? [];
  for (const page of added) {
    if (!/^\/[a-z0-9][a-z0-9-]*$/.test(page.route))
      return {
        problem: `A new page's route is a slash and a word or two joined by dashes ("/shop"), not "${page.route}".`,
      };
    if (routes.includes(page.route))
      return { problem: `${page.route} is one of the template's page types: put it in \`pages\`, not in \`new\`.` };
  }
  const given = new Map(parsed.data.pages.map((p) => [p.route, p]));
  const pages: PageChoice[] = state.steps.map((step) => {
    const p = given.get(step.route);
    // A page type the agent left out is kept, under the guide's name.
    return {
      route: step.route,
      name: p?.name.trim() || step.name,
      line: p?.line.trim() || step.line || "",
      checked: step.route === HOME ? true : (p?.checked ?? true),
    };
  });
  const seen = new Set<string>();
  for (const page of added) {
    if (seen.has(page.route)) continue;
    seen.add(page.route);
    pages.push({
      route: page.route,
      name: page.name.trim() || page.route,
      line: page.line.trim(),
      checked: true,
      new: true,
    });
  }
  return { pages };
}

/**
 * The maker's answer, kept in the adaptation, and what the agent reads back.
 * Skipped, or left unanswered, the agent's own checks stand; answered in the
 * maker's own words, the agent shows the card again.
 */
export function pagesAnswered(root: string, pages: PageChoice[], answer: QuestionAnswer): string {
  if (answer.kind === "words")
    return `The maker answered in their own words: ${answer.text}\n\nShow the card of pages again with choose_pages, checked as their words ask.`;
  const kept = new Set(answer.kind === "pages" ? answer.kept : pages.filter((p) => p.checked).map((p) => p.route));
  kept.add(HOME);
  const labels = Object.fromEntries(pages.map((p) => [p.route, { name: p.name, line: p.line }]));
  choosePages(
    root,
    [...kept],
    labels,
    pages.filter((p) => p.new).map((p) => ({ route: p.route, name: p.name, line: p.line })),
  );
  const named = (p: PageChoice) => `${p.name} (${p.route}${p.new ? ", new" : ""})`;
  const keptPages = pages.filter((p) => kept.has(p.route));
  const removed = pages.filter((p) => !kept.has(p.route) && !p.new);
  const how =
    answer.kind === "pages"
      ? "The maker kept these pages"
      : "The maker did not change your choice: these pages are kept";
  return [
    `${how}, adapted one at a time in this order: ${keptPages.map(named).join(", ")}.`,
    removed.length
      ? `Not kept, to remove in this turn as their sections of the guide say ("When removed"): ${removed.map(named).join(", ")}.`
      : "",
    "Go on as the first message said: the home page's choices the message leaves open, then the home page and what every page shares. The other pages come in later turns.",
  ]
    .filter(Boolean)
    .join("\n");
}
