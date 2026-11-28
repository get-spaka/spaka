import { describe, expect, test } from "vitest";
import { Runtime } from "./runtime.ts";
import { memorySource, Overlay } from "./source.ts";

const page = (body: string, title = "T") =>
  `<!doctype html>\n<html lang="en">\n<head><title>${title}</title></head>\n<body>\n${body}\n</body>\n</html>`;

const project = memorySource({
  "theme.css": ":root { --theme-color-primary: #c2410c; }",
  "pages/index.liquid": page(`{% render 'header' %}\n<main><h1>Home</h1><p>{{ page.url }}</p></main>`, "Home"),
  "pages/menu.liquid": page(`{% render 'header' %}<main><h1>Menu</h1></main>`, "Menu"),
  "pages/blog/index.liquid": page("<h1>Blog</h1>"),
  "pages/blog/first.liquid": page("<h1>First</h1>"),
  "parts/header.liquid": `<header><a href="/" class="{% if page.url == '/' %}active{% endif %}">Home</a></header>`,
  "fragments/news.liquid": "<li>{{ params.n | default: 'none' }}</li>",
});

describe("routes", () => {
  const runtime = new Runtime(project);

  test("follow where the page files are", async () => {
    expect(runtime.routes()).toEqual([
      { route: "/", file: "pages/index.liquid" },
      { route: "/blog", file: "pages/blog/index.liquid" },
      { route: "/blog/first", file: "pages/blog/first.liquid" },
      { route: "/menu", file: "pages/menu.liquid" },
    ]);
    expect(runtime.resolve("/menu/")).toBe("pages/menu.liquid");
    expect(runtime.resolve("blog")).toBe("pages/blog/index.liquid");
    expect(runtime.resolve("/nope")).toBeUndefined();
  });
});

describe("rendering", () => {
  test("a page with its shared part, traced, with the runtime's head", async () => {
    const runtime = new Runtime(project, { head: () => `<meta name="x" data-spaka-runtime>` });
    const result = await runtime.renderRoute("/");
    expect(result.status).toBe(200);
    expect(result.file).toBe("pages/index.liquid");
    expect(result.html).toContain(`<head><meta name="x" data-spaka-runtime><title>Home</title>`);
    expect(result.html).toMatch(
      /<!--spaka-inc pages\/index.liquid:\d+:\d+--><header data-spaka-src="parts\/header.liquid:1:0" data-spaka-rec="">/,
    );
    expect(result.html).toContain(`class="active"`);
    expect(result.html).toMatch(/<h1 data-spaka-src="pages\/index.liquid:6:\d+">Home<\/h1>/);
    expect(result.notes).toEqual([]);
  });

  test("without tracing or repair, for an export", async () => {
    const runtime = new Runtime(project, { trace: false, repair: false });
    expect((await runtime.renderRoute("/menu")).html).toContain("<main><h1>Menu</h1></main>");
    expect((await runtime.renderRoute("/menu")).html).not.toContain("data-spaka-src");
  });

  test("a missing shared part renders as nothing, with a note", async () => {
    const runtime = new Runtime(memorySource({ "pages/index.liquid": "{% render 'footer' %}<p>x</p>" }));
    const result = await runtime.renderRoute("/");
    expect(result.status).toBe(200);
    expect(result.html).toContain("<p");
    expect(result.notes).toEqual([{ file: "parts/footer.liquid", note: "missing: rendered as nothing" }]);
  });

  test("a page still being written is cut and closed", async () => {
    const source = new Overlay(project);
    source.set("pages/index.liquid", `<main><section class="hero"><h1>Bread baked at da`);
    const result = await await new Runtime(source).renderRoute("/");
    expect(result.status).toBe(200);
    expect(result.html).toMatch(/<h1 [^>]*>Bread baked at da<\/h1><\/section><\/main>/);
    expect(result.notes[0]?.note).toMatch(/^repaired/);
  });

  test("a render error is reported, not thrown", async () => {
    const runtime = new Runtime(memorySource({ "pages/index.liquid": "{% nosuchtag %}" }));
    const result = await runtime.renderRoute("/");
    expect(result.status).toBe(500);
    expect(result.notes[0]?.note).toMatch(/render error/);
  });

  test("fragments and the theme", async () => {
    const runtime = new Runtime(project, { trace: false });
    expect((await runtime.renderFragment("news", { params: { n: "3" } })).html).toBe("<li>3</li>");
    expect((await runtime.renderFragment("nope")).status).toBe(404);
    expect(runtime.theme()).toContain("#c2410c");
  });

  test("a shared part shown on its own while no page exists yet", async () => {
    const runtime = new Runtime(memorySource({ "parts/header.liquid": "<header>H</header>" }), {
      head: () => "<i></i>",
    });
    const result = await runtime.renderLoose("parts/header.liquid");
    expect(result.html).toMatch(/^<!doctype html><html><head><i><\/i><\/head><body><header/);
  });
});

test("the page's own stylesheets are marked for the preview", async () => {
  const { markPageStyles } = await import("./runtime.ts");
  const html = `<html><head><title>x</title><link rel="stylesheet" href="a.css"><link rel="icon" href="i.svg"><style>a{}</style><style data-spaka-runtime>b{}</style></head><body><style>c{}</style></body></html>`;
  expect(markPageStyles(html)).toBe(
    `<html><head><title>x</title><link data-spaka-page rel="stylesheet" href="a.css"><link rel="icon" href="i.svg"><style data-spaka-page>a{}</style><style data-spaka-runtime>b{}</style></head><body><style>c{}</style></body></html>`,
  );
});

describe("answering web requests", () => {
  const runtime = new Runtime(project, { trace: false });

  test("pages, fragments, the theme, and not found", async () => {
    const home = await runtime.fetch(new Request("http://site.test/"));
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toMatch(/text\/html/);
    expect(await home.text()).toContain("<h1>Home</h1>");
    const fragment = await runtime.fetch(new Request("http://site.test/fragments/news?n=7"));
    expect(await fragment.text()).toBe("<li>7</li>");
    const theme = await runtime.fetch(new Request("http://site.test/theme.css"));
    expect(theme.headers.get("content-type")).toMatch(/text\/css/);
    const missing = await runtime.fetch(new Request("http://site.test/nope"));
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Not found");
    const post = await runtime.fetch(new Request("http://site.test/", { method: "POST" }));
    expect(post.status).toBe(405);
  });
});

describe("the overlay", () => {
  test("files being written take the place of the disk's, and new ones are listed", async () => {
    const source = new Overlay(project);
    source.set("pages/about.liquid", "<h1>About</h1>");
    source.set("pages/index.liquid", "<h1>New home</h1>");
    expect(source.list("pages")).toContain("pages/about.liquid");
    expect(source.read("pages/index.liquid")).toBe("<h1>New home</h1>");
    source.delete("pages/index.liquid");
    expect(source.read("pages/index.liquid")).toContain("Home");
  });
});

test("a record page says which records of its datasource were left out (Q166)", async () => {
  const rt = new Runtime(
    memorySource({
      "pages/blog/[posts].liquid": page("<h1>{{ record.title }}</h1>"),
      "data/posts/_datasource.yaml": "fields:\n  - name: title\n    kind: text\n  - name: summary\n    kind: text\n",
      "data/posts/opening.md": "---\ntitle: Opening\n---\n",
      "data/posts/noel.md": "---\ntitle: Noël\nsummary: Stollen et bûches : à réserver\n---\n",
    }),
  );
  expect(rt.routes().map((r) => r.route)).toEqual(["/blog/opening"]);
  const notes = (await rt.renderRoute("/blog/opening")).notes.map((n) => `${n.file}: ${n.note}`);
  expect(notes).toEqual([expect.stringMatching(/^data\/posts\/noel\.md: left out: /)]);
});

test("Liquid asking data whether it is an iterator is not a datasource looked for", async () => {
  const rt = new Runtime(
    memorySource({
      "pages/index.liquid": page(
        "{% render 'header', page: page %}{% for post in data.posts %}<h2>{{ post.title }}</h2>{% endfor %}{% render 'footer' %}",
      ),
      "parts/header.liquid": "<header>{{ page.url }}</header>",
      "parts/footer.liquid": "<footer></footer>",
      "data/posts/_datasource.yaml": "fields:\n  - name: title\n    kind: text\n",
      "data/posts/a.md": "---\ntitle: A\n---\n",
    }),
    { repair: false, trace: false },
  );
  expect((await rt.renderRoute("/")).notes).toEqual([]);
});
