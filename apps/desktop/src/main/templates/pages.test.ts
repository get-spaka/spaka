// A template's page types (Q306) and its guide's sections (Q304).
import { describe, expect, test } from "vitest";
import {
  guideSections,
  HOME,
  inGuideOrder,
  pageTypeOf,
  pageTypes,
  routeName,
  sectionLine,
  strayPageHeadings,
} from "./pages";

const GUIDE = `# Ember

An evening restaurant.

## How it is made

The header and the footer read the navigation.

## Pages

### Home (\`/\`)

The hearth, the evening, what is on.

#### How do guests book a table?

- **Online** (as built): the form.

### Events (\`/events\`)

A page per evening.

When removed: point the home page's link to the visit page.

### Menu (\`/menu\`)

The dishes, by course.

## When adapting

Keep one oxblood band per page.`;

describe("page types", () => {
  test("the pages that share their first folder, the home page alone and first", () => {
    const types = pageTypes([
      "pages/menu.liquid",
      "pages/index.liquid",
      "pages/events/[events].liquid",
      "pages/blog/index.liquid",
      "pages/blog/[blog].liquid",
      "pages/topics.liquid",
      "pages/topics/[topics].liquid",
      "parts/header.liquid",
      "theme.css",
    ]);
    expect(types).toEqual([
      { route: "/", files: ["pages/index.liquid"] },
      { route: "/blog", files: ["pages/blog/[blog].liquid", "pages/blog/index.liquid"] },
      { route: "/events", files: ["pages/events/[events].liquid"] },
      { route: "/menu", files: ["pages/menu.liquid"] },
      { route: "/topics", files: ["pages/topics.liquid", "pages/topics/[topics].liquid"] },
    ]);
    expect(pageTypeOf("pages/index.liquid")).toBe(HOME);
    expect(pageTypeOf("pages/work/[projects].liquid")).toBe("/work");
    expect(pageTypeOf("parts/header.liquid")).toBeUndefined();
  });

  test("named after the route when the guide gives no name", () => {
    expect(routeName("/")).toBe("Home");
    expect(routeName("/private-dining")).toBe("Private dining");
  });
});

describe("the guide's sections", () => {
  test("a section per page type under ## Pages, the rest the general part", () => {
    const { general, pages } = guideSections(GUIDE);
    expect(pages.map((p) => [p.route, p.name])).toEqual([
      ["/", "Home"],
      ["/events", "Events"],
      ["/menu", "Menu"],
    ]);
    // A section keeps its heading and its choices; it stops at the next page or ##.
    expect(pages[0]!.text).toMatch(/^### Home \(`\/`\)/);
    expect(pages[0]!.text).toContain("#### How do guests book a table?");
    expect(pages[1]!.text).toContain("When removed:");
    expect(pages[2]!.text).not.toContain("oxblood");
    expect(general).toContain("## How it is made");
    expect(general).toContain("## When adapting");
    expect(general).not.toContain("## Pages");
    expect(general).not.toContain("A page per evening.");
    expect(sectionLine(pages[1]!.text)).toBe("A page per evening.");
  });

  test("without ## Pages, all of it is general; a heading without its route is named", () => {
    expect(guideSections("# Corner\n\nA shop.")).toEqual({ general: "# Corner\n\nA shop.", pages: [] });
    expect(strayPageHeadings("## Pages\n\n### Home (`/`)\n\n### The menu\n")).toEqual(["### The menu"]);
  });

  test("page types in the guide's order, those it does not name last, the home page first", () => {
    const sections = guideSections(GUIDE);
    const ordered = inGuideOrder(
      [{ route: "/menu" }, { route: "/story" }, { route: "/events" }, { route: "/" }],
      sections,
    );
    expect(ordered.map((t) => t.route)).toEqual(["/", "/events", "/menu", "/story"]);
  });
});
