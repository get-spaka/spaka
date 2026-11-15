// The problems a look measures (Q318): the page's own, and the links Upstart
// checks against the website's pages. The measure itself runs in a page:
// e2e/looks.e2e.ts checks it, e2e/looks-templates.e2e.ts over the templates.
import { describe, expect, test } from "vitest";
import { measure, problemsOf } from "./look-measure";
import { lookText } from "./look-steps";

describe("the problems measured", () => {
  test("add the links to an address no page has, at most four named", () => {
    const links = ["/menu", "/reservations", "/a", "/b", "/c", "/d"].map((path) => ({
      path,
      name: `a "${path}" (pages/index.liquid:3)`,
    }));
    expect(problemsOf({ problems: ["Text cut off: h2."], links }, (path) => path === "/menu")).toEqual([
      "Text cut off: h2.",
      'Links to an address no page has: /reservations (a "/reservations" (pages/index.liquid:3)); /a (a "/a" (pages/index.liquid:3)); /b (a "/b" (pages/index.liquid:3)); /c (a "/c" (pages/index.liquid:3)); and 1 more.',
    ]);
    expect(problemsOf({ problems: [], links: links.slice(0, 1) }, () => true)).toEqual([]);
    expect(problemsOf(undefined, () => true)).toEqual([]);
  });

  test("are measured against the screen's own width", () => {
    expect(measure(393)).toContain("const W = 393,");
  });

  test("are said in the answer, or that there are none", () => {
    const seen = { route: "/", screen: "phone" as const, errors: [], notes: [] };
    expect(lookText({ ...seen, problems: ["Text cut off: h2."] })).toContain(
      "Problems measured on this screen:\n- Text cut off: h2.",
    );
    expect(lookText({ ...seen, problems: [] })).toContain("No problems measured on this screen.");
  });
});
