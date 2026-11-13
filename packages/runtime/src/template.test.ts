import assert from "node:assert/strict";
import { Liquid } from "liquidjs";
import { test } from "vitest";
import { injectTrace, repairTemplate } from "./template.ts";

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
  assert.equal(
    html,
    '<div class="grid"><div class="card"><h3>a</h3><p>Fresh</p></div><div class="card"><h3>b</h3><p>Fresh</p></div></div>',
  );
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
  assert.equal(repairTemplate(ok).src, `${ok}</p>`);
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
    assert.doesNotThrow(
      () => e.parseAndRenderSync(r.src, data),
      `prefix of ${n} chars: ${JSON.stringify(r.src.slice(-80))}`,
    );
    assert.doesNotThrow(
      () => e.parseAndRenderSync(injectTrace(r.src, "pages/index.liquid"), data),
      `traced prefix of ${n} chars`,
    );
  }
});

test("injects the source of each element, and the record inside a loop", () => {
  const src =
    '<main>\n  <ul>\n  {% for b in books %}\n    <li class="row">{{ b.title }}</li>\n  {% endfor %}\n  </ul>\n</main>';
  const traced = injectTrace(src, "pages/index.liquid");
  const books = [
    { title: "Dune", __ref: "books/1" },
    { title: "Emma", __ref: "books/2" },
  ];
  const html = render(traced, { books });
  // file:line:offset, the offset being where the start tag begins.
  const li = src.indexOf("<li");
  assert.match(html, /<main data-up-src="pages\/index.liquid:1:0">/);
  assert.match(html, /<ul data-up-src="pages\/index.liquid:2:9">/);
  assert.ok(html.includes(`<li data-up-src="pages/index.liquid:4:${li}" data-up-rec="books/1" class="row">Dune</li>`));
  assert.ok(html.includes(`<li data-up-src="pages/index.liquid:4:${li}" data-up-rec="books/2" class="row">Emma</li>`));
});

test("a range loop carries no record attribute", () => {
  const traced = injectTrace("{% for i in (1..2) %}<i>{{ i }}</i>{% endfor %}", "p.liquid");
  assert.equal(render(traced), '<i data-up-src="p.liquid:1:21">1</i><i data-up-src="p.liquid:1:21">2</i>');
});

test("a record is traced through a shared part and into a fragment; each include is marked", () => {
  const page = injectTrace(
    "<ul>{% for b in books %}{% render 'book', book: b %}{% endfor %}</ul>{%- render 'footer' -%}",
    "pages/index.liquid",
  );
  assert.equal(
    page,
    `<ul data-up-src="pages/index.liquid:1:0">{% for b in books %}<!--up-inc pages/index.liquid:24:52-->{% render 'book', book: b , __rec: b.__ref %}<!--/up-inc-->{% endfor %}</ul>` +
      `<!--up-inc pages/index.liquid:69:92-->{%- render 'footer' -%}<!--/up-inc-->`,
  );
  const part = injectTrace("<li><b>{{ book.title }}</b>{% render 'stars', n: book.rating %}</li>", "parts/book.liquid");
  const stars = injectTrace("<i>{{ n }}</i>", "parts/stars.liquid");
  const e = new Liquid({
    templates: { book: part, stars, footer: injectTrace("<footer>f</footer>", "parts/footer.liquid") },
  });
  const html = e.parseAndRenderSync(page, { books: [{ title: "Dune", rating: 5, __ref: "books/1" }] });
  assert.equal(
    html,
    `<ul data-up-src="pages/index.liquid:1:0"><!--up-inc pages/index.liquid:24:52--><li data-up-src="parts/book.liquid:1:0" data-up-rec="books/1"><b data-up-src="parts/book.liquid:1:4" data-up-rec="books/1">Dune</b>` +
      `<!--up-inc parts/book.liquid:27:63--><i data-up-src="parts/stars.liquid:1:0" data-up-rec="books/1">5</i><!--/up-inc--></li><!--/up-inc--></ul>` +
      `<!--up-inc pages/index.liquid:69:92--><footer data-up-src="parts/footer.liquid:1:0" data-up-rec="">f</footer><!--/up-inc-->`,
  );
  const fragment = injectTrace("<li>{{ record.title }}</li>", "fragments/books-created.liquid");
  assert.equal(
    render(fragment, { record: { title: "Emma", __ref: "books/2" } }),
    '<li data-up-src="fragments/books-created.liquid:1:0" data-up-rec="books/2">Emma</li>',
  );
});

test("inside a loop over a record's links, the trace names the record and which link (Q212)", () => {
  const src =
    '{% for item in data.navigation %}<li><a>{{ item.label }}</a>{% for link in item.links %}<a href="{{ link.href }}">{{ link.label }}</a>{% endfor %}</li>{% endfor %}';
  const traced = injectTrace(src, "parts/header.liquid");
  assert.match(traced, /<li data-up-src="[^"]+" data-up-rec="\{\{ item\.__ref \}\}">/);
  assert.match(traced, /<a data-up-src="[^"]+" data-up-rec="\{\{ item\.__ref \}\}#\{\{ forloop\.index0 \}\}" href=/);
  const html = new Liquid().parseAndRenderSync(traced, {
    __rec: "",
    data: {
      navigation: [
        { __ref: "navigation/services", label: "Services", links: [{ label: "Bread" }, { label: "Cakes" }] },
      ],
    },
  });
  assert.match(html, /data-up-rec="navigation\/services#1"[^>]*>Cakes</);
});
