import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ServerProcess, type ServerSaid } from "./server-process";

const here = dirname(fileURLToPath(import.meta.url));
// Spaka's Node: Electron run as Node, as the app runs it.
const electron = createRequire(import.meta.url)("electron") as string;
let hostFile = "";
let scratch = "";
const processes: ServerProcess[] = [];

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), "spaka-server-"));
  hostFile = join(scratch, "hosts", "modules.mjs");
  await build({
    input: join(here, "../../../../../packages/runtime/src/hosts/modules-main.ts"),
    platform: "node",
    logLevel: "silent",
    output: { file: hostFile, format: "esm" },
  });
}, 60_000);

afterAll(() => {
  for (const p of processes) p.stop();
  rmSync(scratch, { recursive: true, force: true });
});

/** A site with these files, and its server process run by this Node. */
function site(files: Record<string, string>, options: { secrets?: Record<string, string>; timeoutMs?: number } = {}) {
  const root = mkdtempSync(join(scratch, "site-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const said: ServerSaid[] = [];
  const added: unknown[] = [];
  const server = new ServerProcess({
    root,
    filesDir: join(root, "..", `${root.split("/").pop()}-files`),
    dbFile: join(root, "..", `${root.split("/").pop()}-db`, "data.sqlite"),
    hostFile,
    executable: electron,
    readable: [electron.replace(/\/Contents\/MacOS\/[^/]+$/, "")],
    data: () => ({
      list: async (name) => [{ title: `a record of ${name}` }],
      add: async (name, fields) => {
        added.push({ name, fields });
        return { id: "2027-01-12-0931-abcd" };
      },
    }),
    ...(options.secrets ? { secrets: () => options.secrets! } : {}),
    onSaid: (s) => said.push(s),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
  processes.push(server);
  return { root, server, said, added };
}

const form = (body: string) =>
  new Request("http://site/_server/book", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "hx-request": "true" },
    body,
  });

describe("the preview's server process (ADR 0014)", () => {
  test("runs a TypeScript module's load, action and route, with a site that has none starting nothing", async () => {
    const none = site({ "pages/index.liquid": "<main></main>" });
    expect(none.server.modules()).toEqual({});
    expect(await none.server.kinds("weather")).toBeUndefined();
    await expect(none.server.load("weather", {})).rejects.toThrow("there is no server module named weather");

    const { server } = site({
      "server/weather.ts": `
        enum Sky { Clear = "clear", Rain = "rain" }
        class Reading { constructor(public city: string, public sky: Sky) {} }
        export const cache = "10m";
        let calls = 0;
        export function load(args: { city: string }) {
          calls++;
          return { ...new Reading(args.city, Sky.Clear), calls, at: new Date("2027-01-12T00:00:00Z") };
        }`,
      "server/book.ts": `
        export const answer = "booked";
        export async function action(fields: Record<string, string>, { data }) {
          if (!fields.name) return { problems: ["Your name is needed."] };
          return { name: fields.name, lessons: await data.list("lessons") };
        }
        export async function route(request: Request) {
          return Response.json({ method: request.method, body: await request.text() }, { status: 201 });
        }`,
    });
    expect(await server.kinds("weather")).toEqual(["load"]);
    expect(await server.kinds("book")).toEqual(["action", "route"]);
    expect(await server.load("weather", { city: "Lyon" })).toEqual({
      city: "Lyon",
      sky: "clear",
      calls: 1,
      at: "2027-01-12T00:00:00.000Z",
    });
    // Kept for ten minutes, by arguments (Q519).
    expect(await server.load("weather", { city: "Lyon" })).toMatchObject({ calls: 1 });
    expect(await server.load("weather", { city: "Nantes" })).toMatchObject({ calls: 2 });
    expect(await server.action("book", { name: "" }, form("name="))).toEqual({
      problems: ["Your name is needed."],
    });
    expect(await server.action("book", { name: "Ana" }, form("name=Ana"))).toEqual({
      value: { name: "Ana", lessons: [{ title: "a record of lessons" }] },
      answer: "booked",
    });
    const routed = await server.route(
      "book",
      new Request("http://site/_server/book/paid", { method: "POST", body: "{}" }),
    );
    expect(routed.status).toBe(201);
    expect(await routed.json()).toEqual({ method: "POST", body: "{}" });
  }, 30_000);

  test("applies the migrations once, in order, for the modules' SQL on the site's database", async () => {
    const files = {
      "server/migrations/0001-places.sql": "CREATE TABLE places (lesson TEXT PRIMARY KEY, left INTEGER NOT NULL);",
      "server/migrations/0002-surf.sql": "INSERT INTO places VALUES ('surf', 3);",
      "server/places.js": `
        export async function load(args, { sql }) {
          return await sql.get("SELECT left FROM places WHERE lesson = ?", args.lesson);
        }
        export async function action(fields, { sql }) {
          const { changes } = await sql.run("UPDATE places SET left = left - 1 WHERE lesson = ? AND left > 0", fields.lesson);
          const records = await sql.all("SELECT COUNT(*) AS n FROM records");
          return { changes, records: records[0].n, migrations: (await sql.all("SELECT name FROM spaka_migrations")).map((r) => r.name) };
        }`,
    };
    const { server, root, said } = site(files);
    expect(await server.load("places", { lesson: "surf" })).toEqual({ left: 3 });
    expect(await server.action("places", { lesson: "surf" }, form("lesson=surf"))).toEqual({
      value: { changes: 1, records: 0, migrations: ["0001-places.sql", "0002-surf.sql"] },
    });
    // Started again, nothing is applied twice; a migration that fails is said, and the next is not applied.
    writeFileSync(join(root, "server/migrations/0003-broken.sql"), "CREATE TABLE nope (;");
    writeFileSync(join(root, "server/migrations/0004-after.sql"), "INSERT INTO places VALUES ('kite', 1);");
    server.restart();
    expect(await server.load("places", { lesson: "surf" })).toEqual({ left: 2 });
    expect(await server.load("places", { lesson: "kite" })).toBeUndefined();
    expect(said).toContainEqual(
      expect.objectContaining({
        kind: "error",
        source: "server/migrations/0003-broken.sql",
        message: expect.stringMatching(/^this migration failed and was not applied: /),
      }),
    );
  }, 30_000);

  test("reads the project and writes its own folder only, with the site's secrets for its whole environment", async () => {
    const secret = join(homedir(), `.spaka-server-test-${process.pid}`);
    writeFileSync(secret, "the maker's file");
    try {
      const { server, root } = site(
        {
          "server/probe.js": `
            import { readFileSync, writeFileSync } from "node:fs";
            import { join } from "node:path";
            const attempt = async (f) => { try { await f(); return "allowed"; } catch (e) { return e.code ?? e.message; } };
            export async function load(args, { files, env }) {
              return {
                project: await attempt(() => readFileSync(join(args.root, "pages/index.liquid"), "utf8")),
                home: await attempt(() => readFileSync(args.secret, "utf8")),
                writeProject: await attempt(() => writeFileSync(join(args.root, "pages/x.liquid"), "x")),
                writeFiles: await attempt(() => writeFileSync(join(files, "kept.txt"), "kept")),
                child: await attempt(async () => (await import("node:child_process")).execSync("echo hi")),
                env,
                processEnv: Object.keys(process.env).filter((k) => !k.startsWith("__CF")).sort(),
              };
            }`,
          "pages/index.liquid": "<main></main>",
        },
        { secrets: { PAYMENT_KEY: "sk_test_1" } },
      );
      // The project by its real path, as the process sees it (/var is /private/var on macOS).
      const seen = (await server.load("probe", { root: realpathSync(root), secret })) as Record<string, unknown>;
      expect(seen).toMatchObject({
        project: "allowed",
        home: "ERR_ACCESS_DENIED",
        writeProject: "ERR_ACCESS_DENIED",
        writeFiles: "allowed",
        child: "ERR_ACCESS_DENIED",
        env: { PAYMENT_KEY: "sk_test_1" },
        processEnv: ["ELECTRON_RUN_AS_NODE", "PAYMENT_KEY", "SPAKA_SECRET_NAMES"],
      });
      expect(readFileSync(join(root, "..", `${root.split("/").pop()}-files`, "kept.txt"), "utf8")).toBe("kept");
    } finally {
      rmSync(secret, { force: true });
    }
  }, 30_000);

  test("says where a module failed, what it printed, and starts again after one that hangs or a crash", async () => {
    const { server, said } = site(
      {
        "server/broken.ts": `
          export function load() {
            console.log("asked for", { city: "Lyon" });
            console.error("about to fail");
            throw new Error("the service did not answer");
          }`,
        "server/stuck.js": "export function load() { for (;;) {} }",
        "server/fine.js": "let n = 0; export function load() { return ++n; }",
        "server/later.js": "export function load() { setTimeout(() => { throw new Error('late'); }); return 1; }",
      },
      { timeoutMs: 2000 },
    );
    await expect(server.load("broken", {})).rejects.toThrow(/^the service did not answer \(server\/broken\.ts:5\)$/);
    expect(said).toContainEqual(expect.objectContaining({ kind: "console", message: "asked for { city: 'Lyon' }" }));
    expect(said).toContainEqual(expect.objectContaining({ kind: "error", message: "about to fail" }));
    expect(await server.load("fine", {})).toBe(1);
    await expect(server.load("stuck", {})).rejects.toThrow("server/stuck did not answer within 2 s, and was stopped");
    // A new process: the module's count starts again.
    expect(await server.load("fine", {})).toBe(1);
    expect(await server.load("later", {})).toBe(1);
    await expect
      .poll(() => said.some((s) => s.kind === "error" && /^late \(server\/later\.js:1\)$/.test(s.message)))
      .toBe(true);
    expect(await server.load("fine", {})).toBe(2);
  }, 30_000);

  test("stops by itself when Spaka is gone without stopping it, and keeps no processor busy", async () => {
    const root = mkdtempSync(join(scratch, "orphan-"));
    // A module that keeps the process alive and prints: once Spaka is gone, each print found the channel closed.
    mkdirSync(join(root, "server"));
    writeFileSync(
      join(root, "server/tick.js"),
      "setInterval(() => console.log('tick'), 5); export function load() { return 1; }",
    );
    const child = spawn(electron, [hostFile, root, join(root, "files"), join(root, "db", "data.sqlite")], {
      env: { ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    await new Promise<void>((resolve) => child.once("message", () => resolve()));
    child.send({ id: 1, op: "load", name: "tick", args: {} });
    await new Promise<void>((resolve) =>
      child.on("message", (m: { type: string; id?: number }) => m.id === 1 && resolve()),
    );
    const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
    // Spaka's end of the channel closed, as when it quits or is killed.
    child.disconnect();
    const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r("still running"), 5000))]);
    if (code === "still running") child.kill();
    expect(code).toBe(0);
  }, 30_000);
});
