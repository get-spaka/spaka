import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// The Node and Cloudflare exports, run (Q175, Q176, Q186): the recorded
// bakery with a guestbook is exported with each; the Node server runs with
// `node server.mjs`, the Worker with wrangler on this machine and a local D1;
// each shows its pages with the export's stylesheet, keeps what a visitor
// sends, refuses a wrong token and answers the app's management API, which
// the website's settings check.
const GUESTBOOK =
  "label: Guestbook\ncollected: true\nanswer: guestbook-thanks\nfields:\n  - name: name\n    kind: text\n    required: true\n  - name: message\n    kind: markdown\n";
const PAGE = `<!doctype html><html lang="en"><head><title>Guestbook</title></head><body>
<ul>{% for entry in data.guestbook %}<li class="entry">{{ entry.name }}: {{ entry.message }}</li>{% endfor %}</ul>
<form hx-post="/_data/guestbook" hx-status:422="target:#problems swap:innerHTML"><input name="name"><textarea name="message"></textarea><button class="btn">Sign</button></form><div id="problems"></div>
</body></html>`;

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as { port: number }).port;
      probe.close(() => resolve(port));
    });
  });

const sign = (base: string, body: string) =>
  fetch(`${base}/_data/guestbook`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

describe("the Node and Cloudflare exports, run", () => {
  let launched: LaunchedApp;
  let token = "";
  const children: ChildProcess[] = [];
  const { invoke, until } = previewDriver(() => launched);
  const answers = async (url: string) => (await fetch(url).catch(() => undefined))?.ok;
  const run = (command: string, args: string[], cwd: string, env: Record<string, string> = {}) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));
    children.push(child);
    return { child, output: () => output };
  };
  const done = (child: ChildProcess) => new Promise<number | null>((resolve) => child.on("exit", resolve));

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("conversation").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    const path = (await invoke("projects:current")).path as string;
    mkdirSync(join(path, "data/guestbook"), { recursive: true });
    mkdirSync(join(path, "fragments"), { recursive: true });
    writeFileSync(join(path, "data/guestbook/_datasource.yaml"), GUESTBOOK);
    writeFileSync(join(path, "pages/guestbook.liquid"), PAGE);
    writeFileSync(
      join(path, "fragments/guestbook-thanks.liquid"),
      '<p class="alert alert-success">Thanks, {{ record.name }}!</p>',
    );
    token = (await invoke("site:token")) as string;
  }, 90_000);
  afterAll(async () => {
    for (const child of children) child.kill("SIGTERM");
    await launched?.close();
  });

  test("a static export is refused: a page shows what visitors send", async () => {
    // Never published: Publish has no way chosen in advance (Q181).
    const w = launched.window;
    await w.getByTestId("export-open").click();
    await until(async () => (await w.getByTestId("publish-choice").count()) === 3);
    expect(
      await w.getByTestId("publish-choice").evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed"))),
    ).toEqual(["false", "false", "false"]);
    await w.getByTestId("export-close").click();
    await expect(invoke("export:run", join(runsDir, "static-guestbook"), "static")).rejects.toThrow(
      /cannot show what visitors send \(guestbook\)/,
    );
  });

  test("the Node export runs with node server.mjs and keeps what visitors send in SQLite", async () => {
    const out = join(runsDir, "export-node");
    rmSync(out, { recursive: true, force: true });
    const result = await invoke("export:run", out, "node");
    expect(result.builder).toBe("node");
    expect(result.guide.map((s: { id: string }) => s.id)).toEqual(["try", "docker", "server", "address"]);
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const server = run(process.execPath, ["server.mjs"], out, {
      PORT: String(port),
      HOST: "127.0.0.1",
    });
    // The token is not given: the server reads the .env the export wrote (Q191).
    expect(readFileSync(join(out, ".env"), "utf8")).toContain(`UPSTART_TOKEN=${token}`);
    await until(() => answers(`${base}/guestbook`), 15_000).catch(() => {
      throw new Error(server.output());
    });

    const page = await (await fetch(`${base}/guestbook`)).text();
    expect(page).toContain('<link rel="stylesheet" href="/assets/site.css">');
    expect(await (await fetch(`${base}/assets/site.css`)).text()).toContain(".btn");
    expect((await sign(base, "message=No+name")).status).toBe(422);
    expect(await (await sign(base, "name=Margot&message=Lovely+*bread*")).text()).toContain("Thanks, Margot!");
    expect(await (await fetch(`${base}/guestbook`)).text()).toContain(
      '<li class="entry">Margot: <p>Lovely *bread*</p>',
    );
    expect(readFileSync(join(out, "data/data.sqlite")).length).toBeGreaterThan(0);

    // The website's settings check the published site with the website's token.
    await invoke("projects:set-site-url", base);
    expect(await invoke("site:check")).toMatchObject({ ok: true });
    const records = await invoke("content:published", "guestbook");
    expect(records.records.map((r: { fields: { name: string } }) => r.fields.name)).toEqual(["Margot"]);

    // A new export into the same folder keeps the records.
    await invoke("export:run", out, "node");
    expect(readFileSync(join(out, "data/data.sqlite")).length).toBeGreaterThan(0);
  }, 60_000);

  test("Publish: the static way refused, saying why; the last way, Node, chosen again, with its guide", async () => {
    const w = launched.window;
    await w.getByTestId("export-open").click();
    await until(async () => (await w.getByTestId("publish-choice").count()) === 3);
    const staticChoice = w.locator('[data-testid="publish-choice"][data-id="static"]');
    expect(await staticChoice.isDisabled()).toBe(true);
    expect(await staticChoice.getByTestId("publish-refused").textContent()).toContain("(guestbook)");
    await until(
      async () =>
        (await w.locator('[data-testid="publish-choice"][data-id="node"]').getAttribute("aria-pressed")) === "true",
    );
    // The token is written into the export, not shown (Q191).
    expect(await w.getByTestId("publish-token").count()).toBe(0);
    await w.getByTestId("export-again").click();
    await w.getByTestId("publish-guide").waitFor();
    expect(await w.getByTestId("guide-step").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")))).toEqual([
      "try",
      "docker",
      "server",
      "address",
    ]);
    expect(await w.locator('[data-testid="guide-step"][data-id="try"] code').textContent()).toBe("node server.mjs");
    await launched.capture("publish-node");
    await w.getByTestId("export-close").click();
  });

  test("the Cloudflare export runs with wrangler on this machine, the records in a local D1", async () => {
    const out = join(runsDir, "export-cloudflare");
    rmSync(out, { recursive: true, force: true });
    const result = await invoke("export:run", out, "cloudflare");
    expect(result.guide.map((s: { id: string }) => s.id)).toEqual(["install", "login", "deploy", "migrate", "address"]);
    const wrangler = join(import.meta.dirname, "../node_modules/.bin/wrangler");
    const quiet = { WRANGLER_SEND_METRICS: "false", CI: "1", NO_UPDATE_NOTIFIER: "1" };
    const migrate = run(wrangler, ["d1", "migrations", "apply", "DB", "--local"], out, quiet);
    expect(await done(migrate.child), migrate.output()).toBe(0);

    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const dev = run(wrangler, ["dev", "--port", String(port), "--ip", "127.0.0.1"], out, quiet);
    await until(() => answers(`${base}/guestbook`), 60_000).catch(() => {
      throw new Error(dev.output());
    });
    const page = await (await fetch(`${base}/guestbook`)).text();
    expect(page).toContain('<link rel="stylesheet" href="/assets/site.css">');
    expect(await (await fetch(`${base}/assets/site.css`)).text()).toContain(".btn");
    expect(await (await sign(base, "name=Anne&message=Hello")).text()).toContain("Thanks, Anne!");
    expect(await (await fetch(`${base}/guestbook`)).text()).toContain('<li class="entry">Anne: <p>Hello</p>');

    const local = /^UPSTART_TOKEN=(\w+)$/m.exec(readFileSync(join(out, ".dev.vars"), "utf8"))?.[1];
    const records = (auth: string) =>
      fetch(`${base}/_upstart/records/guestbook`, { headers: { authorization: `Bearer ${auth}` } });
    expect((await records("wrong")).status).toBe(401);
    const { records: kept } = await (await records(local!)).json();
    expect(kept.map((r: { fields: { name: string } }) => r.fields.name)).toEqual(["Anne"]);
  }, 120_000);

  test("a static site's form sends to the form service given in Publish (Q178)", async () => {
    const path = (await invoke("projects:current")).path as string;
    rmSync(join(path, "pages/guestbook.liquid"));
    mkdirSync(join(path, "data/contact"), { recursive: true });
    writeFileSync(
      join(path, "data/contact/_datasource.yaml"),
      "label: Contact\ncollected: true\nfields:\n  - name: email\n    kind: email\n",
    );
    writeFileSync(
      join(path, "pages/contact.liquid"),
      '<!doctype html><html lang="en"><head><title>Contact</title></head><body><form hx-post="/_data/contact"><input name="email"><button>Send</button></form></body></html>',
    );
    const info = await invoke("export:choices");
    expect(info.forms).toEqual(["contact"]);
    expect(info.choices.find((c: { id: string }) => c.id === "static").refused).toBeUndefined();

    const w = launched.window;
    await w.getByTestId("export-open").click();
    await until(async () => (await w.getByTestId("publish-choice").count()) === 3);
    await w.locator('[data-testid="publish-choice"][data-id="static"]').click();
    const service = w.locator('[data-testid="form-service"][data-name="contact"]');
    await service.locator("input").fill("https://formspree.io/f/abc");
    await service.getByTestId("form-service-save").click();
    await until(async () => (await invoke("projects:current")).formServices?.contact === "https://formspree.io/f/abc");
    expect(JSON.parse(readFileSync(join(path, ".upstart/project.json"), "utf8")).formServices).toEqual({
      contact: "https://formspree.io/f/abc",
    });
    await launched.capture("publish-static-forms");
    await w.getByTestId("export-close").click();

    const out = join(runsDir, "export-static-forms");
    rmSync(out, { recursive: true, force: true });
    await invoke("export:run", out, "static");
    expect(readFileSync(join(out, "contact/index.html"), "utf8")).toContain(
      '<form action="https://formspree.io/f/abc" method="post">',
    );
  });
});
