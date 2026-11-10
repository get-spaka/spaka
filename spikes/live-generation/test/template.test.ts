// node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { Liquid } from "liquidjs";
import { injectTrace, repairTemplate } from "../src/runtime/template.ts";

const engine = new Liquid();
const render = (src: string, data: object = {}) => engine.parseAndRenderSync(src, data);

test("cuts an unfinished Liquid output and closes open HTML", () => {
  const r = repairTemplate("<main><h1>Hello {{ site.na");
  assert.equal(r.src, "<main><h1>Hello </h1></main>");
  assert.equal(r.cutReason, "unfinished {{ output");
});

test("cuts an unfinished Liquid tag", () => {
  const r = repairTemplate("<ul>{% for p in products %}<li>{{ p.name }}</li>{% endfo");
  assert.equal(r.src, "<ul>{% for p in products %}<li>{{ p.name }}</li>{% endfor %}</ul>");
  assert.equal(render(r.src, { products: [{ name: "a" }, { name: "b" }] }), "<ul><li>a</li><li>b</li></ul>");
});

test("closes HTML opened inside an open loop before closing the loop", () => {
  const r = repairTemplate('<div class="grid">{% for p in products %}<div class="card"><h3>{{ p.name }}</h3><p>Fresh');
  assert.deepEqual(r.closers, ["</p>", "</div>", "{% endfor %}", "</div>"]);
  const html = render(r.src, { products: [{ name: "a" }, { name: "b" }] });
  assert.equal(html, '<div class="grid"><div class="card"><h3>a</h3><p>Fresh</p></div><div class="card"><h3>b</h3><p>Fresh</p></div></div>');
});

test("cuts an unfinished start tag, even with Liquid and > inside it", () => {
  const r = repairTemplate('<section><a href="{{ url }}" class="{% if a > b %}x{% endif %} btn');
  assert.equal(r.src, "<section></section>");
  const done = repairTemplate('<a href="{{ url }}" class="{% if a > b %}x{% endif %} btn">Go</a>');
  assert.equal(done.cutAt, done.src.length);
  assert.deepEqual(done.closers, []);
});

test("holds back a lone brace, a lone <, a half entity, a half end tag", () => {
  assert.equal(repairTemplate("<p>Price {").src, "<p>Price </p>");
  assert.equal(repairTemplate("<p>Price <").src, "<p>Price </p>");
  assert.equal(repairTemplate("<p>Fish &am").src, "<p>Fish </p>");
  assert.equal(repairTemplate("<p>Fish</").src, "<p>Fish</p>");
  assert.equal(repairTemplate("<p>a < b and {x}</p>").src, "<p>a < b and {x}</p>");
});

test("drops an unfinished script or style block, keeps a finished one", () => {
  assert.equal(repairTemplate("<div>a</div><script>let x = '<div>").src, "<div>a</div>");
  assert.equal(repairTemplate("<style>.a{color:red").src, "");
  const ok = "<script>if (a < b) { x() }</script><p>ok";
  assert.equal(repairTemplate(ok).src, ok + "</p>");
});

test("closes nested if / for / case in order", () => {
  const r = repairTemplate("{% if user %}<b>{% for x in xs %}{% case x %}{% when 1 %}one");
  assert.deepEqual(r.closers, ["{% endcase %}", "{% endfor %}", "</b>", "{% endif %}"]);
  assert.equal(render(r.src, { user: true, xs: [1, 2] }), "<b>one</b>");
});

test("every prefix of a real template parses and renders", () => {
  const full = `<!doctype html>
<html lang="en">
<head><title>{{ site.title | default: "Shop" }}</title><meta name="description" content="A & B"></head>
<body class="bg-base-100">
  {% render 'header' %}
  <main>
    {%- if products.size > 0 -%}
    <ul class="grid">
      {% for p in products %}
      <li class="card {% if p.new %}ring{% endif %}" id="p-{{ p.id }}"><a href="/p/{{ p.id }}">{{ p.name | upcase }}</a> &mdash; {{ p.price | times: 1.2 }} &euro;</li>
      {% else %}
      <li>Nothing yet</li>
      {% endfor %}
    </ul>
    {%- endif -%}
    {% comment %} a note with <b> and {{ braces }} {% endcomment %}
    {% raw %}{{ not liquid }}{% endraw %}
    <script>document.body.dataset.x = "<b>" + (1 < 2);</script>
  </main>
</body>
</html>`;
  const e = new Liquid({ templates: { header: "<header>H</header>" } });
  const data = { products: [{ id: 1, name: "a", price: 2, new: true }] };
  for (let n = 0; n <= full.length; n++) {
    const r = repairTemplate(full.slice(0, n));
    assert.doesNotThrow(() => e.parseAndRenderSync(r.src, data), `prefix of ${n} chars: ${JSON.stringify(r.src.slice(-80))}`);
    assert.doesNotThrow(() => e.parseAndRenderSync(injectTrace(r.src, "pages/index.liquid"), data), `traced prefix of ${n} chars`);
  }
});

test("injects the source of each element, and the record inside a loop", () => {
  const src = '<main>\n  <ul>\n  {% for b in books %}\n    <li class="row">{{ b.title }}</li>\n  {% endfor %}\n  </ul>\n</main>';
  const traced = injectTrace(src, "pages/index.liquid");
  const books = [{ title: "Dune", __ref: "books/1" }, { title: "Emma", __ref: "books/2" }];
  const html = render(traced, { books });
  assert.match(html, /<main data-up-src="pages\/index.liquid:1">/);
  assert.match(html, /<ul data-up-src="pages\/index.liquid:2">/);
  assert.match(html, /<li data-up-src="pages\/index.liquid:4" data-up-rec="books\/1" class="row">Dune<\/li>/);
  assert.match(html, /<li data-up-src="pages\/index.liquid:4" data-up-rec="books\/2" class="row">Emma<\/li>/);
});

test("a range loop carries no record attribute", () => {
  const traced = injectTrace("{% for i in (1..2) %}<i>{{ i }}</i>{% endfor %}", "p.liquid");
  assert.equal(render(traced), '<i data-up-src="p.liquid:1">1</i><i data-up-src="p.liquid:1">2</i>');
});

import { parsePartialInput } from "../src/agent/partial-input.ts";
import { parseDatasource } from "../src/runtime/runtime.ts";
import { repairCss } from "../src/preview/server.ts";

test("reads a tool input while it streams", () => {
  const full = JSON.stringify({ file_path: "/p/pages/index.liquid", content: 'a "q" \\ b\n<p>é 😀  </p>\t{{ x }}' });
  let last = "";
  for (let n = 0; n <= full.length; n++) {
    const { fields, done } = parsePartialInput(full.slice(0, n));
    const content = fields.content ?? "";
    assert.ok(content.startsWith(last) || last.startsWith(content), `monotonic at ${n}`);
    assert.ok('a "q" \\ b\n<p>é 😀  </p>\t{{ x }}'.startsWith(content), `prefix at ${n}: ${JSON.stringify(content)}`);
    last = content;
    if (n === full.length) {
      assert.equal(fields.file_path, "/p/pages/index.liquid");
      assert.equal(content, 'a "q" \\ b\n<p>é 😀  </p>\t{{ x }}');
      assert.equal(done.content, true);
    }
  }
  const escaped = '{"file_path":"/p/a","content":"x\\ud83d\\ude00y\\n';
  assert.equal(parsePartialInput(escaped).fields.content, "x😀y\n");
  assert.equal(parsePartialInput(escaped.slice(0, -9)).fields.content, "x");
  const edit = parsePartialInput('{"file_path":"/p/a","old_string":"foo","new_string":"ba","replace_all":false');
  assert.deepEqual(edit.fields, { file_path: "/p/a", old_string: "foo", new_string: "ba" });
  assert.equal(edit.done.new_string, true);
  assert.equal(parsePartialInput('{"file_path":"/p/a","old_string":"foo","new_string":"ba').done.new_string, false);
});

test("keeps the complete records of a data file that is still being written", () => {
  const full = JSON.stringify({ kind: "authored", fields: { title: "text", note: "text" }, records: [{ title: "A {x}", note: "a]b" }, { title: "B", note: "\"q\"" }] }, null, 2);
  let seen = 0;
  for (let n = 0; n <= full.length; n++) {
    try {
      const d = parseDatasource(full.slice(0, n));
      const count = (d.records ?? []).length;
      assert.ok(count >= seen);
      seen = count;
    } catch {}
  }
  assert.equal(seen, 2);
  const fieldsDone = full.indexOf("},") + 1;
  assert.deepEqual(parseDatasource(full.slice(0, fieldsDone + 3)).fields, { title: "text", note: "text" });
  const firstRecordDone = full.indexOf("},", fieldsDone) + 1;
  assert.equal(parseDatasource(full.slice(0, firstRecordDone + 5)).records.length, 1);
});

test("repairs a stylesheet that is still being written", () => {
  assert.equal(repairCss(":root {\n  --a: #fff;\n  --b: #1a"), ":root {\n  --a: #fff;}");
  assert.equal(repairCss('@import url("https://fonts.example/css?family=Fra'), "");
  assert.equal(repairCss(":root { --a: 1; }\n/* half a comm"), ":root { --a: 1; }");
});

import { checkHtmxSource } from "../src/measure/htmx-check.ts";

test("htmx check: accepts htmx 4, flags htmx 2", () => {
  const good = `<form hx-post="/data/books" hx-target="#list" hx-swap="beforeend scroll:bottom" hx-disable="find button"
      hx-on::after:request="if (ctx.response.status < 400) this.reset()" hx-status:422="target:#errors">
    <input name="q" hx-get="/fragments/search" hx-trigger="input changed delay:300ms, keyup[key=='Enter']" hx-target="next .results">
    <div hx-target:inherited="#out" hx-boost:inherited="true"><a href="/x">x</a></div>
    <button {% if busy %}disabled{% endif %} hx-delete="/data/books/{{ b.id }}" hx-include="closest form" hx-confirm="Sure?">x</button>
  </form>`;
  const g = checkHtmxSource(good, "a.liquid");
  assert.deepEqual(g.invalid, []);
  assert.equal(g.attributes, 14);

  const bad = `<div hx-target="#out" hx-ext="morph">
    <form hx-post="/x" hx-disabled-elt="find button" hx-on::after-request="if(event.detail.successful) this.reset()" hx-swap="morph:innerHTML">
      <input hx-get="/s" hx-trigger="keyup changed delay:300ms queue:last" hx-vars="a:1">
      <button hx-disable>go</button>
      <p hx-on:htmx:after:swap="1" hx-on:htmx:afterSwap="1" hx-swap="innerHTML focus-scroll:true" hx-get="/a"></p>
    </form></div>`;
  const b = checkHtmxSource(bad, "b.liquid");
  const problems = b.invalid.map((f) => f.attribute);
  assert.deepEqual(problems.sort(), ["hx-disable", "hx-disabled-elt", "hx-ext", "hx-on::after-request", "hx-on:htmx:afterswap", "hx-swap", "hx-swap", "hx-target", "hx-trigger", "hx-vars"].sort());
  assert.equal(b.attributes, 14);
});

test("a record is traced through a shared part and into a fragment", () => {
  const page = injectTrace("<ul>{% for b in books %}{% render 'book', book: b %}{% endfor %}</ul>{%- render 'footer' -%}", "pages/index.liquid");
  assert.equal(page, `<ul data-up-src="pages/index.liquid:1">{% for b in books %}{% render 'book', book: b , __rec: b.__ref %}{% endfor %}</ul>{%- render 'footer' -%}`);
  const part = injectTrace("<li><b>{{ book.title }}</b>{% render 'stars', n: book.rating %}</li>", "parts/book.liquid");
  const stars = injectTrace("<i>{{ n }}</i>", "parts/stars.liquid");
  const e = new Liquid({ templates: { book: part, stars, footer: injectTrace("<footer>f</footer>", "parts/footer.liquid") } });
  const html = e.parseAndRenderSync(page, { books: [{ title: "Dune", rating: 5, __ref: "books/1" }] });
  assert.equal(
    html,
    `<ul data-up-src="pages/index.liquid:1"><li data-up-src="parts/book.liquid:1" data-up-rec="books/1"><b data-up-src="parts/book.liquid:1" data-up-rec="books/1">Dune</b>` +
      `<i data-up-src="parts/stars.liquid:1" data-up-rec="books/1">5</i></li></ul><footer data-up-src="parts/footer.liquid:1" data-up-rec="">f</footer>`,
  );
  const fragment = injectTrace("<li>{{ record.title }}</li>", "fragments/books-created.liquid");
  assert.equal(render(fragment, { record: { title: "Emma", __ref: "books/2" } }), '<li data-up-src="fragments/books-created.liquid:1" data-up-rec="books/2">Emma</li>');
});
