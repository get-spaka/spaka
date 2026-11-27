import { expect, test } from "vitest";
import {
  copyName,
  duplicateRange,
  EditRefused,
  editText,
  imageFrames,
  includeAt,
  insertBefore,
  moveSection,
  pagesUsing,
  placeFor,
  removeRange,
  renameInclude,
  setImageFrame,
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

test("an image's frame is written among its classes for the screens asked, the others keeping theirs (Q490)", () => {
  const src = '<img class="hero object-contain md:object-top" src="/media/a.jpg">';
  const all = ["phone", "tablet", "desktop"] as const;
  const framed = setImageFrame(src, 0, { x: 50, y: 0, zoom: 1, fit: "cover" }, [...all]);
  expect(framed).toBe(
    '<img class="hero object-contain md:object-top object-cover! object-[50%_0%]!" src="/media/a.jpg">',
  );
  expect(imageFrames(framed, 0)).toEqual({
    phone: { x: 50, y: 0, zoom: 1, fit: "cover" },
    tablet: { x: 50, y: 0, zoom: 1, fit: "cover" },
    desktop: { x: 50, y: 0, zoom: 1, fit: "cover" },
  });
  // Set apart on a phone: the tablet and the desktop keep what they had.
  const phone = setImageFrame(framed, 0, { x: 0, y: 0, zoom: 1, ratio: [1, 1], fit: "cover" }, ["phone"]);
  expect(phone).toBe(
    '<img class="hero object-contain md:object-top max-md:object-cover! max-md:object-[0%_0%]! max-md:aspect-[1/1]! md:object-cover! md:object-[50%_0%]!" src="/media/a.jpg">',
  );
  // Taken out for the larger screens, then for the phone: the template's classes are as they were.
  const less = setImageFrame(phone, 0, null, ["tablet", "desktop"]);
  expect(less).toContain('md:object-top max-md:object-cover! max-md:object-[0%_0%]! max-md:aspect-[1/1]!"');
  expect(setImageFrame(less, 0, null, ["phone"])).toBe(src);
  // An image without classes gets some, and loses the attribute with them.
  const bare = '<p><img src="/media/a.jpg"></p>';
  const one = setImageFrame(bare, 3, { x: 0, y: 0, zoom: 1 }, ["desktop"]);
  expect(one).toBe('<p><img class="lg:object-[0%_0%]!" src="/media/a.jpg"></p>');
  expect(setImageFrame(one, 3, null, ["desktop"])).toBe(bare);
  expect(imageFrames(bare, 3)).toEqual({});
});

test("a frame that says nothing of the fit leaves it to the template: an image shown whole stays so", () => {
  const logo = '<img class="object-contain h-12" src="/media/logo.svg">';
  expect(setImageFrame(logo, 0, { x: 0, y: 50, zoom: 1.5 }, ["phone", "tablet", "desktop"])).toBe(
    '<img class="object-contain h-12 object-[0%_50%]! [transform:scale(1.5)]! [transform-origin:0%_50%]! [clip-path:inset(16.67%_33.33%_16.67%_0%)]!" src="/media/logo.svg">',
  );
});

test("an image's frame is refused where it would not be this image's alone", () => {
  const frame = { x: 0, y: 0, zoom: 1 };
  const looped = '{% for p in data.posts %}<img src="/media/a.jpg">{% endfor %}';
  expect(() => setImageFrame(looped, looped.indexOf("<img"), frame, ["phone"])).toThrow(EditRefused);
  expect(imageFrames(looped, looped.indexOf("<img"))).toBeUndefined();
  const computed = '<img class="hero {{ shape }}" src="/media/a.jpg">';
  expect(() => setImageFrame(computed, 0, frame, ["phone"])).toThrow(EditRefused);
  expect(imageFrames(computed, 0)).toBeUndefined();
  expect(() => setImageFrame("<p>x</p>", 0, frame, ["phone"])).toThrow("This is not an image.");
});
