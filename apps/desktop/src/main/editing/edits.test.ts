import { expect, test } from "vitest";
import {
  copyName,
  duplicateRange,
  EditRefused,
  editText,
  includeAt,
  insertBefore,
  moveSection,
  pagesUsing,
  placeFor,
  removeRange,
  renameInclude,
  setLink,
  targetAt,
} from "./edits";

const page = [
  "<body>",
  "  {% render 'header' %}",
  '  <section id="a">',
  "    <h1>Fresh bread</h1>",
  "  </section>",
  '  <section id="b"><p>Open daily</p></section>',
  "  {%- render 'footer', year: 2026 -%}",
  "</body>",
].join("\n");
const at = (src: string, needle: string) => src.indexOf(needle);

test("a text is changed in place; a computed one is refused", () => {
  expect(editText(page, at(page, "<h1>"), ["Warm bread"])).toContain("<h1>Warm bread</h1>");
  const computed = "<p>{{ site.name }}</p>";
  expect(() => editText(computed, 0, ["x"])).toThrow(/computed/);
  expect(() => editText(page, at(page, "<section"), ["x"])).toThrow(EditRefused);
});

test("a link's address is changed, escaped, or added", () => {
  const src = '<a class="btn" href="/menu">Menu</a> <a class="x">Y</a>';
  expect(setLink(src, 0, "/carte?a=1&b=2")).toBe(
    '<a class="btn" href="/carte?a=1&amp;b=2">Menu</a> <a class="x">Y</a>',
  );
  expect(setLink(src, at(src, '<a class="x"'), "/y")).toContain('<a href="/y" class="x">Y</a>');
  expect(() => setLink('<a href="{{ url }}">x</a>', 0, "/z")).toThrow(/computed/);
  expect(() => setLink("<p>x</p>", 0, "/z")).toThrow(/not a link/);
});

test("removing a section takes its whole line; duplicating keeps the indentation", () => {
  const a = targetAt(page, at(page, '<section id="a"'));
  const removed = removeRange(page, a.range);
  expect(removed).toBe(page.replace('  <section id="a">\n    <h1>Fresh bread</h1>\n  </section>\n', ""));
  const b = targetAt(page, at(page, '<section id="b"'));
  expect(duplicateRange(page, b.range)).toContain(
    '  <section id="b"><p>Open daily</p></section>\n  <section id="b"><p>Open daily</p></section>\n',
  );
  // Inline, nothing around it is touched.
  const inline = "<p>a <b>b</b> c</p>";
  expect(removeRange(inline, targetAt(inline, 5).range)).toBe("<p>a  c</p>");
});

test("an include is a target, and is renamed with its arguments kept", () => {
  const footer = targetAt(page, at(page, "{%- render 'footer'"));
  expect(footer.include).toBe("footer");
  expect(includeAt(page, at(page, "{% render 'header'"))?.name).toBe("header");
  expect(renameInclude("{%- render 'footer', year: 2026 -%}", "footer-2")).toBe(
    "{%- render 'footer-2', year: 2026 -%}",
  );
  expect(copyName("hero", (n) => n === "hero-2")).toBe("hero-3");
  expect(copyName("hero-2", () => false)).toBe("hero-2");
});

test("an element repeated in a loop cannot be removed by hand", () => {
  const src = "{% for p in ps %}<li>x</li>{% endfor %}";
  expect(() => targetAt(src, at(src, "<li>"))).toThrow(/repeated/);
});

test("sections move up and down, includes among them", () => {
  const names = (src: string) => [...src.matchAll(/render '(\w+)'|id="(\w)"/g)].map((m) => m[1] ?? m[2]);
  expect(names(moveSection(page, 2, 1))).toEqual(["header", "b", "a", "footer"]);
  expect(names(moveSection(page, 0, 4))).toEqual(["a", "b", "footer", "header"]);
  expect(names(moveSection(page, 3, 0))).toEqual(["footer", "header", "a", "b"]);
  expect(moveSection(page, 1, 1)).toBe(page);
  const moved = moveSection(page, 2, 1);
  expect(moved).toContain('\n  <section id="b"><p>Open daily</p></section>\n  <section id="a">');
  expect(() => moveSection(page, 9, 0)).toThrow(EditRefused);
});

test("a block goes in before a section, or after the last one", () => {
  expect(insertBefore(page, 3, "{% render 'pricing' %}")).toContain(
    "</section>\n  {% render 'pricing' %}\n  {%- render 'footer'",
  );
  expect(insertBefore(page, 4, "{% render 'x' %}")).toContain("2026 -%}\n  {% render 'x' %}\n</body>");
  expect(insertBefore("<body>\n</body>", 0, "{% render 'x' %}")).toBe("<body>\n{% render 'x' %}\n</body>");
});

test("a block added without a place goes where its kind usually is", () => {
  expect(placeFor(page, "header")).toBe(0);
  expect(placeFor(page, "pricing")).toBe(3);
  expect(placeFor(page, "footer")).toBe(4);
  expect(placeFor('<body><section id="a"></section></body>', "cta")).toBe(1);
  // With a <main>, sections are its children: the footer outside it is not one.
  expect(placeFor("<body><main></main><footer>f</footer></body>", "cta")).toBe(0);
  // A banner opens the page; a header goes below it.
  expect(placeFor(page, "banner")).toBe(0);
  expect(placeFor(`<body>{% render 'banner-sale' %}${page.replace("<body>", "")}`, "header")).toBe(1);
});

test("the pages using a shared part, through other parts too", () => {
  const files = {
    "pages/index.liquid": "{% render 'header' %}",
    "pages/menu.liquid": "{% render 'layout' %}",
    "pages/about.liquid": "<p>about</p>",
    "parts/layout.liquid": "{% render 'header' %}",
    "parts/header.liquid": "<header></header>",
  };
  expect(pagesUsing("header", files)).toBe(2);
  expect(pagesUsing("layout", files)).toBe(1);
});
