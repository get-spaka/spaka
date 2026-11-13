import { describe, expect, test } from "vitest";
import { markPending, pendingFiles, placementsOf } from "./pending";
import type { Placed } from "./place-blocks";

const placed: Placed = {
  created: false,
  writes: {
    "pages/index.liquid": "{% render 'hero' %}{% render 'events' %}",
    "parts/hero.liquid": "<section>Build faster</section>\n",
    "parts/events.liquid": "<section>{% for e in data.events %}{{ e.title }}{% endfor %}</section>\n",
    "data/events/_datasource.yaml": "fields: {}\n",
    "data/events/acoustic-evening.md": "---\ntitle: Acoustic evening\n---\n",
    "data/events/open-day.md": "---\ntitle: Open day\n---\n",
    "pages/events/[events].liquid": "<article>{{ record.title }}</article>",
  },
  samples: ["data/events/acoustic-evening.md", "data/events/open-day.md"],
  parts: [
    { part: "parts/hero.liquid", block: "hero-centered", kind: "hero" },
    {
      part: "parts/events.liquid",
      block: "events-list",
      kind: "events",
      datasource: "events",
      family: "collection",
      recordPage: "pages/events/[events].liquid",
    },
  ],
};

describe("sections pending while the agent makes them its own (Q222)", () => {
  const placements = placementsOf(placed);
  const files = (changes: Record<string, string | undefined>) =>
    pendingFiles(placements, (path) => (path in changes ? changes[path] : placed.writes[path]));

  test("as use_block wrote them, the parts and the record page are pending, the page itself is not", () => {
    expect(files({})).toEqual(["pages/events/[events].liquid", "parts/events.liquid", "parts/hero.liquid"]);
  });

  test("a part rewritten turns real; a list turns real once its records are the site's too", () => {
    expect(files({ "parts/hero.liquid": "<section>Le Petit Four</section>\n" })).not.toContain("parts/hero.liquid");
    const partOnly = { "parts/events.liquid": "<section>Our evenings</section>\n" };
    expect(files(partOnly)).toContain("parts/events.liquid");
    const records = {
      ...partOnly,
      "data/events/acoustic-evening.md": "---\ntitle: Jazz and wine evening\n---\n",
      "data/events/open-day.md": undefined,
    };
    expect(files(records)).toEqual(["parts/hero.liquid"]);
  });

  test("a part being written turns real as its new text comes in", () => {
    expect(files({ "parts/hero.liquid": "<section>Le Pe" })).not.toContain("parts/hero.liquid");
  });

  test("a reused datasource's records are the site's: only the part is pending", () => {
    const reused = placementsOf({
      ...placed,
      samples: [],
      parts: [{ ...placed.parts[1]!, reused: true, recordPage: undefined }],
    });
    expect(reused).toEqual([{ file: "parts/events.liquid", written: expect.any(String), samples: {} }]);
  });

  test("the elements a pending file wrote are marked, others left alone", () => {
    const html =
      '<header data-up-src="parts/header.liquid:1:0"><a data-up-src="parts/header.liquid:2:4">Home</a></header>' +
      '<section data-up-src="parts/hero.liquid:1:0"><h1 data-up-src="parts/hero.liquid:2:2">Build</h1></section>';
    expect(markPending(html, ["parts/hero.liquid"])).toBe(
      '<header data-up-src="parts/header.liquid:1:0"><a data-up-src="parts/header.liquid:2:4">Home</a></header>' +
        '<section data-up-skeleton data-up-src="parts/hero.liquid:1:0"><h1 data-up-skeleton data-up-src="parts/hero.liquid:2:2">Build</h1></section>',
    );
    expect(markPending(html, [])).toBe(html);
    expect(markPending(html, ["pages/events/[events].liquid"])).toBe(html);
  });
});
