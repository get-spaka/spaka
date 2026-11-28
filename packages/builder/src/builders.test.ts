import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memorySource } from "@spaka/runtime";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  BUILDERS,
  type BuildProject,
  builderById,
  compatibilityDate,
  formsToServices,
  NEWEST_COMPAT_DATE,
  NODE_COMPAT_DATE,
  slug,
  WRANGLER_VERSION,
} from "./index.ts";

let out: string;
beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), "spaka-builders-"));
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
    expect(await builder.check(contact())).toEqual({ ok: true });
    const result = await builder.build(contact(), { outDir: out, serverBundle: "// server", formServices: {} });
    expect(result.pages).toEqual(["/"]);
    for (const file of result.files) expect(existsSync(join(out, file))).toBe(true);
    expect(builder.guide(result).length).toBeGreaterThan(0);
  });

  test("the static one is put online by dragging its folder onto a hosting service's page", async () => {
    const builder = builderById("static")!;
    const result = await builder.build(contact(), { outDir: out, formServices: {} });
    expect(builder.guide(result).map((s) => s.id)).toEqual(["open", "drop", "keep", "update", "forms"]);
  });
});

describe("the static site", () => {
  test("a form sends to its form service, as a plain form, or is said to send nothing", async () => {
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
    expect(await builder.check(shows)).toEqual({
      ok: false,
      refusal: { reason: "shows-collected", datasources: ["guestbook"] },
    });
    await expect(builder.build(shows, { outDir: out })).rejects.toThrow(/cannot show what visitors send/);
    expect(await builderById("node")!.check(shows)).toEqual({ ok: true });
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
    const result = await builderById("node")!.build(contact(), {
      outDir: out,
      serverBundle: "// the server",
      managementToken: "the-token",
    });
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
    const readme = readFileSync(join(out, "README.md"), "utf8");
    expect(readme).toContain("--env-file .env chez-margot");
    // Docker first, and how to use a domain name of one's own (Q554, Q555).
    expect(readme.indexOf("## With Docker")).toBeLessThan(readme.indexOf("## Try it on this machine"));
    // The website behind Caddy, the domain name from .env (Q556).
    const compose = readFileSync(join(out, "compose.yaml"), "utf8");
    expect(compose).toContain("SPAKA_DOMAIN: ${SPAKA_DOMAIN:-:80}");
    expect(compose).toContain('SPAKA_PROXY: "1"');
    expect(compose).not.toContain("3000:3000");
    expect(readFileSync(join(out, "Caddyfile"), "utf8")).toContain("{$SPAKA_DOMAIN} {\n\treverse_proxy site:3000");
    expect(readFileSync(join(out, ".env"), "utf8")).toMatch(/^SPAKA_DOMAIN=$/m);
    expect(readme).toContain("## Your own domain name");
    // The token is in .env, which git and the Docker image leave out (Q191).
    expect(readFileSync(join(out, ".env"), "utf8")).toMatch(/^SPAKA_TOKEN=the-token$/m);
    expect(readFileSync(join(out, ".dockerignore"), "utf8")).toContain(".env");
    expect(readFileSync(join(out, ".gitignore"), "utf8")).toContain(".env");
    expect(
      builderById("node")!
        .guide(result)
        .map((s) => s.id),
    ).toEqual(["docker", "server", "address"]);
    expect(builderById("node")!.guide(result)[0]!.command).toBe("docker compose up -d --build");
    await expect(builderById("node")!.build(contact(), { outDir: out })).rejects.toThrow(/server\.mjs/);
  });
});

describe("the export's .env", () => {
  const env = () => readFileSync(join(out, ".env"), "utf8");
  const build = (managementToken: string, earlierEnv?: string) =>
    builderById("node")!.build(contact(), { outDir: out, serverBundle: "// the server", managementToken, earlierEnv });

  test("keeps what the maker wrote into the earlier one, with the token of today (Q556)", async () => {
    await build("first-token");
    const edited = `${env().replace(/^SPAKA_DOMAIN=$/m, "SPAKA_DOMAIN=example.com, www.example.com")}PORT=8080\n`;
    await build("second-token", edited);
    expect(env().match(/^SPAKA_TOKEN=.*$/gm)).toEqual(["SPAKA_TOKEN=second-token"]);
    expect(env().match(/^SPAKA_DOMAIN=.*$/gm)).toEqual(["SPAKA_DOMAIN=example.com, www.example.com"]);
    expect(env()).toMatch(/^PORT=8080$/m);
    // Exported again and again, it does not grow.
    const once = env();
    await build("second-token", once);
    expect(env()).toBe(once);
  });

  test("gains the domain name's line when an earlier one has none", async () => {
    await build(
      "the-token",
      "# The website's management token, with which Spaka reads what visitors send. Keep it private.\nSPAKA_TOKEN=old\n",
    );
    expect(env()).toMatch(/^SPAKA_TOKEN=the-token$/m);
    expect(env()).toMatch(/^SPAKA_DOMAIN=$/m);
  });
});

describe("the Cloudflare export", () => {
  const read = (file: string) => readFileSync(join(out, file), "utf8");

  test("a Worker with Static Assets, D1 and a required secret, configured by wrangler.jsonc", async () => {
    await builderById("cloudflare")!.build(contact(), {
      outDir: out,
      serverBundle: "// the worker",
      managementToken: "the-token",
      today: new Date("2026-11-09T10:00:00Z"),
    });
    const config = JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""));
    expect(config).toEqual({
      $schema: "./node_modules/wrangler/config-schema.json",
      name: "chez-margot",
      main: "worker.mjs",
      compatibility_date: "2026-11-09",
      assets: { directory: "./public", run_worker_first: ["/_data/*", "/_spaka/*"] },
      d1_databases: [{ binding: "DB", database_name: "chez-margot-records", migrations_dir: "migrations" }],
      secrets: { required: ["SPAKA_TOKEN"] },
      observability: { enabled: true },
    });
    expect(config.compatibility_flags).toBeUndefined();
    expect(read("worker.mjs")).toBe("// the worker");
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.devDependencies.wrangler).toMatch(/^\d+\.\d+\.\d+$/);
    // The deploy sends the token in .env as the Worker's secret (Q191).
    expect(pkg.scripts.deploy).toBe("wrangler deploy --secrets-file .env");
    expect(read(".env")).toMatch(/^SPAKA_TOKEN=the-token$/m);
    expect(read("migrations/0001_records.sql")).toContain("CREATE TABLE IF NOT EXISTS records");
    const kept = '{\n  "d1_databases": [{ "binding": "DB", "database_id": "0f2c-11ab" }]\n}';
    await builderById("cloudflare")!.build(contact(), { outDir: out, serverBundle: "//" });
    expect(read("wrangler.jsonc")).not.toContain("database_id");
    writeFileSync(join(out, "wrangler.jsonc"), kept);
    await builderById("cloudflare")!.build(contact(), { outDir: out, serverBundle: "//" });
    expect(JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, "")).d1_databases[0].database_id).toBe(
      "0f2c-11ab",
    );
    expect(read(".dev.vars")).toMatch(/^SPAKA_TOKEN=[0-9a-f]{24}$/m);
    expect(read(".gitignore")).toContain(".dev.vars");
    expect(existsSync(join(out, "public/assets/site.css"))).toBe(true);
  });

  test("its compatibility date turns Node.js compatibility on: never before 2026-08-04", async () => {
    expect(compatibilityDate(new Date("2026-11-09T23:00:00Z"))).toBe("2026-11-09");
    // Never later than the runtime of the wrangler the export installs knows.
    expect(compatibilityDate(new Date("2026-11-19T08:00:00Z"))).toBe(NEWEST_COMPAT_DATE);
    const wranglerRequire = createRequire(createRequire(import.meta.url).resolve("wrangler/package.json"));
    expect(wranglerRequire("wrangler/package.json").version).toBe(WRANGLER_VERSION);
    expect(wranglerRequire("workerd").compatibilityDate).toBe(NEWEST_COMPAT_DATE);
    expect(compatibilityDate(new Date("2025-01-01T00:00:00Z"))).toBe(NODE_COMPAT_DATE);
    expect(NODE_COMPAT_DATE >= "2026-08-04").toBe(true);
  });
});

test("names: lower case, letters, digits, dashes, starting with a letter", async () => {
  expect(slug("Chez Margot — Boulangerie")).toBe("chez-margot-boulangerie");
  expect(slug("Café")).toBe("cafe");
  expect(slug("2026 menu")).toBe("site-2026-menu");
  expect(slug("!!!")).toBe("website");
});

describe("a site's scripts and stylesheet (ADR 0011)", () => {
  const animated = () =>
    project({
      "pages/index.liquid": `<html><head><title>Home</title></head><body><h1 class="headline">Hi</h1></body></html>`,
      // A file the module imports, below scripts/: copied, never loaded by the head.
      "scripts/lib/split.js": "export const split = (s) => s.split('');",
      "scripts/reveal.js": 'import { split } from "./lib/split.js";\nexport function start(root) {}',
      "styles/site.css": ".headline { @apply text-primary; letter-spacing: -0.04em; }",
      // A picture the stylesheet refers to (Kindly's seal, Commons' edges): served as it is.
      "styles/edges/wave.svg": "<svg/>",
      // A template's blocks, offered by the Blocks tab (Q235): not the site's.
      "blocks/hero/hero-studio/block.liquid": "<section>Hero</section>",
    });

  test("the static site loads them, its stylesheet compiled into site.css with Tailwind's", async () => {
    await builderById("static")!.build(animated(), { outDir: out, formServices: {} });
    const page = readFileSync(join(out, "index.html"), "utf8");
    expect(page).not.toContain('<script src="/scripts/lib/split.js"');
    expect(page).toContain('<script src="/assets/spaka-start.js" data-modules="/scripts/reveal.js" defer></script>');
    expect(existsSync(join(out, "scripts/lib/split.js"))).toBe(true);
    expect(readFileSync(join(out, "assets/spaka-start.js"), "utf8")).toContain("__spakaStart");
    expect(readFileSync(join(out, "scripts/reveal.js"), "utf8")).toContain("export function start");
    const css = readFileSync(join(out, "assets/site.css"), "utf8");
    // @apply and the theme's names work in it.
    expect(css).toMatch(/\.headline\s*\{[^}]*color: var\(--theme-color-primary[^}]*letter-spacing: -0\.04em/);
    // Compiled into site.css, not copied as it is.
    expect(existsSync(join(out, "styles/site.css"))).toBe(false);
    expect(existsSync(join(out, "styles/edges/wave.svg"))).toBe(true);
    expect(existsSync(join(out, "blocks"))).toBe(false);
  });

  test("a published site's runtime loads them from site.json", async () => {
    await builderById("node")!.build(animated(), { outDir: out, serverBundle: "// server" });
    const site = JSON.parse(readFileSync(join(out, "site.json"), "utf8"));
    expect(site.assets.modules).toEqual(["scripts/reveal.js"]);
    expect(existsSync(join(out, "public/assets/spaka-start.js"))).toBe(true);
    expect(existsSync(join(out, "public/scripts/reveal.js"))).toBe(true);
    expect(existsSync(join(out, "public/styles/edges/wave.svg"))).toBe(true);
  });

  // The packages its scripts import (ADR 0013): their modules, made by the app, written where the import map points.
  const withPackages = () =>
    project({
      "pages/index.liquid": '<h1 data-carousel class="text-primary">Chez Margot</h1>',
      "scripts/carousel.js":
        'import EmblaCarousel from "embla-carousel";\nimport gone from "gone";\nexport function start() {}',
      "node_modules/embla-carousel/package.json": JSON.stringify({ name: "embla-carousel", version: "8.6.0" }),
      "node_modules/gone/package.json": JSON.stringify({ name: "gone", version: "1.0.0" }),
      "package.json": JSON.stringify({ dependencies: { "embla-carousel": "8.6.0", gone: "1.0.0" } }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    });
  const made = async (imports: { specifier: string }[]) =>
    new Map(
      imports.map((p) => [
        p.specifier,
        p.specifier === "gone"
          ? { error: "Vite could not resolve it" }
          : { code: `/*! ${p.specifier} */export default 1;` },
      ]),
    );

  test("the static site gets its packages' modules and the import map; package.json and the lockfile stay out", async () => {
    const result = await builderById("static")!.build(withPackages(), {
      outDir: out,
      formServices: {},
      packageModules: made,
    });
    expect(readFileSync(join(out, "assets/packages/embla-carousel@8.6.0.js"), "utf8")).toBe(
      "/*! embla-carousel */export default 1;",
    );
    expect(readFileSync(join(out, "index.html"), "utf8")).toContain(
      '<script type="importmap">{"imports":{"embla-carousel":"/assets/packages/embla-carousel@8.6.0.js","gone":"/assets/packages/gone@1.0.0.js"}}</script>',
    );
    expect(result.warnings).toContain(
      "The package gone 1.0.0 has no module in the export (Vite could not resolve it): the pages whose scripts import it will not run them.",
    );
    expect(existsSync(join(out, "assets/packages/gone@1.0.0.js"))).toBe(false);
    for (const file of ["package.json", "pnpm-lock.yaml", "node_modules"])
      expect(existsSync(join(out, file))).toBe(false);
  });

  test("a published site gets them in public/, its import map in site.json; without the app's modules, a warning", async () => {
    await builderById("node")!.build(withPackages(), { outDir: out, serverBundle: "// server", packageModules: made });
    expect(existsSync(join(out, "public/assets/packages/embla-carousel@8.6.0.js"))).toBe(true);
    const site = JSON.parse(readFileSync(join(out, "site.json"), "utf8"));
    expect(site.assets.packages.map((p: { url: string }) => p.url)).toEqual([
      "/assets/packages/embla-carousel@8.6.0.js",
      "/assets/packages/gone@1.0.0.js",
    ]);
    expect(existsSync(join(out, "public/package.json"))).toBe(false);
    const again = await builderById("static")!.build(withPackages(), { outDir: join(out, "again"), formServices: {} });
    expect(again.warnings.filter((w) => w.startsWith("The package"))).toHaveLength(2);
  });

  test("a site without them gets no start script", async () => {
    await builderById("static")!.build(contact(), { outDir: out, formServices: {} });
    expect(existsSync(join(out, "assets/spaka-start.js"))).toBe(false);
    expect(readFileSync(join(out, "index.html"), "utf8")).not.toContain("spaka-start");
  });
});

describe("a site's server modules (ADR 0014)", () => {
  const read = (file: string) => readFileSync(join(out, file), "utf8");
  const withModules = (extra: Record<string, string> = {}) =>
    project({
      "pages/index.liquid":
        '<html><head><title>Home</title></head><body>{% load weather city: "Biarritz" %}<p>{{ weather.temperature }}°</p></body></html>',
      "server/weather.ts": "export function load(args, { env }) { return { temperature: 21 }; }",
      "server/types.ts.bak": "not a module",
      "server/migrations/0001-places.sql": "CREATE TABLE places (lesson TEXT PRIMARY KEY, left INTEGER);",
      "server/migrations/0002-surf.sql": "INSERT INTO places VALUES ('surf', 8);",
      ...extra,
    });
  const asked: [Record<string, string>, string][] = [];
  const bundle = async (modules: Record<string, string>, target: string) => {
    asked.push([modules, target]);
    return {
      files: [
        { path: "modules.mjs", code: 'export const modules = { weather: () => import("./server/weather-1.mjs") };' },
        { path: "server/weather-1.mjs", code: "export function load() {}" },
      ],
      warnings: ["a warning of Rolldown's"],
    };
  };
  const secrets = { PAYMENT_KEY: "sk test#1", MAILER_KEY: "" };

  test("the Node export bundles them beside server.mjs; site.json lists them, the secrets' names and the migrations", async () => {
    asked.length = 0;
    const result = await builderById("node")!.build(withModules(), {
      outDir: out,
      serverBundle: "// the server",
      managementToken: "t",
      server: { bundle, secrets },
    });
    expect(asked).toEqual([[{ weather: "server/weather.ts" }, "node"]]);
    expect(read("modules.mjs")).toContain("weather-1.mjs");
    expect(read("server/weather-1.mjs")).toContain("load");
    expect(JSON.parse(read("site.json")).server).toEqual({
      modules: ["weather"],
      secrets: ["MAILER_KEY", "PAYMENT_KEY"],
      migrations: [
        { name: "0001-places.sql", sql: "CREATE TABLE places (lesson TEXT PRIMARY KEY, left INTEGER);" },
        { name: "0002-surf.sql", sql: "INSERT INTO places VALUES ('surf', 8);" },
      ],
    });
    expect(result.warnings).toContain("Server modules: a warning of Rolldown's");
    // The secrets in .env, quoted when need be; the one with no value left for the maker to give.
    expect(read(".env")).toMatch(/^PAYMENT_KEY='sk test#1'$/m);
    expect(read(".env")).toMatch(/^# MAILER_KEY=$/m);
    expect(read(".env")).not.toMatch(/^MAILER_KEY=/m);
    // Exported again, with the secret now given and the other replaced: no line twice, nothing grows.
    const earlierEnv = read(".env");
    const again = { PAYMENT_KEY: "sk_2", MAILER_KEY: "mk_1" };
    await builderById("node")!.build(withModules(), {
      outDir: out,
      serverBundle: "// the server",
      managementToken: "t",
      earlierEnv,
      server: { bundle, secrets: again },
    });
    expect(read(".env").match(/^(PAYMENT_KEY|MAILER_KEY)=.*$/gm)).toEqual(["MAILER_KEY=mk_1", "PAYMENT_KEY=sk_2"]);
    expect(read(".env")).not.toMatch(/# MAILER_KEY=|not given in Spaka/);
    const twice = read(".env");
    await builderById("node")!.build(withModules(), {
      outDir: out,
      serverBundle: "// the server",
      managementToken: "t",
      earlierEnv: twice,
      server: { bundle, secrets: again },
    });
    expect(read(".env")).toBe(twice);
  });

  test("an export cannot leave them out: without Spaka's Rolldown, or when they do not bundle, it stops and says why", async () => {
    const build = (server?: object) =>
      builderById("node")!.build(withModules(), { outDir: out, serverBundle: "//", server: server as never });
    await expect(build()).rejects.toThrow(/Rolldown for the server modules/);
    await expect(build({ bundle: async () => ({ error: "sharp has native code" }) })).rejects.toThrow(
      "The server modules could not be bundled: sharp has native code",
    );
  });

  test("the Cloudflare export: the migrations after the records', the secrets required and in .env and .dev.vars, no folder for files", async () => {
    asked.length = 0;
    const result = await builderById("cloudflare")!.build(
      withModules({ "server/upload.ts": "export async function action(fields, { files }) { return files; }" }),
      { outDir: out, serverBundle: "// worker", managementToken: "t", server: { bundle, secrets } },
    );
    expect(asked[0]![1]).toBe("worker");
    expect(result.files.filter((f) => f.startsWith("migrations/")).sort()).toEqual([
      "migrations/0001_records.sql",
      "migrations/0002_places.sql",
      "migrations/0003_surf.sql",
    ]);
    expect(read("migrations/0003_surf.sql")).toBe("INSERT INTO places VALUES ('surf', 8);");
    const config = JSON.parse(read("wrangler.jsonc").replace(/^\/\/.*$/m, ""));
    expect(config.secrets.required).toEqual(["SPAKA_TOKEN", "PAYMENT_KEY"]);
    expect(read(".env")).toMatch(/^PAYMENT_KEY='sk test#1'$/m);
    expect(read(".dev.vars")).toMatch(/^PAYMENT_KEY='sk test#1'$/m);
    expect(result.warnings).toContain(
      "server/upload.ts may write files, and a Cloudflare Worker has no folder for them: publish it on a server for that.",
    );
    expect(result.warnings.filter((w) => w.includes("weather"))).toEqual([]);
  });

  test("a Worker always imports modules.mjs: a site with none gets an empty one, and site.json no server", async () => {
    await builderById("cloudflare")!.build(contact(), { outDir: out, serverBundle: "// worker", managementToken: "t" });
    expect(read("modules.mjs")).toBe("export const modules = {};\n");
    expect(JSON.parse(read("site.json")).server).toBeUndefined();
  });

  test("the static site runs each load at export, and says what answers forms has no server there (Q503)", async () => {
    const host = {
      kinds: async (name: string) => (name === "weather" ? ["load" as const] : ["action" as const, "route" as const]),
      load: async () => ({ temperature: 23 }),
      action: async () => ({ value: "ok" }),
      route: async () => new Response("ok"),
    };
    const result = await builderById("static")!.build(
      withModules({ "server/book.ts": "export function action() {}" }),
      {
        outDir: out,
        server: { host },
      },
    );
    expect(read("index.html")).toContain("<p>23°</p>");
    expect(result.warnings).toEqual([
      "server/book.ts answers forms and other services' calls at /_server/book, which a static site cannot: publish it on a server or on Cloudflare for that.",
    ]);
  });
});
