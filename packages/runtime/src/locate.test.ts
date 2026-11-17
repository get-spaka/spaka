import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { decodeText, encodeText, locate, recordFieldAt, replaceTexts, sections, textRuns } from "./locate.ts";

const at = (src: string, needle: string) => {
  const i = src.indexOf(needle);
  assert.ok(i >= 0, `${needle} not in source`);
  return i;
};

test("locates an element, its content, and whether its text can be edited", () => {
  const src = '<section>\n  <h1 class="t">Hello <b>you</b></h1>\n  <p>{{ site.name }}</p>\n</section>';
  const h1 = locate(src, at(src, "<h1"))!;
  assert.equal(src.slice(h1.outer.start, h1.outer.end), '<h1 class="t">Hello <b>you</b></h1>');
  assert.equal(src.slice(h1.inner!.start, h1.inner!.end), "Hello <b>you</b>");
  assert.equal(h1.notEditable, undefined);
  assert.equal(locate(src, at(src, "<p>"))!.notEditable, "liquid");
  const section = locate(src, 0)!;
  assert.equal(section.outer.end, src.length);
  assert.equal(section.notEditable, "markup");
  assert.equal(section.whole, true);
  assert.equal(locate(src, 3), undefined);
});

test("nested elements of the same name are matched", () => {
  const src = "<div><div>a</div><div>b</div></div><div>c</div>";
  assert.equal(locate(src, 0)!.outer.end, "<div><div>a</div><div>b</div></div>".length);
});

test("an element in a loop, or with unbalanced Liquid, is not whole to move", () => {
  const src = "{% for p in ps %}<li>x</li>{% endfor %}<div>{% if a %}</div><div>{% endif %}</div>";
  assert.equal(locate(src, at(src, "<li>"))!.inLoop, true);
  assert.equal(locate(src, at(src, "<div>"))!.whole, false);
});

test("texts are replaced between the tags, keeping attributes and untouched entities", () => {
  const src = '<h1 class="x">Bread &amp; <a href="/menu" class="link">butter</a> daily</h1>';
  assert.deepEqual(textRuns(src, 0)!.tags, ["a", "/a"]);
  const out = replaceTexts(src, 0, ["Bread & ", "jam", " daily"])!;
  assert.equal(out, '<h1 class="x">Bread &amp; <a href="/menu" class="link">jam</a> daily</h1>');
  assert.equal(replaceTexts(src, 0, ["only one"]), undefined);
});

test("a typed text is escaped for HTML and Liquid, and keeps the indentation around it", () => {
  assert.equal(encodeText("a < b & {{ c }}"), "a &lt; b &amp; &#123;{ c }}");
  assert.equal(encodeText("New title", "\n    Old title\n  "), "\n    New title\n  ");
  assert.equal(encodeText("Hello ", "Hello "), "Hello ");
  assert.equal(encodeText("a  b"), "a&nbsp;&nbsp;b");
  assert.equal(decodeText("&lt;&#39;&#x41;&nbsp;"), "<'A ");
  const src = "<p>\n  Some text\n</p>";
  assert.equal(replaceTexts(src, 0, ["\n  Other text\n"]), "<p>\n  Other text\n</p>");
});

test("the sections of a page: children of main, else body, includes among them", () => {
  const page =
    "<!DOCTYPE html>\n<html>\n<head><title>x</title></head>\n<body>\n  {% render 'header' %}\n  <section>a</section>\n" +
    "  {% if x %}<section>b</section>{% endif %}\n  <section><div>c</div></section>\n  {%- render 'footer' -%}\n</body>\n</html>";
  const found = sections(page);
  assert.deepEqual(
    found.map((s) => [s.kind, s.name]),
    [
      ["include", "header"],
      ["element", "section"],
      ["element", "section"],
      ["include", "footer"],
    ],
  );
  assert.equal(page.slice(found[2]!.outer.start, found[2]!.outer.end), "<section><div>c</div></section>");
  const withMain = "<body><header>h</header><main><section>1</section><section>2</section></main></body>";
  assert.deepEqual(
    sections(withMain).map((s) => withMain.slice(s.outer.start, s.outer.end)),
    ["<section>1</section>", "<section>2</section>"],
  );
  assert.equal(sections("<section>a</section><footer>b</footer>").length, 2);
});

test("on a page the agent wrote: every heading and paragraph without Liquid can be edited", () => {
  // A home page Claude wrote in the live-generation spike's run A-business-5.
  const src = readFileSync(join(import.meta.dirname, "fixtures/agent-written-page.liquid"), "utf8");
  const found = sections(src);
  assert.ok(found.length >= 5, `${found.length} sections`);
  assert.equal(found[0]!.kind, "include");
  for (const m of src.matchAll(/<(h[1-3]|p)\b/g)) {
    const el = locate(src, m.index)!;
    assert.ok(el.inner, `${m[0]} at ${m.index} has an end`);
    const runs = textRuns(src, m.index);
    if (!el.notEditable) {
      assert.ok(runs);
      // Writing the same texts back changes nothing.
      const same = runs.texts.map((r) => decodeText(src.slice(r.start, r.end)));
      assert.equal(replaceTexts(src, m.index, same), src);
    }
  }
});

describe("a record's field behind an element (Q148, Q159)", () => {
  const page = `<ul>{% for post in data.posts limit: 3 %}<li><h2 class="t">{{ post.title }}</h2><p>{{ post.date | date: "%Y" }}</p><img src="{{ post.cover }}" alt=""><span>By {{ post.author }}</span></li>{% endfor %}</ul><h1>{{ record.title }}</h1><img src="/media/x.jpg">`;
  const at = (needle: string) => page.indexOf(needle);
  test("a lone output of a loop's item, in the text or an attribute", () => {
    expect(recordFieldAt(page, at("<h2"))).toEqual({ field: "title", variable: "post", datasource: "posts" });
    expect(recordFieldAt(page, at('<img src="{{'), "src")).toEqual({
      field: "cover",
      variable: "post",
      datasource: "posts",
    });
  });
  test("not with a filter, nor beside other text, nor a fixed address", () => {
    expect(recordFieldAt(page, at("<p>"))).toBeUndefined();
    expect(recordFieldAt(page, at("<span>"))).toBeUndefined();
    expect(recordFieldAt(page, at('<img src="/media'), "src")).toBeUndefined();
  });
  test("only the record the trace names: the innermost loop's, or the page's", () => {
    const nested = `{% for post in data.posts %}{% for tag in post.tags %}<i>{{ post.title }}</i>{% endfor %}{% endfor %}<b>{{ site.name }}</b>`;
    expect(recordFieldAt(nested, nested.indexOf("<i>"))).toBeUndefined();
    expect(recordFieldAt(nested, nested.indexOf("<b>"))).toBeUndefined();
  });
  test("the record of a record page, its datasource left to the trace", () => {
    expect(recordFieldAt(page, at("<h1>"))).toEqual({ field: "title", variable: "record" });
  });
});

describe("a link of a record's list of links (Q212)", () => {
  const src = `{% for item in data["home-nav"] %}<a href="{{ item.href }}">{{ item.label }}</a><ul>{% for link in item.links %}<li><a href="{{ link.href }}">{{ link.label }}</a></li>{% endfor %}</ul>{% endfor %}<p>{% for link in record.links %}<b>{{ link.label }}</b>{% endfor %}</p>`;
  test("names the list, the link's value and the datasource, a hyphen in its name too", () => {
    expect(recordFieldAt(src, at(src, '<a href="{{ item'))).toEqual({
      field: "label",
      variable: "item",
      datasource: "home-nav",
    });
    expect(recordFieldAt(src, at(src, '<a href="{{ link'))).toEqual({
      field: "links",
      variable: "item",
      datasource: "home-nav",
      sub: "label",
    });
    expect(recordFieldAt(src, at(src, "<b>"))).toEqual({ field: "links", variable: "record", sub: "label" });
  });
});

describe("an image of a record's list of images (Q355)", () => {
  const src = `{% for home in data.homes %}<div>{% for photo in home.photos %}<img src="{{ photo }}">{% endfor %}</div>{% endfor %}<p>{% for photo in record.photos offset: 1 %}<img class="x" src="{{ photo }}">{% endfor %}</p><img class="y" src="{{ cover }}">`;
  test("names the list, and that the element shows the item itself", () => {
    expect(recordFieldAt(src, at(src, '<img src="{{ photo'), "src")).toEqual({
      field: "photos",
      variable: "home",
      datasource: "homes",
      item: true,
    });
    expect(recordFieldAt(src, at(src, '<img class="x"'), "src")).toEqual({
      field: "photos",
      variable: "record",
      item: true,
    });
  });
  test("a lone variable outside such a loop is not a record's field", () => {
    expect(recordFieldAt(src, at(src, '<img class="y"'), "src")).toBeUndefined();
  });
});
