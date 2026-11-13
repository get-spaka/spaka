import { describe, expect, test } from "vitest";
import {
  type DroppedBlock,
  dropData,
  framePage,
  navigationLinks,
  type ProjectView,
  pageKey,
  renameData,
} from "./data-drop";

const view = (files: Record<string, string>): ProjectView => ({
  exists: (path) => Object.keys(files).some((f) => f === path || f.startsWith(`${path}/`)),
  read: (path) => files[path],
  templates: () => Object.fromEntries(Object.entries(files).filter(([f]) => /^(pages|parts)\//.test(f))),
});

const home = `<!doctype html><html><head><title>Chez Margot — Bakery</title></head><body>
{% render 'header' %}
<section id="hero"><h1>Bread</h1></section>
<section id="hours"><p>Open</p></section>
{% render 'footer' %}
</body></html>`;

const faq: DroppedBlock = {
  id: "faq-accordion",
  kind: "faq",
  source:
    "<section>{% for q in data.faq %}<details><summary>{{ q.question }}</summary></details>{% endfor %}</section>",
  data: { name: "faq", family: "section" },
  datasource: {
    definition: "label: Questions\nfields:\n  - name: question\n    kind: text\n  - name: answer\n    kind: markdown\n",
    records: { "delivery.md": "---\nquestion: Do you deliver?\n---\n" },
  },
};

const team: DroppedBlock = {
  id: "team-grid",
  kind: "team",
  source: "<section>{% for m in data.team %}<h3>{{ m.name }}</h3>{% endfor %}</section>",
  data: { name: "team", family: "collection" },
  datasource: {
    definition:
      "label: Team\nfields:\n  - name: name\n    kind: text\n  - name: role\n    kind: text\n  - name: photo\n    kind: image\n",
    records: { "anna.md": "---\nname: Anna\n---\n" },
  },
};

const blog: DroppedBlock = {
  id: "blog-cards",
  kind: "blog",
  source:
    '<section>{% for post in data.blog %}<a href="/blog/{{ post.id }}">{{ post.title }}</a>{% endfor %}</section>',
  data: { name: "blog", family: "collection" },
  datasource: {
    definition: "label: Posts\nfields:\n  - name: title\n    kind: text\n",
    records: { "first.md": "---\ntitle: First\n---\n" },
  },
  detail: '<section class="post"><h1>{{ record.title }}</h1></section>',
};

describe("names (Q201)", () => {
  test("a page's part of a section list's name", () => {
    expect(pageKey("pages/index.liquid")).toBe("home");
    expect(pageKey("pages/services.liquid")).toBe("services");
    expect(pageKey("pages/about/team.liquid")).toBe("about-team");
    expect(pageKey("pages/blog/index.liquid")).toBe("blog");
  });
  test("a template made to read another datasource", () => {
    expect(renameData("{% for q in data.faq %}{{ data.faqs }}{% endfor %}{{ data['faq'] }}", "faq", "home-faq")).toBe(
      '{% for q in data["home-faq"] %}{{ data.faqs }}{% endfor %}{{ data["home-faq"] }}',
    );
  });
  test("a section list is named after its page, a second one on that page numbered", () => {
    const drop = dropData(faq, "pages/index.liquid", view({ "pages/index.liquid": home }));
    expect(drop.datasource).toBe("home-faq");
    expect(drop.source).toContain('data["home-faq"]');
    expect(Object.keys(drop.writes).sort()).toEqual(["data/home-faq/_datasource.yaml", "data/home-faq/delivery.md"]);
    const again = dropData(faq, "pages/index.liquid", view({ "pages/index.liquid": home, ...drop.writes }));
    expect(again.datasource).toBe("home-faq-2");
    const other = dropData(faq, "pages/services.liquid", view({ "pages/index.liquid": home, ...drop.writes }));
    expect(other.datasource).toBe("services-faq");
  });
});

describe("a collection (Q198)", () => {
  test("new: its definition and sample records, in lorem ipsum (Q223), its name kept", () => {
    const drop = dropData(team, "pages/index.liquid", view({ "pages/index.liquid": home }));
    expect(drop).toMatchObject({ datasource: "team", source: team.source });
    expect(drop.writes["data/team/anna.md"]).toBe("---\nname: Lorem\n---\n");
  });
  test("reused: the fields it lacks added, no sample records, a field of another kind kept", () => {
    const files = {
      "pages/index.liquid": home,
      "data/team/_datasource.yaml":
        "label: Our team # by the agent\nfields:\n  - name: name\n    kind: text\n  - name: photo\n    kind: text\n",
      "data/team/zoe.md": "---\nname: Zoe\n---\n",
    };
    const drop = dropData(team, "pages/about.liquid", view(files));
    expect(drop).toMatchObject({ datasource: "team", reused: true, differ: ["photo"] });
    expect(drop.writes).toEqual({
      "data/team/_datasource.yaml":
        "label: Our team # by the agent\nfields:\n  - name: name\n    kind: text\n  - name: photo\n    kind: text\n  - name: role\n    kind: text\n",
    });
    // Nothing missing: nothing written.
    const twice = dropData(team, "pages/about.liquid", view({ ...files, ...drop.writes }));
    expect(twice.writes).toEqual({});
  });
});

describe("a record page from the page's frame (Q199, Q200)", () => {
  test("its head, header and footer, the detail between them, the record's title in its title", () => {
    const drop = dropData(blog, "pages/index.liquid", view({ "pages/index.liquid": home }));
    expect(drop.recordPage).toBe("pages/blog/[blog].liquid");
    expect(
      drop.writes["pages/blog/[blog].liquid"],
    ).toBe(`<!doctype html><html><head><title>{{ record.title }} · Chez Margot — Bakery</title></head><body>
{% render 'header' %}
<section class="post"><h1>{{ record.title }}</h1></section>
{% render 'footer' %}
</body></html>`);
  });
  test("kept when the collection has one, written for a page with only a header", () => {
    const existing = { "pages/index.liquid": home, "pages/news/[blog].liquid": "<h1>{{ record.title }}</h1>" };
    expect(dropData(blog, "pages/index.liquid", view(existing)).recordPage).toBeUndefined();
    const framed = framePage("<body><header>Hi</header></body>", "<section>D</section>", "title");
    expect(framed).toBe("<body><header>Hi</header>\n<section>D</section>\n</body>");
    // A page's own sections give way to the detail.
    expect(framePage("<body><p>x</p></body>", "<section>D</section>", "title")).toBe(
      "<body><section>D</section></body>",
    );
  });
});

describe("the site's navigation, written once (Q209)", () => {
  const header = `<header class="navbar"><a href="/" class="text-xl">Chez Margot</a><nav><a href="/menu">Notre carte</a><a href="/about">  L'équipe </a><a href="/menu">Carte</a></nav><a class="btn btn-primary" href="/order">Commander</a></header>`;
  const navigation: DroppedBlock = {
    id: "header-simple",
    kind: "header",
    source:
      '<header>{% for item in data.navigation %}<a href="{{ item.href }}">{{ item.label }}</a>{% endfor %}</header>',
    data: { name: "navigation", family: "collection" },
    datasource: {
      definition:
        "label: Navigation\nfields:\n  - name: label\n    kind: text\n  - name: href\n    kind: link\n  - name: place\n    kind: choice\n    choices: [header, footer, both, social]\n  - name: links\n    kind: links\n",
      records: { "home.md": "---\nlabel: Home\nhref: /\n---\n" },
    },
  };
  test("from the links the header has, in the site's language, not its logo nor its buttons", () => {
    const files = { "pages/index.liquid": home, "parts/header.liquid": header };
    expect(navigationLinks(home, view(files))).toEqual([
      { label: "Notre carte", href: "/menu" },
      { label: "L'équipe", href: "/about" },
    ]);
    const drop = dropData(navigation, "pages/index.liquid", view(files));
    expect(drop.writes["data/navigation/notre-carte.md"]).toBe(
      "---\nlabel: Notre carte\nhref: /menu\nplace: both\n---\n",
    );
    expect(drop.writes["data/navigation/_datasource.yaml"]).toContain("order: [notre-carte, l-equipe]");
    expect(drop.writes["data/navigation/home.md"]).toBeUndefined();
  });
  test("from the pages' titles when the header has none, home first", () => {
    const files = {
      "pages/index.liquid": home,
      "pages/menu.liquid": "<title>La carte — Chez Margot</title>",
      "pages/about.liquid": "<p>no title</p>",
      "pages/blog/[blog].liquid": "<title>x</title>",
      "pages/_draft.liquid": "<title>Draft</title>",
    };
    expect(navigationLinks(home, view(files))).toEqual([
      { label: "Chez Margot", href: "/" },
      { label: "About", href: "/about" },
      { label: "La carte", href: "/menu" },
    ]);
  });
});
