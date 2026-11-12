import { describe, expect, test } from "vitest";
import type { DroppedBlock, ProjectView } from "./data-drop";
import { placeBlocks, placedAnswer, roleName } from "./place-blocks";

const view = (files: Record<string, string>): ProjectView => ({
  exists: (path) => Object.keys(files).some((f) => f === path || f.startsWith(`${path}/`)),
  read: (path) => files[path],
  templates: () => Object.fromEntries(Object.entries(files).filter(([f]) => /^(pages|parts)\//.test(f))),
});

const gallery: Record<string, DroppedBlock> = {
  "header-simple": {
    id: "header-simple",
    kind: "header",
    source:
      '<header>{% for item in data.navigation %}<a href="{{ item.href }}">{{ item.label }}</a>{% endfor %}</header>',
    data: { name: "navigation", family: "collection" },
    datasource: {
      definition: "label: Navigation\nfields:\n  - name: label\n    kind: text\n  - name: href\n    kind: link\n",
      records: { "home.md": "---\nlabel: Home\nhref: /\n---\n" },
    },
  },
  "hero-centered": { id: "hero-centered", kind: "hero", source: "<section><h1>Everything you need</h1></section>" },
  "faq-accordion": {
    id: "faq-accordion",
    kind: "faq",
    source:
      '<section>{% for q in data.faq %}<input type="radio" name="faq-accordion">{{ q.question }}{% endfor %}</section>',
    data: { name: "faq", family: "section" },
    datasource: {
      definition: "label: Questions\nfields:\n  - name: question\n    kind: text\n",
      records: { "delivery.md": "---\nquestion: Do you deliver?\n---\n", "hours.md": "---\nquestion: When?\n---\n" },
    },
  },
  "blog-cards": {
    id: "blog-cards",
    kind: "blog",
    source: "<section>{% for post in data.blog %}<h2>{{ post.title }}</h2>{% endfor %}</section>",
    data: { name: "blog", family: "collection" },
    datasource: {
      definition: "label: Posts\nfields:\n  - name: title\n    kind: text\n",
      records: { "first.md": "---\ntitle: First\n---\n" },
    },
    detail: "<section><h1>{{ record.title }}</h1></section>",
  },
  "footer-simple": { id: "footer-simple", kind: "footer", source: "<footer>© Your business</footer>" },
};
const block = (id: string) => gallery[id];

test("a part's name from its role", () => {
  expect(roleName("Our menu", "x")).toBe("our-menu");
  expect(roleName("Avis clients", "x")).toBe("avis-clients");
  expect(roleName("Équipe", "x")).toBe("equipe");
  expect(roleName("  ", "hero-centered")).toBe("hero-centered");
});

describe("the site's first page (Q215)", () => {
  const placed = placeBlocks(
    {
      page: "pages/index.liquid",
      title: "Chez Margot",
      description: "A bakery in Lyon",
      lang: "fr",
      // Given in any order: a header goes first, a footer last.
      blocks: [
        { block: "hero-centered", name: "hero" },
        { block: "faq-accordion", name: "questions" },
        { block: "header-simple", name: "header" },
        { block: "footer-simple", name: "footer" },
      ],
    },
    view({}),
    block,
  );
  test("created with its head, each block a part named by its role, rendered in reading order", () => {
    const page = placed.writes["pages/index.liquid"]!;
    expect(page).toContain('<html lang="fr">');
    expect(page).toContain("<title>Chez Margot</title>");
    expect(page).toContain('<meta name="description" content="A bakery in Lyon">');
    const renders = [...page.matchAll(/\{% render '([\w-]+)' %\}/g)].map((m) => m[1]);
    expect(renders).toEqual(["header", "hero", "questions", "footer"]);
    expect(placed.created).toBe(true);
    expect(Object.keys(placed.writes)).toEqual(
      expect.arrayContaining(["parts/hero.liquid", "parts/questions.liquid", "parts/header.liquid"]),
    );
  });
  test("a section list named after its page, its radio group after the part, its samples listed", () => {
    expect(placed.writes["parts/questions.liquid"]).toContain('data["home-faq"]');
    expect(placed.writes["parts/questions.liquid"]).toContain('name="questions"');
    expect(placed.samples).toEqual(["data/home-faq/delivery.md", "data/home-faq/hours.md"]);
    // The navigation is the site's, from its pages, never samples.
    expect(placed.writes["data/navigation/home.md"]).toBeUndefined();
    expect(placed.samples.some((f) => f.startsWith("data/navigation/"))).toBe(false);
  });
  test("its answer says what was written and what to write next", () => {
    const text = placedAnswer({ page: "pages/index.liquid", blocks: [] }, placed);
    expect(text).toContain("Created pages/index.liquid");
    expect(text).toContain("- parts/questions.liquid (faq, from faq-accordion), reading data/home-faq/");
    expect(text).toContain("write this site's records in place of the samples (data/home-faq/delivery.md");
    expect(text).toContain("Check data/navigation/");
  });
});

describe("another page", () => {
  const home = `<!doctype html><html lang="en"><head><title>Chez Margot</title><meta name="description" content="Bread"><meta property="og:title" content="Chez Margot"></head><body>
{% render 'header' %}
<section id="hero"><h1>Bread</h1></section>
{% render 'footer' %}
</body></html>`;
  const files = {
    "pages/index.liquid": home,
    "parts/header.liquid": "<header></header>",
    "parts/footer.liquid": "<footer></footer>",
    "parts/hero.liquid": "<section></section>",
  };
  test("created from the home page's frame, its own title; a taken name numbered", () => {
    const placed = placeBlocks(
      {
        page: "pages/blog.liquid",
        title: "Blog",
        description: "News",
        blocks: [
          { block: "hero-centered", name: "hero" },
          { block: "blog-cards", name: "posts" },
        ],
      },
      view(files),
      block,
    );
    expect(
      placed.writes["pages/blog.liquid"],
    ).toBe(`<!doctype html><html lang="en"><head><title>Blog</title><meta name="description" content="News"><meta property="og:title" content="Blog"></head><body>
{% render 'header' %}
{% render 'hero-2' %}
{% render 'posts' %}
{% render 'footer' %}
</body></html>`);
    // The collection's record page, from this page's frame.
    expect(placed.parts.at(-1)).toMatchObject({
      datasource: "blog",
      family: "collection",
      recordPage: "pages/blog/[blog].liquid",
    });
    expect(placed.writes["pages/blog/[blog].liquid"]).toContain("<h1>{{ record.title }}</h1>");
  });
  test("an existing page keeps its sections; a collection there already is reused, no samples", () => {
    const placed = placeBlocks(
      { page: "pages/index.liquid", blocks: [{ block: "blog-cards", name: "latest posts" }] },
      view({ ...files, "data/blog/_datasource.yaml": "label: Posts\nfields:\n  - name: title\n    kind: text\n" }),
      block,
    );
    expect(placed.created).toBe(false);
    expect(placed.writes["pages/index.liquid"]).toContain(
      "<section id=\"hero\"><h1>Bread</h1></section>\n{% render 'latest-posts' %}\n{% render 'footer' %}",
    );
    expect(placed.parts[0]).toMatchObject({ datasource: "blog", reused: true });
    expect(placed.samples).toEqual([]);
  });
  test("refused: a page that is not one, a new page without its title, a block not in the gallery", () => {
    expect(() =>
      placeBlocks({ page: "parts/x.liquid", blocks: [{ block: "hero-centered", name: "h" }] }, view(files), block),
    ).toThrow(/is not a page/);
    expect(() =>
      placeBlocks({ page: "pages/new.liquid", blocks: [{ block: "hero-centered", name: "h" }] }, view(files), block),
    ).toThrow(/title and description/);
    expect(() =>
      placeBlocks({ page: "pages/index.liquid", blocks: [{ block: "nope", name: "h" }] }, view(files), block),
    ).toThrow(/No block nope/);
  });
});
