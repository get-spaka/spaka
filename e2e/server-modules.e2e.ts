import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// A site's server modules in the preview (ADR 0014, the packages plan's
// slice 5), for real: Spaka's Node runs them in a process of its own, under
// its permissions (and the sandbox on macOS). A page shows what a module's
// load fetched from an API (a server of the test's own, on this machine),
// kept for as long as the module says; a form posts to an action that books a
// place in a table its migration made, the trap field and the answer fragment
// as a datasource's form has them; a route serves a calendar; and a module's
// errors and what it prints reach the agent's look at the page. A module
// changed is run again at once.
const PAGE = `<!doctype html><html lang="en"><head><title>Surf</title></head><body><main>
{% load weather city: "Biarritz" %}
<p id="weather">{% if weather %}{{ weather.city }}: {{ weather.swell }} m{% else %}No forecast{% endif %}</p>
{% load places lesson: "morning" %}
<p id="places">{{ places.left }} places left</p>
<form id="book" hx-post="/_server/book" hx-target="this" hx-swap="outerHTML" hx-status:422="target:#book-problems">
  <div id="book-problems"></div>
  <input name="name" value="Ana"><input type="hidden" name="lesson" value="morning">
  <button>Book</button>
</form>
</main></body></html>`;

const BROKEN = `<!doctype html><html lang="en"><head><title>Broken</title></head><body><main>
{% load broken %}<p id="broken">[{{ broken }}]</p>
</main></body></html>`;

describe("a site's server modules in the preview", () => {
  let launched: LaunchedApp;
  let path: string;
  let api: Server;
  let origin = "";
  let asked = 0;
  const { invoke, until, page } = previewDriver(() => launched);
  const write = (file: string, text: string) => {
    mkdirSync(join(path, file, ".."), { recursive: true });
    writeFileSync(join(path, file), text);
  };
  /** A request of the page's own, as htmx would send it. */
  const send = (url: string, body: string) =>
    page(
      `fetch(${JSON.stringify(url)}, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "hx-request": "true" }, body: ${JSON.stringify(body)} }).then(async (r) => ({ status: r.status, text: await r.text() }))`,
    );
  const look = (route: string) =>
    launched.app.evaluate(async (_electron, route) => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const seen = await (globalThis as any).spaka.preview.look(route);
      return { errors: seen.errors as string[], notes: seen.notes as string[] };
    }, route);
  const weather = (swell: string) => `
    export const cache = "10m";
    type Forecast = { city: string; swell: number };
    export async function load(args: { city: string }): Promise<Forecast> {
      const response = await fetch(${JSON.stringify("ORIGIN")} + "/forecast?city=" + encodeURIComponent(args.city));
      const forecast = (await response.json()) as Forecast;
      return { city: forecast.city, swell: forecast.swell ${swell} };
    }`;

  beforeAll(async () => {
    // The API a module calls: counting how often it is asked.
    api = createServer((req, res) => {
      asked++;
      const city = new URL(req.url ?? "/", "http://x").searchParams.get("city");
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ city, swell: 1.5 }));
    });
    await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
    origin = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

    launched = await launchApp();
    await launched.window.getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    path = (await invoke("projects:current")).path;
    await invoke("preview:set-view", "page");
    write(
      "server/migrations/0001-places.sql",
      "CREATE TABLE places (lesson TEXT PRIMARY KEY, left INTEGER NOT NULL);\n",
    );
    write("server/migrations/0002-morning.sql", "INSERT INTO places VALUES ('morning', 3);\n");
    write("server/weather.ts", weather("").replace("ORIGIN", origin));
    write(
      "server/places.ts",
      `export async function load(args: { lesson: string }, { sql }) {
        return await sql.get("SELECT left FROM places WHERE lesson = ?", args.lesson);
      }`,
    );
    write(
      "server/book.ts",
      `export const answer = "booked";
      export async function action(fields: Record<string, string>, { sql }) {
        const { changes } = await sql.run("UPDATE places SET left = left - 1 WHERE lesson = ? AND left > 0", fields.lesson);
        if (!changes) return { problems: ["This lesson is full."] };
        return { name: fields.name, lesson: fields.lesson };
      }`,
    );
    write(
      "fragments/booked.liquid",
      '<p id="booked">See you at the {{ answer.lesson }} lesson, {{ answer.name }}.</p>',
    );
    write(
      "server/calendar.ts",
      `export async function route(request: Request) {
        const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "SUMMARY:Morning lesson", "END:VEVENT", "END:VCALENDAR"].join("\\r\\n");
        return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8" } });
      }`,
    );
    write(
      "server/broken.ts",
      `import { writeFileSync } from "node:fs";
      export function load() {
        console.log("broken was asked");
        writeFileSync(new URL("../pages/written.liquid", import.meta.url), "written by a module");
      }`,
    );
    write("pages/index.liquid", PAGE);
    write("pages/broken.liquid", BROKEN);
    await invoke("preview:navigate", "/");
    await until(() => page("document.querySelector('#weather')?.textContent.includes('Biarritz')"), 30_000);
  }, 120_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
    api?.close();
  });

  test("a page shows what a module's load fetched, kept for as long as the module says", async () => {
    expect(await page("document.querySelector('#weather').textContent")).toBe("Biarritz: 1.5 m");
    expect(await page("document.querySelector('#places').textContent")).toBe("3 places left");
    const before = asked;
    await invoke("preview:navigate", "/broken");
    await invoke("preview:navigate", "/");
    await until(() => page("document.querySelector('#weather')?.textContent === 'Biarritz: 1.5 m'"));
    expect(asked).toBe(before);
  });

  test("a form books a place through its action, answered with its fragment; a robot's is dropped", async () => {
    expect(await page("document.querySelector('#book input[name=_website]') !== null")).toBe(true);
    const robot = await send("/_server/book", "name=Bot&lesson=morning&_website=spam");
    expect(robot.text).toContain("Thank you, it was sent.");
    const booked = await send("/_server/book", "name=Ana&lesson=morning");
    expect(booked.status).toBe(200);
    expect(booked.text).toMatch(/^<p [^>]*id="booked">See you at the morning lesson, Ana\.<\/p>$/);
    await send("/_server/book", "name=Ben&lesson=morning");
    await send("/_server/book", "name=Cy&lesson=morning");
    const full = await send("/_server/book", "name=Dee&lesson=morning");
    expect(full.status).toBe(422);
    expect(full.text).toContain("This lesson is full.");
    // The robot took no place: three were booked.
    await invoke("preview:navigate", "/broken");
    await invoke("preview:navigate", "/");
    await until(() => page("document.querySelector('#places')?.textContent === '0 places left'"));
  });

  test("a route answers as it likes: a calendar", async () => {
    const calendar = await page(
      `fetch("/_server/calendar/lessons.ics").then(async (r) => ({ status: r.status, type: r.headers.get("content-type"), text: await r.text() }))`,
    );
    expect(calendar).toMatchObject({ status: 200, type: "text/calendar; charset=utf-8" });
    expect(calendar.text).toContain("SUMMARY:Morning lesson");
  });

  test("a module's error and what it prints reach the agent's look; it may not write in the project", async () => {
    const seen = await look("/broken");
    expect(seen.notes).toContainEqual(
      expect.stringMatching(/^pages\/broken\.liquid: load broken: .+ \(server\/broken\.ts:4\)$/),
    );
    expect(seen.errors).toContain("server console: broken was asked");
    await invoke("preview:navigate", "/broken");
    await until(() => page("document.querySelector('#broken')?.textContent === '[]'"));
    // A migration that fails is said at every look until it is fixed.
    write("server/migrations/0003-broken.sql", "CREATE TABLE nope (;\n");
    await until(
      async () => (await look("/")).errors.some((e) => e.startsWith("server/migrations/0003-broken.sql: ")),
      20_000,
    );
    rmSync(join(path, "server/migrations/0003-broken.sql"));
  });

  test("a module changed is run again at once", async () => {
    write("server/weather.ts", weather("* 2").replace("ORIGIN", origin));
    await invoke("preview:navigate", "/");
    await until(() => page("document.querySelector('#weather')?.textContent === 'Biarritz: 3 m'"), 20_000);
  });
});
