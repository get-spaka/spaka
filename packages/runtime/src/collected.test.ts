import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import { addTrapFields, fingerprint, readSubmission, submissionId, TRAP_FIELD } from "./collected.ts";
import { Datasources, paragraphs } from "./data.ts";
import { Runtime } from "./runtime.ts";
import { memorySource } from "./source.ts";
import { RECORDS_SCHEMA, type SqlDatabase, SqlStore } from "./sql.ts";

function sqlite(): SqlDatabase {
  const db = new DatabaseSync(":memory:");
  db.exec(RECORDS_SCHEMA);
  return {
    all: async (sql, params) => db.prepare(sql).all(...(params as never[])) as Record<string, unknown>[],
    run: async (sql, params) => Number(db.prepare(sql).run(...(params as never[])).changes),
  };
}

const GUESTBOOK = `label: Livre d'or
collected: true
review: true
answer: thanks
body: message
messages:
  required: "{field} est obligatoire"
  invalid: "{field} n'est pas valide"
  too_many: "Trop d'envois"
fields:
  - name: name
    label: Votre nom
    kind: text
    required: true
  - name: email
    label: Votre e-mail
    kind: email
  - name: phone
    kind: phone
  - name: message
    kind: markdown
    required: true
`;

const CONTACT = `collected: true
fields:
  - name: name
    kind: text
    required: true
  - name: photo
    kind: image
`;

function site(extra: Record<string, string> = {}) {
  return memorySource({
    "pages/index.liquid":
      '<html><body><form hx-post="/_data/guestbook"><input name="name"></form>{% for e in data.guestbook %}<article>{{ e.name }}|{{ e.message }}</article>{% endfor %}</body></html>',
    "pages/_draft.liquid": "<p>draft</p>",
    "fragments/thanks.liquid": "<p class=thanks>Merci {{ record.name }}</p>",
    "data/guestbook/_datasource.yaml": GUESTBOOK,
    "data/contact/_datasource.yaml": CONTACT,
    ...extra,
  });
}

function post(path: string, fields: Record<string, string>) {
  return new Request(`http://site${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

const NOW = new Date("2026-11-12T09:31:04Z");

describe("collected datasources (Q171-Q189)", () => {
  test("a definition says collected, review, answer and its messages; an image field is refused", () => {
    const data = new Datasources(site());
    const { definition } = data.definition("guestbook");
    expect(definition).toMatchObject({ collected: true, review: true, answer: "thanks" });
    expect(definition?.messages?.required).toBe("{field} est obligatoire");
    const contact = data.definition("contact");
    expect(contact.definition?.fields.map((f) => f.name)).toEqual(["name"]);
    expect(contact.problem).toMatch(/image field photo/);
  });

  test("what a visitor sent is read against the definition, in the site's words", () => {
    const definition = new Datasources(site()).definition("guestbook").definition!;
    const values = (o: Record<string, string>) => new Map(Object.entries(o).map(([k, v]) => [k, [v]]));
    expect(readSubmission(definition, values({ name: "Claire", message: "Hi", email: "c@x.fr" }))).toEqual({
      fields: { name: "Claire", email: "c@x.fr", message: "Hi" },
    });
    expect(readSubmission(definition, values({ email: "nope", phone: "12", message: "Hi" }))).toEqual({
      problems: ["Votre nom est obligatoire", "Votre e-mail n'est pas valide", "Phone n'est pas valide"],
    });
    expect(
      readSubmission(definition, values({ name: "A", message: "x", phone: "+33 (0)1 23 45 67 89" })),
    ).toMatchObject({
      fields: { phone: "+33 (0)1 23 45 67 89" },
    });
  });

  test("a record's id is when it was sent and four random characters", () => {
    expect(submissionId(NOW, () => 0.64)).toBe("2026-11-12-0931-a3d7");
  });

  test("a visitor's fingerprint never holds the address", async () => {
    const a = await fingerprint("203.0.113.7", "secret");
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(a).not.toContain("203");
    expect(await fingerprint("203.0.113.7", "other")).not.toBe(a);
  });

  test("forms posting to /_data/ get the hidden trap field, others do not", () => {
    const html = addTrapFields('<form hx-post="/_data/x" class="f"><input></form><form action="/search"></form>');
    expect(html).toContain(`<form hx-post="/_data/x" class="f"><div aria-hidden="true"`);
    expect(html.match(new RegExp(`name="${TRAP_FIELD}"`, "g"))).toHaveLength(1);
  });

  test("a visitor's text is never read as HTML or Markdown", () => {
    expect(paragraphs("Hello <b>you</b>\n\n**two**\nlines")).toBe(
      "<p>Hello &#60;b&#62;you&#60;/b&#62;</p><p>**two**<br>lines</p>",
    );
  });
});

describe("the runtime with a store", () => {
  const runtime = (store = new SqlStore(sqlite())) =>
    new Runtime(site(), { repair: false, trace: false, collected: store, managementToken: "tok", now: () => NOW });

  test("a valid submission is kept and answered with the definition's fragment", async () => {
    const store = new SqlStore(sqlite());
    const res = await runtime(store).fetch(post("/_data/guestbook", { name: "Claire <3", message: "Bravo" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<p class=thanks>Merci Claire &#60;3</p>");
    const [record] = await store.list("guestbook", 10);
    expect(record).toMatchObject({ status: "pending", submitted: NOW.toISOString(), fields: { name: "Claire <3" } });
  });

  test("an invalid one is answered 422 with the problems; a robot's is dropped as if kept", async () => {
    const store = new SqlStore(sqlite());
    const bad = await runtime(store).fetch(post("/_data/guestbook", { message: "x" }));
    expect(bad.status).toBe(422);
    expect(await bad.text()).toContain("<li>Votre nom est obligatoire</li>");
    const robot = await runtime(store).fetch(
      post("/_data/guestbook", { name: "Bot", message: "x", [TRAP_FIELD]: "u" }),
    );
    expect(robot.status).toBe(200);
    expect(await store.list("guestbook", 10)).toEqual([]);
  });

  test("a visitor sends at most five records in ten minutes", async () => {
    const r = runtime();
    const send = () => r.fetch(post("/_data/contact", { name: "A" }), { visitor: "203.0.113.7" });
    for (let i = 0; i < 5; i++) expect((await send()).status).toBe(200);
    const sixth = await send();
    expect(sixth.status).toBe(429);
    expect(await sixth.text()).toContain("Too many messages");
    expect((await r.fetch(post("/_data/contact", { name: "B" }), { visitor: "198.51.100.1" })).status).toBe(200);
  });

  test("pages show published records only, escaped; review holds the rest", async () => {
    const store = new SqlStore(sqlite());
    const r = runtime(store);
    await r.fetch(post("/_data/guestbook", { name: "Held", message: "x" }));
    await store.add("guestbook", {
      id: "a",
      submitted: "2026-11-11T08:00:00Z",
      status: "published",
      fields: { name: "<script>", message: "Line\n\nTwo" },
    });
    const html = await (await r.fetch(new Request("http://site/"))).text();
    expect(html).toContain("<article>&#60;script&#62;|<p>Line</p><p>Two</p></article>");
    expect(html).not.toContain("Held");
    expect(html).toContain(`name="${TRAP_FIELD}"`);
  });

  test("the management API needs the token, then lists, approves and deletes", async () => {
    const store = new SqlStore(sqlite());
    const r = runtime(store);
    await r.fetch(post("/_data/guestbook", { name: "Held", message: "x" }));
    const call = (path: string, method = "GET", token = "tok") =>
      r.fetch(new Request(`http://site/_upstart/${path}`, { method, headers: { authorization: `Bearer ${token}` } }));
    expect((await call("ping", "GET", "nope")).status).toBe(401);
    expect(await (await call("ping")).json()).toEqual({ ok: true, datasources: ["contact", "guestbook"] });
    const { records } = (await (await call("records/guestbook")).json()) as { records: { id: string }[] };
    expect(records).toHaveLength(1);
    expect((await call(`records/guestbook/${records[0]!.id}/approve`, "POST")).status).toBe(200);
    expect(await (await r.fetch(new Request("http://site/"))).text()).toContain("<article>Held|");
    expect((await call(`records/guestbook/${records[0]!.id}`, "DELETE")).status).toBe(200);
    expect(await store.list("guestbook", 10)).toEqual([]);
    expect((await call("records/nothing")).status).toBe(404);
  });

  test("without a token there is no management API; GET on /_data/ is refused", async () => {
    const r = new Runtime(site(), { collected: new SqlStore(sqlite()) });
    expect((await r.fetch(new Request("http://site/_upstart/ping"))).status).toBe(404);
    expect((await r.fetch(new Request("http://site/_data/guestbook"))).status).toBe(405);
  });

  test("a page file starting with an underscore gets no address, with a note", async () => {
    const r = runtime();
    expect(r.routes().map((x) => x.route)).toEqual(["/"]);
    expect(r.pageNotes()).toEqual([expect.objectContaining({ file: "pages/_draft.liquid" })]);
  });
});

describe("the preview's test records (Q172)", () => {
  const tests = memorySource({
    "guestbook/2026-11-12-0931-a7f3.md": "---\nname: Claire\nsubmitted: 2026-11-12T09:31:04Z\n---\nGluten-free?\n",
    "guestbook/2026-11-12-1000-b001.md":
      "---\nname: Waiting\nstatus: pending\nsubmitted: 2026-11-12T10:00:00Z\n---\nx\n",
    "guestbook/2026-11-10-0800-c002.md": "---\nname: Older\nsubmitted: 2026-11-10T08:00:00Z\n---\n<i>y</i>\n",
  });

  test("are read from their files, newest first, those waiting for review left out, escaped", async () => {
    const r = new Runtime(site(), { repair: false, trace: false, testRecords: tests });
    const html = r.renderRoute("/").html;
    expect(html).toContain(
      "<article>Claire|<p>Gluten-free?</p></article><article>Older|<p>&#60;i&#62;y&#60;/i&#62;</p>",
    );
    expect(html).not.toContain("Waiting");
  });
});
