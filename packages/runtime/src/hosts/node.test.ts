import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { RECORDS_SCHEMA } from "../sql.ts";
import { siteServer } from "./node.ts";
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
    expect(home).not.toMatch(/data-up-/);
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
    expect((await fetch(`${base}/_upstart/records/guestbook`)).status).toBe(401);
    const { records } = await (
      await fetch(`${base}/_upstart/records/guestbook`, { headers: { authorization: `Bearer ${TOKEN}` } })
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
      run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(values as never[])).changes) } }),
    });
    const env = {
      DB: { prepare: (sql: string) => ({ bind: (...values: unknown[]) => bound(sql, values) }) },
      UPSTART_TOKEN: TOKEN,
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
