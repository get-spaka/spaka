import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { RECORDS_SCHEMA } from "../sql.ts";
import { siteServer, visitorAddress } from "./node.ts";
import type { PublishedSite } from "./site.ts";
import { siteWorker } from "./worker.ts";

const SITE: PublishedSite = {
  files: {
    "theme.css": ":root{}",
    "pages/index.liquid":
      '<html><head><title>Home</title></head><body><img src="/media/cafe.jpg">{% for e in data.guestbook %}<p class="entry">{{ e.name }}</p>{% endfor %}<form hx-post="/_data/guestbook"><input name="name"></form></body></html>',
    "data/guestbook/_datasource.yaml":
      "label: Guestbook\ncollected: true\nanswer: thanks\nfields:\n  - name: name\n    kind: text\n    required: true\n",
    "fragments/thanks.liquid": "<p>Thanks {{ record.name }}</p>",
  },
  images: { "media/cafe.jpg": [480, 960] },
};
const TOKEN = "a-token-long-enough";

describe("a visitor's address", () => {
  test("is the one a reverse proxy gives, from this machine or when every request comes through one (Q556)", () => {
    expect(visitorAddress("203.0.113.9", "198.51.100.1", false)).toBe("203.0.113.9");
    expect(visitorAddress("127.0.0.1", "198.51.100.1, 10.0.0.2", false)).toBe("198.51.100.1");
    expect(visitorAddress("::1", "", false)).toBe("::1");
    // Caddy in another container of the export's compose.yaml.
    expect(visitorAddress("172.18.0.3", "198.51.100.1", true)).toBe("198.51.100.1");
    expect(visitorAddress("172.18.0.3", "", true)).toBe("172.18.0.3");
  });
});

describe("the Node export's server", () => {
  const dir = mkdtempSync(join(tmpdir(), "node-host-"));
  let base = "";
  const server = (() => {
    writeFileSync(join(dir, "site.json"), JSON.stringify(SITE));
    mkdirSync(join(dir, "public/assets"), { recursive: true });
    writeFileSync(join(dir, "public/assets/site.css"), "body{}");
    return siteServer({ dir, dataDir: join(dir, "data"), managementToken: TOKEN });
  })();
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test("serves public/ as it is, pages with the export's head and the images' copies", async () => {
    const css = await fetch(`${base}/assets/site.css`);
    expect(css.headers.get("content-type")).toMatch(/text\/css/);
    expect(await css.text()).toBe("body{}");
    expect((await fetch(`${base}/../site.json`)).status).toBe(404);
    const home = await (await fetch(`${base}/`)).text();
    expect(home).toContain('<link rel="stylesheet" href="/assets/site.css">');
    expect(home).toContain('<link rel="stylesheet" href="/theme.css">');
    expect(home).toContain('srcset="/media/cafe-480w.webp 480w, /media/cafe-960w.webp 960w"');
    expect(home).toContain('name="_website"');
    expect(home).not.toMatch(/data-spaka-/);
  });

  test("keeps what a visitor sends in data/data.sqlite, shown and read with the token", async () => {
    const sent = await fetch(`${base}/_data/guestbook`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "name=Margot",
    });
    expect(await sent.text()).toBe("<p>Thanks Margot</p>");
    expect(existsSync(join(dir, "data/data.sqlite"))).toBe(true);
    expect(await (await fetch(`${base}/`)).text()).toContain('<p class="entry">Margot</p>');
    expect((await fetch(`${base}/_spaka/records/guestbook`)).status).toBe(401);
    const { records } = await (
      await fetch(`${base}/_spaka/records/guestbook`, { headers: { authorization: `Bearer ${TOKEN}` } })
    ).json();
    expect(records.map((r: { fields: { name: string } }) => r.fields.name)).toEqual(["Margot"]);
  });
});

describe("the Cloudflare export's Worker", () => {
  test("answers with the runtime, the records kept in D1", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(RECORDS_SCHEMA);
    const bound = (sql: string, values: unknown[]) => ({
      all: async () => ({ results: db.prepare(sql).all(...(values as never[])) as Record<string, unknown>[] }),
      first: async () => (db.prepare(sql).get(...(values as never[])) as Record<string, unknown> | undefined) ?? null,
      run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(values as never[])).changes) } }),
    });
    const env = {
      DB: { prepare: (sql: string) => ({ bind: (...values: unknown[]) => bound(sql, values) }) },
      SPAKA_TOKEN: TOKEN,
    };
    const worker = siteWorker(SITE);
    const sent = await worker.fetch(
      new Request("https://site.example/_data/guestbook", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "203.0.113.9" },
        body: "name=Anne",
      }),
      env,
    );
    expect(await sent.text()).toBe("<p>Thanks Anne</p>");
    expect(String(db.prepare("SELECT visitor FROM records").get()?.visitor)).toMatch(/^[0-9a-f]{24}$/);
    expect(await (await worker.fetch(new Request("https://site.example/"), env)).text()).toContain("Anne");
  });
});

/** A site with server modules, as the exports write it: site.json's list, and the modules bundled into modules.mjs. */
const WITH_MODULES: PublishedSite = {
  files: {
    "pages/index.liquid":
      '<html><head><title>Home</title></head><body>{% load places lesson: "surf" %}<p id="left">{{ places.left }}</p><p id="key">{{ places.key }}</p></body></html>',
    "fragments/booked.liquid": "<p>Booked, {{ answer.left }} left</p>",
  },
  images: {},
  server: {
    modules: ["places", "book"],
    secrets: ["PAYMENT_KEY"],
    migrations: [
      { name: "0001-places.sql", sql: "CREATE TABLE places (lesson TEXT PRIMARY KEY, left INTEGER NOT NULL);" },
      { name: "0002-surf.sql", sql: "INSERT INTO places VALUES ('surf', 2);" },
    ],
  },
};
const PLACES = `export async function load(args, { sql, env, files }) {
  const row = await sql.get("SELECT left FROM places WHERE lesson = ?", args.lesson);
  return { left: row?.left ?? 0, key: env.PAYMENT_KEY.slice(0, 3), files: !!files };
}`;
const BOOK = `export const answer = "booked";
export async function action(fields, { sql }) {
  await sql.run("UPDATE places SET left = left - 1 WHERE lesson = 'surf'");
  return await sql.get("SELECT left FROM places WHERE lesson = 'surf'");
}
export async function route() { return new Response("BEGIN:VCALENDAR", { headers: { "content-type": "text/calendar" } }); }`;
const form = (base: string) =>
  new Request(`${base}/_server/book`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "hx-request": "true" },
    body: "name=Ana",
  });

describe("server modules once published (ADR 0014)", () => {
  test("the Node server applies the migrations at start, runs modules.mjs with the secrets of its environment", async () => {
    const dir = mkdtempSync(join(tmpdir(), "node-modules-"));
    writeFileSync(join(dir, "site.json"), JSON.stringify(WITH_MODULES));
    mkdirSync(join(dir, "modules"));
    writeFileSync(join(dir, "modules/places.mjs"), PLACES);
    writeFileSync(join(dir, "modules/book.mjs"), BOOK);
    writeFileSync(
      join(dir, "modules.mjs"),
      'export const modules = { places: () => import("./modules/places.mjs"), book: () => import("./modules/book.mjs") };',
    );
    const server = siteServer({ dir, dataDir: join(dir, "data"), env: { PAYMENT_KEY: "sk_live_x", HOME: "/root" } });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const home = await (await fetch(`${base}/`)).text();
      expect(home).toContain('<p id="left">2</p><p id="key">sk_</p>');
      expect(await (await fetch(form(base))).text()).toContain("<p>Booked, 1 left</p>");
      const ics = await fetch(`${base}/_server/book/lessons.ics`);
      expect(ics.headers.get("content-type")).toBe("text/calendar");
      expect(existsSync(join(dir, "data/files"))).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Started again, nothing is applied twice.
    const again = siteServer({ dir, dataDir: join(dir, "data"), env: {} });
    await new Promise<void>((resolve) => again.listen(0, "127.0.0.1", resolve));
    try {
      const home = await (await fetch(`http://127.0.0.1:${(again.address() as AddressInfo).port}/`)).text();
      // Without its secret, the load says so in the server's log and the page still shows.
      expect(home).toContain('<p id="left"></p>');
    } finally {
      await new Promise<void>((resolve) => again.close(() => resolve()));
    }
  });

  test("the Worker runs the bundled modules on D1, with the secrets of its bindings and no folder for files", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(RECORDS_SCHEMA);
    for (const m of WITH_MODULES.server!.migrations) db.exec(m.sql);
    const bound = (sql: string, values: unknown[]) => ({
      all: async () => ({ results: db.prepare(sql).all(...(values as never[])) as Record<string, unknown>[] }),
      first: async () => (db.prepare(sql).get(...(values as never[])) as Record<string, unknown> | undefined) ?? null,
      run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(values as never[])).changes) } }),
    });
    const env = {
      DB: { prepare: (sql: string) => ({ bind: (...values: unknown[]) => bound(sql, values) }) },
      PAYMENT_KEY: "sk_test_y",
    };
    const asModule = (code: string) => () => import(`data:text/javascript,${encodeURIComponent(code)}`);
    const worker = siteWorker(WITH_MODULES, { modules: { places: asModule(PLACES), book: asModule(BOOK) } });
    expect(await (await worker.fetch(new Request("https://site.example/"), env)).text()).toContain(
      '<p id="left">2</p><p id="key">sk_</p>',
    );
    expect(await (await worker.fetch(form("https://site.example"), env)).text()).toContain("<p>Booked, 1 left</p>");
  });
});
