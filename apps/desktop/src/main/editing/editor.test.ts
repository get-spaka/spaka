import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { Editor } from "./editor";
import { EditRefused } from "./edits";

function project() {
  const root = mkdtempSync(join(tmpdir(), "editor-"));
  mkdirSync(join(root, "pages"));
  writeFileSync(join(root, "pages/index.liquid"), "<h1>Home</h1>");
  writeFileSync(join(root, "pages/menu.liquid"), "<h1>Menu</h1>");
  writeFileSync(join(root, "pages/menu-2.liquid"), "<h1>Menu again</h1>");
  const changes: { label: string; files: string[] }[] = [];
  let busy = false;
  const editor = new Editor({
    root: () => root,
    busy: () => busy,
    before: () => {},
    changed: (c) => changes.push(c),
    block: () => undefined,
  });
  return { root, editor, changes, setBusy: (b: boolean) => (busy = b) };
}

test("a page is duplicated at the next free address, told to the agent", () => {
  const { root, editor, changes } = project();
  const result = editor.duplicatePage("pages/menu.liquid");
  expect(result.file).toBe("pages/menu-3.liquid");
  expect(readFileSync(join(root, "pages/menu-3.liquid"), "utf8")).toBe("<h1>Menu</h1>");
  expect(changes).toEqual([{ label: "Page duplicated", files: ["pages/menu-3.liquid"] }]);
});

test("a page is deleted; the home page is kept; nothing while the agent works", () => {
  const { root, editor, changes, setBusy } = project();
  editor.deletePage("pages/menu.liquid", false);
  expect(existsSync(join(root, "pages/menu.liquid"))).toBe(false);
  expect(changes).toEqual([{ label: "Page deleted", files: ["pages/menu.liquid"] }]);
  expect(() => editor.deletePage("pages/index.liquid", true)).toThrow(EditRefused);
  expect(existsSync(join(root, "pages/index.liquid"))).toBe(true);
  expect(() => editor.deletePage("parts/header.liquid", false)).toThrow(EditRefused);
  setBusy(true);
  expect(() => editor.duplicatePage("pages/menu-2.liquid")).toThrow(EditRefused);
});

function withPosts() {
  const p = project();
  mkdirSync(join(p.root, "data/posts"), { recursive: true });
  writeFileSync(
    join(p.root, "data/posts/_datasource.yaml"),
    "label: Posts\nfields:\n  - name: title\n    kind: text\n  - name: date\n    kind: date\n  - name: body\n    kind: markdown\nbody: body\norder: [first, second]\n",
  );
  writeFileSync(join(p.root, "data/posts/first.md"), "---\ntitle: First post\n---\nHello.\n");
  writeFileSync(join(p.root, "data/posts/second.md"), "---\ntitle: Second post\n---\n");
  return p;
}

test("a record's values written at once, one version when the maker leaves it (Q162)", () => {
  const { root, editor, changes, setBusy } = withPosts();
  editor.setRecordValue("data/posts/first.md", "title", "First of all", false);
  editor.setRecordValue("data/posts/first.md", "date", "2026-11-02", false);
  editor.setRecordValue("data/posts/first.md", "body", "New text.", true);
  expect(readFileSync(join(root, "data/posts/first.md"), "utf8")).toBe(
    "---\ntitle: First of all\ndate: 2026-11-02\n---\nNew text.\n",
  );
  expect(changes).toEqual([]);
  // Another record: the first gets its version.
  editor.setRecordValue("data/posts/second.md", "title", "Second", false);
  expect(changes).toEqual([{ label: "Edited First of all", files: ["data/posts/first.md"] }]);
  // Any other edit gives the record being written its version first.
  editor.duplicatePage("pages/menu.liquid");
  expect(changes.map((c) => c.label)).toEqual(["Edited First of all", "Edited Second", "Page duplicated"]);
  expect(editor.leaveRecord()).toBeUndefined();
  setBusy(true);
  expect(() => editor.setRecordValue("data/posts/first.md", "title", "x", false)).toThrow(EditRefused);
  expect(() => editor.setRecordValue("pages/menu.liquid", "title", "x", false)).toThrow(EditRefused);
});

test("a record added with an id from its title, its fields in the definition's order (Q165)", () => {
  const { root, editor, changes } = withPosts();
  const added = editor.addRecord("posts", { date: "2026-11-09", title: "First post", body: "Text." });
  expect(added).toEqual({ file: "data/posts/first-post.md", id: "first-post" });
  expect(readFileSync(join(root, added.file), "utf8")).toBe("---\ntitle: First post\ndate: 2026-11-09\n---\nText.\n");
  editor.setRecordValue(added.file, "title", "First post!", false);
  expect(editor.leaveRecord()).toEqual({ label: "Added First post!", files: ["data/posts/first-post.md"] });
  expect(changes).toHaveLength(1);
  expect(editor.addRecord("posts", {}).id).toBe("untitled");
});

test("records reordered and renamed, the manual order kept", () => {
  const { root, editor, changes } = withPosts();
  editor.reorderRecords("posts", ["second", "first"]);
  expect(readFileSync(join(root, "data/posts/_datasource.yaml"), "utf8")).toContain("order: [second, first]");
  const renamed = editor.renameRecord("data/posts/first.md", "hello");
  expect(renamed.file).toBe("data/posts/hello.md");
  expect(existsSync(join(root, "data/posts/first.md"))).toBe(false);
  expect(readFileSync(join(root, "data/posts/hello.md"), "utf8")).toContain("First post");
  expect(readFileSync(join(root, "data/posts/_datasource.yaml"), "utf8")).toContain("order: [second, hello]");
  expect(changes.map((c) => c.label)).toEqual(["Records reordered", "Record renamed"]);
  expect(() => editor.renameRecord("data/posts/hello.md", "second")).toThrow("Another record already has this id.");
  expect(() => editor.renameRecord("data/posts/hello.md", "_draft")).toThrow(EditRefused);
});

function withBlog() {
  const p = withPosts();
  writeFileSync(
    join(p.root, "data/posts/_datasource.yaml"),
    "label: Posts\nfields:\n  - name: title\n    kind: text\n  - name: date\n    kind: date\n  - name: cover\n    kind: image\n  - name: body\n    kind: markdown\nbody: body\n",
  );
  mkdirSync(join(p.root, "pages/blog"), { recursive: true });
  const list = `<ul>{% for post in data.posts %}<li><h2>{{ post.title }}</h2><p>{{ post.date }}</p><img src="{{ post.cover }}" alt=""></li>{% endfor %}</ul><img src="/media/old.jpg" alt="The old shop">`;
  writeFileSync(join(p.root, "pages/blog/index.liquid"), list);
  writeFileSync(join(p.root, "pages/blog/[posts].liquid"), "<h1>{{ record.title }}</h1>{{ record.body }}");
  mkdirSync(join(p.root, "media"));
  writeFileSync(join(p.root, "media/new.json"), '{ "alt": "The new shop" }\n');
  return { ...p, list, at: (needle: string, from = 0) => list.indexOf(needle, from) };
}

test("a record's text field shown alone is edited in place, in its record (Q148)", () => {
  const { root, editor, changes, at } = withBlog();
  const h2 = at("<h2>");
  expect(editor.info("pages/blog/index.liquid", h2)).toMatchObject({ text: true, computed: false, field: "title" });
  // A date is changed in the Content tab.
  expect(editor.info("pages/blog/index.liquid", at("<p>"))).toMatchObject({ text: false, fromRecord: true });
  editor.apply({
    type: "record-text",
    file: "pages/blog/index.liquid",
    at: h2,
    record: "posts/first",
    text: " First\n of all ",
  });
  expect(readFileSync(join(root, "data/posts/first.md"), "utf8")).toBe("---\ntitle: First of all\n---\nHello.\n");
  expect(changes.at(-1)).toEqual({ label: "Edited First of all", files: ["data/posts/first.md"] });
  // On a record page, the datasource is the page's.
  expect(editor.info("pages/blog/[posts].liquid", 0)).toMatchObject({ field: "title" });
  const refuse = (record: string, at2 = h2) =>
    expect(() =>
      editor.apply({ type: "record-text", file: "pages/blog/index.liquid", at: at2, record, text: "x" }),
    ).toThrow(EditRefused);
  refuse("team/adam");
  refuse("posts/first", at("<p>"));
});

test("a link's label in a menu is edited in place, in its record (Q212)", () => {
  const { root, editor, changes } = project();
  mkdirSync(join(root, "data/navigation"), { recursive: true });
  mkdirSync(join(root, "parts"));
  writeFileSync(
    join(root, "data/navigation/_datasource.yaml"),
    "label: Navigation\nfields:\n  - name: label\n    kind: text\n  - name: href\n    kind: link\n  - name: links\n    kind: links\n",
  );
  const record =
    "---\nlabel: Services\nhref: /services\nlinks:\n  - label: Bread\n    href: /bread\n  - label: Cakes\n    href: /cakes\n---\n";
  writeFileSync(join(root, "data/navigation/services.md"), record);
  const header = `<header>{% for item in data.navigation %}<a href="{{ item.href }}">{{ item.label }}</a>{% for link in item.links %}<a class="sub" href="{{ link.href }}">{{ link.label }}</a>{% endfor %}{% endfor %}</header>`;
  writeFileSync(join(root, "parts/header.liquid"), header);
  const sub = header.indexOf('<a class="sub"');
  expect(editor.info("parts/header.liquid", sub)).toMatchObject({ text: true, field: "links.label" });
  editor.apply({
    type: "record-text",
    file: "parts/header.liquid",
    at: sub,
    record: "navigation/services#1",
    text: " Pastries ",
  });
  expect(readFileSync(join(root, "data/navigation/services.md"), "utf8")).toBe(record.replace("Cakes", "Pastries"));
  expect(changes.at(-1)?.files).toEqual(["data/navigation/services.md"]);
  // The menu's own label is a text field of the record, as before.
  editor.apply({
    type: "record-text",
    file: "parts/header.liquid",
    at: header.indexOf("<a href"),
    record: "navigation/services",
    text: "Our services",
  });
  expect(readFileSync(join(root, "data/navigation/services.md"), "utf8")).toContain("label: Our services\n");
  // Without saying which link, or for one that is not there: refused.
  expect(() =>
    editor.apply({
      type: "record-text",
      file: "parts/header.liquid",
      at: sub,
      record: "navigation/services",
      text: "x",
    }),
  ).toThrow(EditRefused);
  expect(() =>
    editor.apply({
      type: "record-text",
      file: "parts/header.liquid",
      at: sub,
      record: "navigation/services#7",
      text: "x",
    }),
  ).toThrow(EditRefused);
});

test("an image of a record's list of images is replaced, removed and moved in place (Q355, Q356)", () => {
  const { root, editor, changes } = project();
  mkdirSync(join(root, "data/homes"), { recursive: true });
  mkdirSync(join(root, "pages/homes"), { recursive: true });
  writeFileSync(
    join(root, "data/homes/_datasource.yaml"),
    "label: Homes\nfields:\n  - name: address\n    kind: text\n  - name: cover\n    kind: image\n  - name: photos\n    kind: images\n",
  );
  const file = join(root, "data/homes/wren.md");
  const record = "---\naddress: Wren\nphotos:\n  - /media/a.jpg\n  - /media/b.jpg\n  - /media/c.jpg\n---\nThe house.\n";
  writeFileSync(file, record);
  const page = `<main><img class="cover" src="{{ record.cover }}">{% for photo in record.photos %}<img src="{{ photo }}">{% endfor %}</main>`;
  writeFileSync(join(root, "pages/homes/[homes].liquid"), page);
  const at = page.indexOf('<img src="{{ photo');
  const where = { file: "pages/homes/[homes].liquid", at };
  expect(editor.info(where.file, at, "homes/wren#1")).toMatchObject({ image: { field: "photos", list: { count: 3 } } });
  expect(editor.info(where.file, at)).toMatchObject({ image: { field: "photos", list: {} } });
  // The record's own image field is not a list.
  expect(editor.info(where.file, page.indexOf('<img class="cover"')).image).toEqual({ field: "cover" });

  editor.apply({ type: "image", ...where, record: "homes/wren#1", src: "/media/x.jpg" });
  expect(readFileSync(file, "utf8")).toBe(record.replace("b.jpg", "x.jpg"));
  expect(changes.at(-1)).toMatchObject({ label: "Image replaced", files: ["data/homes/wren.md"] });

  editor.apply({ type: "record-item", ...where, record: "homes/wren#2", op: "move", to: 0 });
  expect(readFileSync(file, "utf8")).toContain("photos:\n  - /media/c.jpg\n  - /media/a.jpg\n  - /media/x.jpg\n");
  expect(changes.at(-1)?.label).toBe("Image moved in the list");

  editor.apply({ type: "record-item", ...where, record: "homes/wren#1", op: "remove" });
  expect(readFileSync(file, "utf8")).toBe(
    "---\naddress: Wren\nphotos:\n  - /media/c.jpg\n  - /media/x.jpg\n---\nThe house.\n",
  );
  expect(changes.at(-1)?.label).toBe("Image removed from the list");

  // Without saying which image, for one that is not there, or on the record's own image field: refused.
  expect(() => editor.apply({ type: "image", ...where, record: "homes/wren", src: "/media/y.jpg" })).toThrow(
    EditRefused,
  );
  expect(() => editor.apply({ type: "record-item", ...where, record: "homes/wren#5", op: "remove" })).toThrow(
    EditRefused,
  );
  expect(() =>
    editor.apply({
      type: "record-item",
      file: where.file,
      at: page.indexOf('<img class="cover"'),
      record: "homes/wren",
      op: "remove",
    }),
  ).toThrow(EditRefused);
});

test("an image replaced: its address in the template with the new alt text, or the record's field (Q159)", () => {
  const { root, editor, changes, list, at } = withBlog();
  const fixed = at('<img src="/media');
  expect(editor.info("pages/blog/index.liquid", fixed).image).toEqual({ frame: {} });
  expect(editor.info("pages/blog/index.liquid", at("<img")).image).toEqual({ field: "cover" });
  expect(editor.info("pages/blog/index.liquid", at("<h2>")).image).toBeUndefined();
  editor.apply({ type: "image", file: "pages/blog/index.liquid", at: fixed, src: "/media/new.jpg" });
  expect(readFileSync(join(root, "pages/blog/index.liquid"), "utf8")).toBe(
    list.replace('<img src="/media/old.jpg" alt="The old shop">', '<img src="/media/new.jpg" alt="The new shop">'),
  );
  expect(changes.at(-1)).toEqual({ label: "Image replaced", files: ["pages/blog/index.liquid"] });
  editor.apply({
    type: "image",
    file: "pages/blog/index.liquid",
    at: at("<img"),
    src: "/media/new.jpg",
    record: "posts/second",
  });
  expect(readFileSync(join(root, "data/posts/second.md"), "utf8")).toBe(
    "---\ntitle: Second post\ncover: /media/new.jpg\n---\n",
  );
  expect(() =>
    editor.apply({ type: "image", file: "pages/blog/index.liquid", at: at("<img"), src: "/media/new.jpg" }),
  ).toThrow("This image's address is computed: ask the agent to change it.");
});

test("an image written in the template is set in its frame, one version (Q547)", () => {
  const { root, editor, changes, list, at } = withBlog();
  const file = "pages/blog/index.liquid";
  const fixed = at('<img src="/media');
  const read = () => readFileSync(join(root, file), "utf8");
  editor.apply({ type: "image", file, at: fixed, src: "/media/new.jpg" });
  editor.apply({
    type: "image-frame",
    file,
    at: fixed,
    frame: { x: 0, y: 50, zoom: 2, fit: "cover", ratio: [1, 1], radius: "8px" },
    formats: ["phone", "tablet", "desktop"],
  });
  expect(read()).toBe(
    list.replace(
      '<img src="/media/old.jpg" alt="The old shop">',
      '<img class="object-cover! object-[0%_50%]! aspect-[1/1]! [transform:scale(2)]! [transform-origin:0%_50%]! [clip-path:inset(25%_50%_25%_0%_round_4px)]!" src="/media/new.jpg" alt="The new shop">',
    ),
  );
  expect(changes.at(-1)).toEqual({ label: "Image adjusted", files: [file] });
  expect(editor.info(file, fixed).image?.frame?.phone).toEqual({ x: 0, y: 50, zoom: 2, fit: "cover", ratio: [1, 1] });
  // Put back as the template had it.
  editor.apply({ type: "image-frame", file, at: fixed, frame: null, formats: ["phone", "tablet", "desktop"] });
  expect(read()).toBe(
    list.replace('<img src="/media/old.jpg" alt="The old shop">', '<img src="/media/new.jpg" alt="The new shop">'),
  );
  // Taken out where there is none: nothing is written, and no version is added.
  const versions = changes.length;
  expect(editor.apply({ type: "image-frame", file, at: fixed, frame: null, formats: ["phone"] }).files).toEqual([]);
  expect(changes.length).toBe(versions);
  // A record's image is shown for each record: its frame is the template's.
  expect(editor.info(file, at("<img")).image).toEqual({ field: "cover" });
  expect(() =>
    editor.apply({ type: "image-frame", file, at: at("<img"), frame: { x: 0, y: 0, zoom: 1 }, formats: ["phone"] }),
  ).toThrow(EditRefused);
});

test("an image file dropped onto an image is added and used, one version; another file is refused", async () => {
  const { root, editor, changes, at } = withBlog();
  const from = join(root, "..", `${Date.now()}-shop.svg`);
  writeFileSync(from, '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
  const fixed = at('<img src="/media');
  await editor.edit({ type: "image", file: "pages/blog/index.liquid", at: fixed, src: "", from });
  const added = changes.at(-1)!;
  expect(added.label).toBe("Image replaced");
  const path = added.files.find((f) => f.endsWith(".svg"))!;
  expect(existsSync(join(root, path))).toBe(true);
  expect(readFileSync(join(root, "pages/blog/index.liquid"), "utf8")).toContain(`<img src="/${path}"`);
  await expect(
    editor.edit({ type: "image", file: "pages/blog/index.liquid", at: fixed, src: "", from: "/tmp/menu.pdf" }),
  ).rejects.toThrow("menu.pdf is not an image.");
});

test("a data block dropped: its part, its datasource and samples, its record page, one version (Q194-Q200)", () => {
  const root = mkdtempSync(join(tmpdir(), "editor-"));
  mkdirSync(join(root, "pages"));
  mkdirSync(join(root, "parts"));
  const home = `<!doctype html><html><head><title>Chez Margot</title></head><body>\n{% render 'header' %}\n<section id="hero"></section>\n{% render 'footer' %}\n</body></html>`;
  writeFileSync(join(root, "pages/index.liquid"), home);
  const changes: { label: string; files: string[] }[] = [];
  const blog = {
    id: "blog-cards",
    kind: "blog",
    source:
      '<section>{% for post in data.blog %}<a href="/blog/{{ post.id }}">{{ post.title }}</a>{% endfor %}</section>',
    data: { name: "blog", family: "collection" as const },
    datasource: {
      definition: "label: Posts\nfields:\n  - name: title\n    kind: text\n",
      records: { "first.md": "---\ntitle: First\n---\n" },
    },
    detail: "<section><h1>{{ record.title }}</h1></section>",
  };
  const faq = {
    id: "faq-list",
    kind: "faq",
    source: "<section>{% for q in data.faq %}<p>{{ q.question }}</p>{% endfor %}</section>",
    data: { name: "faq", family: "section" as const },
    datasource: {
      definition: "label: Questions\nfields:\n  - name: question\n    kind: text\n",
      records: { "a.md": "---\nquestion: A?\n---\n" },
    },
  };
  const editor = new Editor({
    root: () => root,
    busy: () => false,
    before: () => {},
    changed: (c) => changes.push(c),
    block: (id) => ({ "blog-cards": blog, "faq-list": faq })[id],
  });
  editor.apply({ type: "insert", file: "pages/index.liquid", block: "blog-cards", before: "auto" });
  expect(changes.at(-1)).toEqual({
    label: "Block added, with its records in blog and their page",
    files: [
      "data/blog/_datasource.yaml",
      "data/blog/first.md",
      "pages/blog/[blog].liquid",
      "parts/blog-cards.liquid",
      "pages/index.liquid",
    ],
  });
  expect(readFileSync(join(root, "pages/blog/[blog].liquid"), "utf8")).toContain(
    "{% render 'header' %}\n<section><h1>{{ record.title }}</h1></section>\n{% render 'footer' %}",
  );
  // A second one shows the same collection; a section list is named after its page.
  editor.apply({ type: "insert", file: "pages/index.liquid", block: "blog-cards", before: "auto" });
  expect(changes.at(-1)).toEqual({
    label: "Block added, showing blog",
    files: ["parts/blog-cards-2.liquid", "pages/index.liquid"],
  });
  editor.apply({ type: "insert", file: "pages/index.liquid", block: "faq-list", before: "auto" });
  expect(readFileSync(join(root, "parts/faq-list.liquid"), "utf8")).toContain('data["home-faq"]');
  expect(existsSync(join(root, "data/home-faq/a.md"))).toBe(true);
});
