import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memorySource } from "@upstart/runtime";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  BUILDERS,
  type BuildProject,
  builderById,
  compatibilityDate,
  formsToServices,
  NODE_COMPAT_DATE,
  slug,
} from "./index.ts";

let out: string;
beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), "upstart-builders-"));
});
afterEach(() => rmSync(out, { recursive: true, force: true }));

const GUESTBOOK = "label: Guestbook\ncollected: true\nfields:\n  - name: name\n    kind: text\n";
const CONTACT = "label: Contact\ncollected: true\nfields:\n  - name: email\n    kind: email\n";
const FORM = (name: string) =>
  `<form hx-post="/_data/${name}" hx-status:422="target:#problems swap:innerHTML" class="card"><input name="name"><button>Send</button></form>`;

const project = (files: Record<string, string>, name = "Chez Margot"): BuildProject => {
  const source = memorySource(files);
  return {
    name,
    source,
    files: Object.keys(files),
    readFile: (path) => Buffer.from(files[path] ?? ""),
  };
};

const contact = () =>
  project({
    "pages/index.liquid": `<html><head><title>Home</title></head><body><h1 class="text-4xl">Hi</h1>${FORM("contact")}</body></html>`,
    "data/contact/_datasource.yaml": CONTACT,
    "media/logo.svg": "<svg/>",
  });

describe("every builder", () => {
  test.each(BUILDERS.map((b) => [b.id, b] as const))("%s keeps the contract", async (id, builder) => {
    expect(builderById(id)).toBe(builder);
    expect(builder.check(contact())).toEqual({ ok: true });
    const result = await builder.build(contact(), { outDir: out, serverBundle: "// server", formServices: {} });
    expect(result.pages).toEqual(["/"]);
    for (const file of result.files) expect(existsSync(join(out, file))).toBe(true);
    expect(builder.guide(result).length).toBeGreaterThan(0);
  });
});

describe("the static site", () => {
  test("a form sends to its form service, as a plain form, or is said to send nothing", () => {
    const warnings: string[] = [];
    const html = `${FORM("contact")}<div aria-hidden="true" style="position:absolute"><input type="text" name="_website" tabindex="-1" autocomplete="off" value=""></div>${FORM("other")}<form hx-post="/search">`;
    const rewritten = formsToServices(html, { contact: "https://formspree.io/f/abc" }, "pages/index.liquid", warnings);
    expect(rewritten).toBe(
      '<form action="https://formspree.io/f/abc" method="post" class="card"><input name="name"><button>Send</button></form><form class="card"><input name="name"><button>Send</button></form><form hx-post="/search">',
    );
    expect(warnings).toEqual([
      "pages/index.liquid: the other form has no form service's address, so it sends nothing.",
    ]);
  });

  test("is refused when a page shows what visitors sent", async () => {
    const shows = project({
      "pages/index.liquid": `{% for e in data.guestbook %}<p>{{ e.name }}</p>{% endfor %}${FORM("guestbook")}`,
      "pages/contact.liquid": FORM("contact"),
      "data/guestbook/_datasource.yaml": GUESTBOOK,
      "data/contact/_datasource.yaml": CONTACT,
    });
    const builder = builderById("static")!;
    expect(builder.check(shows)).toEqual({
      ok: false,
      refusal: { reason: "shows-collected", datasources: ["guestbook"] },
    });
    await expect(builder.build(shows, { outDir: out })).rejects.toThrow(/cannot show what visitors send/);
    expect(builderById("node")!.check(shows)).toEqual({ ok: true });
  });

  test("writes the form service's address into the page", async () => {
    await builderById("static")!.build(contact(), { outDir: out, formServices: { contact: "https://example.com/f" } });
    const home = readFileSync(join(out, "index.html"), "utf8");
    expect(home).toContain('<form action="https://example.com/f" method="post" class="card">');
    expect(home).not.toContain("_website");
  });
});

describe("the Node export", () => {
  test("server.mjs, site.json, public/, a Dockerfile and its guide", async () => {
    const result = await builderById("node")!.build(contact(), { outDir: out, serverBundle: "// the server" });
    expect(result.name).toBe("chez-margot");
    expect(readFileSync(join(out, "server.mjs"), "utf8")).toBe("// the server");
    const site = JSON.parse(readFileSync(join(out, "site.json"), "utf8"));
    expect(Object.keys(site.files).sort()).toEqual(["data/contact/_datasource.yaml", "pages/index.liquid"]);
    expect(existsSync(join(out, "public/assets/site.css"))).toBe(true);
    expect(existsSync(join(out, "public/assets/htmx.js"))).toBe(true);
    expect(existsSync(join(out, "public/media/logo.svg"))).toBe(true);
    expect(existsSync(join(out, "public/index.html"))).toBe(false);
    expect(readFileSync(join(out, "public/assets/site.css"), "utf8")).toContain(".text-4xl");
    const docker = readFileSync(join(out, "Dockerfile"), "utf8");
    expect(docker).toContain("FROM node:24-slim");
    expect(docker).toContain("VOLUME /data");
    expect(readFileSync(join(out, "GUIDE.md"), "utf8")).toContain("docker build -t chez-margot .");
    await expect(builderById("node")!.build(contact(), { outDir: out })).rejects.toThrow(/server\.mjs/);
  });
});

describe("the Cloudflare export", () => {
  const read = (file: string) => readFileSync(join(out, file), "utf8");

  test("a Worker with Static Assets, D1 and a required secret, configured by wrangler.jsonc", async () => {
    await builderById("cloudflare")!.build(contact(), {
      outDir: out,
      serverBundle: "// the worker",
      today: new Date("2026-11-12T10:00:00Z"),
    });
    const config = JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""));
    expect(config).toEqual({
      $schema: "./node_modules/wrangler/config-schema.json",
      name: "chez-margot",
      main: "worker.mjs",
      compatibility_date: "2026-11-12",
      assets: { directory: "./public", run_worker_first: ["/_data/*", "/_upstart/*"] },
      d1_databases: [{ binding: "DB", database_name: "chez-margot-records", migrations_dir: "migrations" }],
      secrets: { required: ["UPSTART_TOKEN"] },
      observability: { enabled: true },
    });
    expect(config.compatibility_flags).toBeUndefined();
    expect(read("worker.mjs")).toBe("// the worker");
    expect(JSON.parse(read("package.json")).devDependencies.wrangler).toMatch(/^\d+\.\d+\.\d+$/);
    expect(read("migrations/0001_records.sql")).toContain("CREATE TABLE IF NOT EXISTS records");
    const kept = '{\n  "d1_databases": [{ "binding": "DB", "database_id": "0f2c-11ab" }]\n}';
    await builderById("cloudflare")!.build(contact(), { outDir: out, serverBundle: "//" });
    expect(read("wrangler.jsonc")).not.toContain("database_id");
    writeFileSync(join(out, "wrangler.jsonc"), kept);
    await builderById("cloudflare")!.build(contact(), { outDir: out, serverBundle: "//" });
    expect(JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, "")).d1_databases[0].database_id).toBe(
      "0f2c-11ab",
    );
    expect(read(".dev.vars")).toMatch(/^UPSTART_TOKEN=[0-9a-f]{24}$/m);
    expect(read(".gitignore")).toContain(".dev.vars");
    expect(existsSync(join(out, "public/assets/site.css"))).toBe(true);
  });

  test("its compatibility date turns Node.js compatibility on: never before 2026-08-04", () => {
    expect(compatibilityDate(new Date("2026-11-12T23:00:00Z"))).toBe("2026-11-12");
    expect(compatibilityDate(new Date("2025-01-01T00:00:00Z"))).toBe(NODE_COMPAT_DATE);
    expect(NODE_COMPAT_DATE >= "2026-08-04").toBe(true);
  });
});

test("names: lower case, letters, digits, dashes, starting with a letter", () => {
  expect(slug("Chez Margot — Boulangerie")).toBe("chez-margot-boulangerie");
  expect(slug("Café")).toBe("cafe");
  expect(slug("2026 menu")).toBe("site-2026-menu");
  expect(slug("!!!")).toBe("website");
});
