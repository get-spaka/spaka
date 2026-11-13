import { describe, expect, test } from "vitest";
import { Datasources, recordOf, splitRecord } from "./data.ts";
import { addCreditsLink } from "./media.ts";
import { Runtime } from "./runtime.ts";
import { memorySource, Overlay } from "./source.ts";

const page = (body: string) =>
  `<!doctype html>\n<html>\n<head><title>T</title></head>\n<body>\n${body}\n</body>\n</html>`;

const definition = `label: Posts
fields:
  - name: title
    kind: text
    required: true
  - name: date
    kind: date
  - name: cover
    kind: image
  - name: tags
    kind: list
  - name: status
    kind: choice
    choices: [draft, published]
  - name: body
    kind: markdown
body: body
sort: -date
`;

const files = {
  "data/posts/_datasource.yaml": definition,
  "data/posts/hello-world.md":
    "---\ntitle: Hello world\ndate: 2026-11-01\ncover: media/cafe.jpg\ntags: [news]\n---\n# Hi\n\nSome *text*.\n",
  "data/posts/second.md": "---\ntitle: Second\ndate: 2026-11-05\nstatus: maybe\n---\nMore.\n",
  "data/posts/broken.md": "---\ntitle: [unclosed\n---\nx\n",
  "data/posts/untitled.md": "---\ndate: 2026-10-01\n---\n",
  "pages/index.liquid": page(
    `<ul>{% for post in data.posts %}<li><a href="/blog/{{ post.id }}">{{ post.title }}</a></li>{% endfor %}</ul>`,
  ),
  "pages/blog/[posts].liquid": page(`<article><h1>{{ record.title }}</h1>{{ record.body }}</article>`),
};

describe("a datasource", () => {
  const data = new Datasources(memorySource(files));

  test("records in the definition's order, long text as HTML, values checked", () => {
    const posts = data.get("posts");
    expect(posts.definition?.label).toBe("Posts");
    expect(posts.records.map((r) => r.id)).toEqual(["second", "hello-world", "untitled"]);
    const hello = posts.records.find((r) => r.id === "hello-world")!;
    expect(hello).toMatchObject({
      title: "Hello world",
      date: "2026-11-01",
      cover: "/media/cafe.jpg",
      tags: ["news"],
      __ref: "posts/hello-world",
    });
    expect(hello.body).toContain("<h1>Hi</h1>");
    expect(hello.body).toContain("<em>text</em>");
    // A value of the wrong kind shows empty; a missing required one too, both said (Q166).
    expect(posts.records.find((r) => r.id === "second")!.status).toBe("");
    expect(posts.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "second", problems: ["status is not one of draft, published"], skipped: false }),
        expect.objectContaining({ id: "untitled", problems: ["title is required"], skipped: false }),
        expect.objectContaining({ id: "broken", skipped: true }),
      ]),
    );
  });

  test("a manual order without a sort", () => {
    const manual = new Datasources(
      memorySource({
        "data/team/_datasource.yaml": "fields:\n  - name: name\n    kind: text\norder: [zoe, adam]\n",
        "data/team/adam.md": "---\nname: Adam\n---\n",
        "data/team/zoe.md": "---\nname: Zoe\n---\n",
        "data/team/bea.md": "---\nname: Bea\n---\n",
      }),
    );
    const team = manual.get("team");
    expect(team.definition?.label).toBe("Team");
    expect(team.records.map((r) => r.id)).toEqual(["zoe", "adam", "bea"]);
  });

  test("a record file split into its fields and its text", () => {
    expect(splitRecord("---\na: 1\n---\nBody\n")).toEqual({ yaml: "a: 1\n", body: "Body\n" });
    expect(splitRecord("---\na: 1\nb: 2")).toBeUndefined();
    expect(recordOf("data/posts/hello.md")).toEqual({ datasource: "posts", id: "hello" });
    expect(recordOf("data/posts/_datasource.yaml")).toBeUndefined();
  });
});

describe("in pages", () => {
  const runtime = new Runtime(memorySource(files));

  test("a loop over data.posts, each element traced to its record", () => {
    const result = runtime.renderRoute("/");
    expect(result.html).toMatch(/<li data-up-src="pages\/index.liquid:[\d:]+" data-up-rec="posts\/second">/);
    expect(result.html.indexOf("Second")).toBeLessThan(result.html.indexOf("Hello world"));
    // The notes of the datasource reach the render, for the agent's look at the preview.
    expect(result.notes.map((n) => n.file)).toEqual(
      expect.arrayContaining(["data/posts/broken.md", "data/posts/second.md"]),
    );
  });

  test("a page per record, at its id, grouped under the datasource (Q147, Q164)", () => {
    const routes = runtime.routes();
    expect(routes.map((r) => r.route)).toEqual(["/", "/blog/second", "/blog/hello-world", "/blog/untitled"]);
    expect(routes[2]).toEqual({
      route: "/blog/hello-world",
      file: "pages/blog/[posts].liquid",
      record: { datasource: "posts", id: "hello-world" },
      group: "Posts",
      title: "Hello world",
    });
    const result = runtime.renderRoute("/blog/hello-world");
    expect(result.status).toBe(200);
    expect(result.html).toContain("<h1>Hi</h1>");
    expect(result.html).toMatch(/<article data-up-src="[^"]+" data-up-rec="posts\/hello-world">/);
    expect(runtime.routeOf("data/posts/second.md")).toBe("/blog/second");
    expect(runtime.renderRoute("/blog/nope").status).toBe(404);
  });
});

describe("while the agent writes (Q161)", () => {
  test("stand-ins for a datasource not written yet, then shaped by its definition, until a record is complete", () => {
    const overlay = new Overlay(memorySource({ "pages/index.liquid": files["pages/index.liquid"] }));
    const runtime = new Runtime(overlay, { standIns: true });
    overlay.set("theme.css", ":root{}");
    // Nothing written: three stand-ins, any field a short text.
    let html = runtime.renderRoute("/").html;
    expect(html.match(/<li /g)?.length).toBe(3);
    expect(html).toContain("Lorem ipsum dolor");
    expect(runtime.routes().map((r) => r.route)).toEqual(["/"]);
    // The definition written, a record started but its fields not closed: still stand-ins.
    overlay.set("data/posts/_datasource.yaml", definition);
    overlay.set("data/posts/hello-world.md", "---\ntitle: Hel");
    html = runtime.renderRoute("/").html;
    expect(html.match(/<li /g)?.length).toBe(3);
    // Its fields closed, its text still coming: the real record, alone.
    overlay.set("data/posts/hello-world.md", "---\ntitle: Hello world\n---\nSome te");
    html = runtime.renderRoute("/").html;
    expect(html.match(/<li /g)?.length).toBe(1);
    expect(html).toContain("Hello world");
    // Once the agent is done, a datasource that does not exist is empty, said in a note.
    for (const path of overlay.paths()) overlay.delete(path);
    const done = new Runtime(memorySource({ "pages/index.liquid": files["pages/index.liquid"] }), { standIns: true });
    const result = done.renderRoute("/");
    expect(result.html).not.toContain("<li ");
    expect(result.notes).toContainEqual({ file: "data", note: "no datasource named posts" });
  });
});

describe("media (Q155, Q157)", () => {
  const credit = { author: "Jane Doe", license: "CC BY 4.0", source: "Wikimedia Commons", title: "Café" };
  const project = {
    "pages/index.liquid": page(
      `<img src="/media/cafe.jpg"><img src="/media/logo.png" alt=""><footer><p>Bakery</p></footer>`,
    ),
    "media/cafe.jpg": "",
    "media/cafe.json": JSON.stringify({ alt: "A café's window", credit }),
    "media/logo.png": "",
    "media/logo.json": JSON.stringify({ alt: "Logo", credit: { license: "CC0 1.0" } }),
    "media/unused.jpg": "",
    "media/unused.json": JSON.stringify({ credit: { ...credit, title: "Unused" } }),
  };
  const runtime = new Runtime(memorySource(project));

  test("an image's missing alt comes from the file beside it; an empty one is kept", () => {
    const html = runtime.renderRoute("/").html;
    expect(html).toContain(`<img alt="A café&#39;s window"`);
    expect(html).toContain(`src="/media/logo.png" alt=""`);
  });

  test("a /credits page for the images used whose licence asks for it, linked at the end of the footer", () => {
    const html = runtime.renderRoute("/").html;
    expect(html).toMatch(
      />Bakery<\/p><p data-up-credits[^>]*><a href="\/credits"[^>]*>Image credits<\/a><\/p><\/footer>/,
    );
    expect(runtime.routes().at(-1)).toEqual({ route: "/credits", file: "media", generated: true });
    const credits = runtime.renderRoute("/credits");
    expect(credits.status).toBe(200);
    expect(credits.html).toContain("Jane Doe");
    expect(credits.html).toContain("CC BY 4.0");
    expect(credits.html).not.toContain("Unused");
    expect(credits.html).not.toContain("logo.png");
  });

  test("the credits link is added even when a stylesheet in the page names it", () => {
    expect(addCreditsLink("<style>footer [data-up-credits] { opacity: 0.6 }</style><footer>x</footer>")).toMatch(
      /x<p data-up-credits[^>]*>.*<\/p><\/footer>$/,
    );
    const once = addCreditsLink("<footer>x</footer>");
    expect(addCreditsLink(once)).toBe(once);
  });

  test("no credits page nor link when no image needs one", () => {
    const plain = new Runtime(memorySource({ ...project, "media/cafe.json": JSON.stringify({ alt: "x" }) }));
    expect(plain.renderRoute("/").html).not.toContain("Image credits");
    expect(plain.renderRoute("/credits").status).toBe(404);
  });
});

describe("a list of links (Q208, Q212)", () => {
  const nav = `label: Navigation
fields:
  - name: label
    kind: text
  - name: href
    kind: link
  - name: links
    kind: links
`;
  test("each link keeps its label and address; one lacking either is left out", () => {
    const data = new Datasources(
      memorySource({
        "data/navigation/_datasource.yaml": nav,
        "data/navigation/services.md":
          "---\nlabel: Services\nhref: /services\nlinks:\n  - label: Bread\n    href: /bread\n  - label: '  Cakes '\n    href: ' /cakes'\n  - label: No address\n  - href: /no-label\n---\n",
        "data/navigation/home.md": "---\nlabel: Home\nhref: /\n---\n",
        "data/navigation/odd.md": "---\nlabel: Odd\nlinks: just a text\n---\n",
      }),
    );
    const ds = data.get("navigation");
    const byId = Object.fromEntries(ds.records.map((r) => [r.id, r]));
    expect(byId.services?.links).toEqual([
      { label: "Bread", href: "/bread" },
      { label: "Cakes", href: "/cakes" },
    ]);
    expect(byId.home?.links).toEqual([]);
    expect(ds.problems.map((p) => [p.id, p.problems])).toEqual([
      ["odd", ["links is not a list of links, each with a label and an address"]],
    ]);
  });
  test("a menu's links are looped over in a page, and stand-ins give them a shape", () => {
    const files = {
      "data/navigation/_datasource.yaml": nav,
      "pages/index.liquid": page(
        '<nav>{% for item in data.navigation %}<a>{{ item.label }}</a>{% for link in item.links %}<a href="{{ link.href }}">{{ link.label }}</a>{% endfor %}{% endfor %}</nav>',
      ),
    };
    // While the agent writes, before any record: stand-ins.
    const overlay = new Overlay(memorySource(files));
    overlay.set("theme.css", ":root{}");
    const shown = new Runtime(overlay, { standIns: true }).renderRoute("/").html;
    expect(shown).toContain(">First link</a>");
    expect(shown).toContain(">Second link</a>");
  });
});

test("an empty field is false in a template: no image for a record without one", () => {
  const runtime = new Runtime(
    memorySource({
      "data/team/_datasource.yaml": "fields:\n  - name: name\n    kind: text\n  - name: photo\n    kind: image\n",
      "data/team/ana.md": "---\nname: Ana\n---\n",
      "data/team/bo.md": "---\nname: Bo\nphoto: media/bo.jpg\n---\n",
      "media/bo.jpg": "",
      "pages/index.liquid": page(
        '{% for m in data.team %}{% if m.photo %}<img src="{{ m.photo }}">{% else %}<i>{{ m.name }}</i>{% endif %}{% endfor %}',
      ),
    }),
  );
  const html = runtime.renderRoute("/").html;
  expect(html).toContain(">Ana</i>");
  expect(html).toContain('src="/media/bo.jpg"');
  expect(html).not.toContain('src=""');
});
