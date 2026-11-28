import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

const WINDOWS = process.platform === "win32";

// A site's server modules once exported (ADR 0014, the packages plan's slice
// 7), for real: Spaka's Rolldown bundles server/ for each export. The static
// site gets each load's answer written into its page, and says that the
// booking form has no server there (Q503); the Node server, run with `node
// server.mjs`, applies the migrations at its start, reads the secret from the
// .env the export wrote, books and serves the calendar; the Worker, run with
// wrangler on this machine, does the same on a local D1, the module's
// migrations after the records'.
const PAGE = `<!doctype html><html lang="en"><head><title>Surf</title></head><body><main>
{% load places lesson: "morning" %}
<p id="places">{{ places.left }} places left</p>
<p id="key">{{ places.key }}</p>
<form id="book" hx-post="/_server/book" hx-target="this" hx-swap="outerHTML"><input name="lesson" value="morning"><button>Book</button></form>
</main></body></html>`;

const PLACES = `type Places = { left: number; key: string };
export async function load(args: { lesson: string }, { sql, env }): Promise<Places> {
  const row = (await sql.get("SELECT left FROM places WHERE lesson = ?", args.lesson)) as { left: number } | undefined;
  return { left: row?.left ?? 0, key: env.PAYMENT_KEY.slice(0, 8) };
}`;

const BOOK = `export const answer = "booked";
export async function action(fields, { sql }) {
  await sql.run("UPDATE places SET left = left - 1 WHERE lesson = ?", fields.lesson);
  return await sql.get("SELECT left FROM places WHERE lesson = ?", fields.lesson);
}
export async function route() {
  return new Response("BEGIN:VCALENDAR\\nEND:VCALENDAR\\n", { headers: { "content-type": "text/calendar" } });
}`;

const KEY = "sk_test_exports_51c0";

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as { port: number }).port;
      probe.close(() => resolve(port));
    });
  });

const book = (base: string) =>
  fetch(`${base}/_server/book`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "hx-request": "true" },
    body: "lesson=morning",
  });

describe("a site's server modules once exported", () => {
  let launched: LaunchedApp;
  let path = "";
  const children: ChildProcess[] = [];
  const { invoke, until } = previewDriver(() => launched);
  const answers = async (url: string) => (await fetch(url).catch(() => undefined))?.ok;
  const write = (file: string, text: string) => {
    mkdirSync(join(path, file, ".."), { recursive: true });
    writeFileSync(join(path, file), text);
  };
  const run = (command: string, args: string[], cwd: string, env: Record<string, string> = {}) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: WINDOWS && command.endsWith(".cmd"),
    });
    let output = "";
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));
    children.push(child);
    return { child, output: () => output };
  };
  const done = (child: ChildProcess) =>
    new Promise<number | null>((resolve) => {
      child.on("exit", resolve);
      child.on("error", () => resolve(-1));
    });
  /** The page's server-made paragraphs, as visitors get them. */
  const shown = async (url: string) => {
    const html = await (await fetch(url)).text();
    return {
      places: /<p id="places">([^<]*)<\/p>/.exec(html)?.[1],
      key: /<p id="key">([^<]*)<\/p>/.exec(html)?.[1],
    };
  };
  /** Booked: the answer fragment with the places left; and the calendar served by the route. */
  const booksAndServes = async (base: string) => {
    const booked = await book(base);
    expect(booked.status).toBe(200);
    expect(await booked.text()).toContain("Booked, 7 left");
    expect(await shown(`${base}/surf`)).toEqual({ places: "7 places left", key: "sk_test_" });
    const calendar = await fetch(`${base}/_server/book/lessons.ics`);
    expect(calendar.headers.get("content-type")).toBe("text/calendar");
    expect(await calendar.text()).toContain("BEGIN:VCALENDAR");
  };

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    path = (await invoke("projects:current")).path;
    write("server/places.ts", PLACES);
    write("server/book.js", BOOK);
    write("server/migrations/0001-places.sql", "CREATE TABLE places (lesson TEXT PRIMARY KEY, left INTEGER NOT NULL);");
    write("server/migrations/0002-morning.sql", "INSERT INTO places VALUES ('morning', 8);");
    write("fragments/booked.liquid", "<p>Booked, {{ answer.left }} left</p>");
    write("pages/surf.liquid", PAGE);
    await invoke("secrets:set", "PAYMENT_KEY", KEY);
  }, 90_000 * SLOW);
  afterAll(async () => {
    for (const child of children)
      if (WINDOWS && child.pid) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
      else child.kill("SIGTERM");
    await launched?.close();
  });

  test("the static site has each load's answer in its page, and says the form has no server there", async () => {
    const out = join(runsDir, "server-static");
    rmSync(out, { recursive: true, force: true });
    const result = await invoke("export:run", out, "static");
    const html = readFileSync(join(out, "surf/index.html"), "utf8");
    expect(html, result.warnings.join("\n")).toContain('<p id="places">8 places left</p>');
    expect(html).toContain('<p id="key">sk_test_</p>');
    expect(result.warnings).toContainEqual(
      expect.stringMatching(/^server\/book\.js answers forms and other services' calls at \/_server\/book/),
    );
    // Nothing of the server's is published with a static site.
    expect(existsSync(join(out, "server"))).toBe(false);
    expect(existsSync(join(out, "modules.mjs"))).toBe(false);
  });

  test(
    "the Node server applies the migrations at its start, reads the secret from .env, books and serves the calendar",
    async () => {
      const out = join(runsDir, "server-node");
      rmSync(out, { recursive: true, force: true });
      await invoke("export:run", out, "node");
      expect(readFileSync(join(out, ".env"), "utf8")).toMatch(new RegExp(`^PAYMENT_KEY=${KEY}$`, "m"));
      // The modules bundled: plain JavaScript beside server.mjs, the project's TypeScript files not copied.
      expect(readFileSync(join(out, "modules.mjs"), "utf8")).toMatch(/places/);
      expect(existsSync(join(out, "public/server"))).toBe(false);
      const port = await freePort();
      const base = `http://127.0.0.1:${port}`;
      const server = run(process.execPath, ["server.mjs"], out, { PORT: String(port), HOST: "127.0.0.1" });
      await until(() => answers(`${base}/surf`), 15_000).catch(() => {
        throw new Error(server.output());
      });
      expect(await shown(`${base}/surf`)).toEqual({ places: "8 places left", key: "sk_test_" });
      await booksAndServes(base);
      expect(existsSync(join(out, "data/files"))).toBe(true);
    },
    90_000 * SLOW,
  );

  test(
    "the Worker runs them with wrangler on this machine, on a local D1, the secret from .dev.vars",
    async () => {
      const out = join(runsDir, "server-cloudflare");
      rmSync(out, { recursive: true, force: true });
      await invoke("export:run", out, "cloudflare");
      expect(readFileSync(join(out, "migrations/0003_morning.sql"), "utf8")).toContain("'morning', 8");
      const wrangler = join(import.meta.dirname, `../node_modules/.bin/wrangler${WINDOWS ? ".cmd" : ""}`);
      const quiet = { WRANGLER_SEND_METRICS: "false", CI: "1", NO_UPDATE_NOTIFIER: "1" };
      const migrate = run(wrangler, ["d1", "migrations", "apply", "DB", "--local"], out, quiet);
      expect(await done(migrate.child), migrate.output()).toBe(0);
      const port = await freePort();
      const base = `http://127.0.0.1:${port}`;
      const dev = run(wrangler, ["dev", "--port", String(port), "--ip", "127.0.0.1"], out, quiet);
      await until(() => answers(`${base}/surf`), 60_000).catch(() => {
        throw new Error(dev.output());
      });
      expect(await shown(`${base}/surf`)).toEqual({ places: "8 places left", key: "sk_test_" });
      await booksAndServes(base);
    },
    150_000 * SLOW,
  );
});
