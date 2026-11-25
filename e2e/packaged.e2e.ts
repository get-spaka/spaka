import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer } from "node:net";
import { extname, join, normalize } from "node:path";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";
import { PALETTES } from "../apps/desktop/src/shared/palettes.ts";
import { agentConfigDir, type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";
import { buildBlog } from "./blog-check.ts";
import { buildGuestbook, sampleValues } from "./guestbook-check.ts";
import { previewDriver } from "./preview-driver.ts";

const built = existsSync(
  join(
    import.meta.dirname,
    process.platform === "win32"
      ? "../apps/desktop/dist/win-unpacked/Spaka.exe"
      : "../apps/desktop/dist/mac-arm64/Spaka.app",
  ),
);
const real = process.env.SPAKA_REAL_AGENT === "1";
const configDir = agentConfigDir();

const invokeIn =
  (launched: LaunchedApp) =>
  // biome-ignore lint/suspicious/noExplicitAny: what the main process answers, as the checks read it
  (channel: string, ...args: unknown[]): Promise<any> =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).spaka.invoke(channel, ...args),
      [channel, args] as const,
    );
const until = async (read: () => Promise<unknown>, timeout: number) => {
  timeout *= SLOW;
  const started = Date.now();
  for (;;) {
    const value = await read().catch(() => undefined);
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
    await new Promise((r) => setTimeout(r, 200));
  }
};
const done = (launched: LaunchedApp, n: number, timeout: number) =>
  until(
    async () => (await launched.window.locator('[data-testid="agent-message"][data-status="done"]').count()) >= n,
    timeout,
  );

/** Serves a folder as a static host would. */
async function serve(folder: string) {
  const server = createHttpServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    let file = join(folder, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!file.startsWith(folder) || !existsSync(file)) return void res.writeHead(404).end();
    const types: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

/** Loads a page in a view of its own, offscreen, and returns its text and whether its stylesheet applied. */
async function load(launched: LaunchedApp, url: string) {
  return launched.app.evaluate(async (electron, url) => {
    const win = (globalThis as { spaka?: { win: Electron.BrowserWindow } }).spaka!.win;
    const view = new electron.WebContentsView({ webPreferences: { partition: "packaged-check" } });
    win.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 1000, height: 800 });
    await view.webContents.loadURL(url);
    const result = await view.webContents.executeJavaScript(`({
      text: document.body.innerText,
      styled: [...document.styleSheets].some((s) => s.href && s.href.endsWith("/assets/site.css") && s.cssRules.length > 0),
      font: getComputedStyle(document.querySelector("h1") ?? document.body).fontSize,
    })`);
    win.contentView.removeChildView(view);
    view.webContents.close();
    return result as { text: string; styled: boolean; font: string };
  }, url);
}

// Run after `pnpm --filter @spaka/desktop package`.
describe.runIf(built && (process.platform === "darwin" || process.platform === "win32"))("the packaged app", () => {
  test(
    "starts in the background, with Spaka's skills, and exports a website",
    async () => {
      const launched = await launchApp({ packaged: true });
      try {
        const invoke = invokeIn(launched);
        await launched.window.getByTestId("message-input").waitFor();
        expect(await launched.app.evaluate(({ app }) => app.isPackaged)).toBe(true);
        // Spaka's templates, from the release's catalogue shipped with the app (Q247), their covers with it.
        const templates = await invoke("templates:list");
        expect(templates.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining(["reel", "ember", "beacon"]));
        expect(await invoke("templates:picture", "reel", "cover")).toMatch(/^data:image\/webp;base64,/);
        await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
        await done(launched, 1, 30_000);
        // The skills shipped outside the archive, assembled for the agent.
        expect((await invoke("skills:list")).map((s: { name: string }) => s.name)).toEqual([
          "datasources",
          "gallery",
          "htmx-patterns",
          "site-scripts",
          "spaka-help",
          "web-design",
          "writing-skills",
        ]);
        // The builder finds Tailwind, daisyUI and htmx inside the archive.
        const out = join(runsDir, "packaged-export");
        rmSync(out, { recursive: true, force: true });
        const result = await invoke("export:run", out, "static");
        expect(result.pages.sort()).toEqual(["/", "/menu"]);
        const site = await serve(out);
        try {
          const page = await load(launched, `${site.origin}/`);
          expect(page.text).toContain("Chez Margot");
          expect(page.styled).toBe(true);
          // text-5xl applied: not the browser's default size for a heading.
          expect(page.font).toBe("48px");
        } finally {
          site.close();
        }
      } finally {
        await launched.close();
      }
    },
    90_000 * SLOW,
  );

  // The whole of build step 1 with the real agent, in the packaged app:
  // a first message makes the website, a change, undo, export, served.
  test.runIf(real)(
    "with the real agent: build, change, undo, export and serve",
    async () => {
      const dataDir = join(import.meta.dirname, "../.cache/packaged-check-data");
      rmSync(dataDir, { recursive: true, force: true });
      const launched = await launchApp({
        packaged: true,
        env: {
          SPAKA_AGENT_REPLAY: "",
          SPAKA_AGENT_CONFIG_DIR: configDir,
          SPAKA_AGENT_RECORD: join(runsDir, "packaged-real.jsonl"),
          SPAKA_DATA_DIR: dataDir,
        },
      });
      try {
        const invoke = invokeIn(launched);
        await launched.window.getByTestId("message-input").waitFor();
        await until(async () => (await invoke("agent:status")).auth === "signed-in", 30_000);
        const started = Date.now();
        await invoke(
          "conversation:send",
          "A website for Atelier Brume, a small ceramics studio in Nantes that sells mugs and runs pottery classes. Just the home page.",
        );
        // The preview shows something within seconds.
        await until(
          () =>
            launched.app.evaluate(() =>
              (
                globalThis as { spaka?: { preview: { view: Electron.WebContentsView } } }
              ).spaka!.preview.view.getVisible(),
            ),
          20_000,
        );
        process.stdout.write(`[packaged] preview visible after ${Date.now() - started} ms\n`);
        await done(launched, 1, 240_000);
        process.stdout.write(`[packaged] first turn ${Date.now() - started} ms\n`);
        await launched.capture("packaged-real-first-turn");
        const project = await invoke("projects:current");
        const home = () => readFileSync(join(project.path, "pages/index.liquid"), "utf8");
        const before = home();
        expect(before).toMatch(/Brume/);

        await invoke("conversation:send", "Change the main heading to: Handmade in Nantes");
        await done(launched, 2, 180_000);
        expect(home()).toContain("Handmade in Nantes");

        await invoke("history:undo");
        await until(async () => home() === before, 10_000);

        const out = join(runsDir, "packaged-real-export");
        rmSync(out, { recursive: true, force: true });
        const result = await invoke("export:run", out, "static");
        process.stdout.write(`[packaged] exported ${result.pages.join(", ")}; warnings: ${result.warnings.length}\n`);
        const site = await serve(out);
        try {
          const page = await load(launched, `${site.origin}/`);
          expect(page.text).toMatch(/Brume/);
          expect(page.text).not.toContain("Handmade in Nantes");
          expect(page.styled).toBe(true);
          expect(page.font).not.toBe("32px");
          process.stdout.write(`[packaged] served page: h1 ${page.font}, ${page.text.length} characters\n`);
        } finally {
          site.close();
        }
        const problems = await launched.app.evaluate(() =>
          [
            ...(
              globalThis as { spaka?: { agent: { sessions: Map<string, { problems: string[] }> } } }
            ).spaka!.agent.sessions.values(),
          ].flatMap((s) => s.problems),
        );
        expect(problems).toEqual([]);
      } finally {
        await launched.close();
      }
    },
    600_000,
  );

  // The whole of build step 2 with the real agent, in the packaged app: build,
  // drop a block, edit a text in place, change the palette and undo it,
  // comment two elements and send, export and serve.
  test.runIf(real)(
    "with the real agent: build, block, text, palette, undo, comments, export and serve",
    async () => {
      const dataDir = join(import.meta.dirname, "../.cache/packaged-step2-data");
      rmSync(dataDir, { recursive: true, force: true });
      const launched = await launchApp({
        packaged: true,
        env: {
          SPAKA_AGENT_REPLAY: "",
          SPAKA_AGENT_CONFIG_DIR: configDir,
          SPAKA_AGENT_RECORD: join(runsDir, "packaged-step2.jsonl"),
          SPAKA_DATA_DIR: dataDir,
        },
      });
      const { page, click, typeText, key, drawn, picture } = previewDriver(() => launched);
      const log = (line: string) => process.stdout.write(`[step2] ${line}\n`);
      try {
        const invoke = invokeIn(launched);
        await launched.window.getByTestId("message-input").waitFor();
        await until(async () => (await invoke("agent:status")).auth === "signed-in", 30_000);
        const started = Date.now();
        await invoke(
          "conversation:send",
          "A website for Atelier Brume, a small ceramics studio in Nantes that sells mugs and runs pottery classes. Just the home page.",
        );
        await done(launched, 1, 300_000);
        log(`first turn ${Date.now() - started} ms`);
        const project = await invoke("projects:current");
        const liquid = () =>
          ["pages", "parts"].flatMap((dir) =>
            existsSync(join(project.path, dir))
              ? readdirSync(join(project.path, dir)).map((f) => readFileSync(join(project.path, dir, f), "utf8"))
              : [],
          );
        const theme = () => readFileSync(join(project.path, "theme.css"), "utf8");
        // Written in the language of the message, not the city's (Q88).
        expect(liquid().join("\n")).toMatch(/<html[^>]*lang="en/);
        await invoke("preview:navigate", "/");
        await until(() => page("!!document.querySelector('spaka-editor') && location.pathname === '/'"), 20_000);

        // A block, added where its kind goes.
        const parts = readdirSync(join(project.path, "parts")).length;
        expect((await invoke("gallery:add", "cta-split-image")).label).toBeTruthy();
        await until(async () => readdirSync(join(project.path, "parts")).length === parts + 1, 10_000);
        await until(() => page("document.body.innerHTML.length > 0"), 5_000);
        log(`block added: ${parts} parts, then ${parts + 1}`);

        // A text edited in place.
        await click("h1", false, 2);
        await until(() => page("document.querySelector('h1').isContentEditable"), 5_000);
        await key("End");
        await typeText(" & co");
        await key("Enter");
        await until(async () => liquid().some((t) => t.includes(" &amp; co<") || t.includes(" & co<")), 10_000);
        expect((await invoke("history:list")).at(-1)).toMatchObject({ kind: "hand", label: "Text changed" });

        // The palette changed, then undone.
        const before = theme();
        const forest = PALETTES.find((p) => p.id === "forest")!.colors;
        await invoke("theme:apply", { ...forest });
        await until(async () => theme().includes(forest["--theme-color-primary"]), 5_000);
        await invoke("history:undo");
        await until(async () => theme() === before, 10_000);
        expect(liquid().some((t) => t.includes(" &amp; co<") || t.includes(" & co<"))).toBe(true);
        log("palette changed and undone; the text edit stays");

        // Two comments, sent as one message.
        await launched.window.getByTestId("mode-comment").click();
        for (const [selector, text] of [
          ["h1", "Make this heading warmer"],
          ["section p", "Mention that classes are on Saturdays"],
        ] as const) {
          await click(selector);
          await until(() => drawn('[data-testid="comment-card"]'), 5_000);
          await typeText(text);
          await click('.card [data-act="save"]', true);
          await until(async () => !(await drawn('[data-testid="comment-card"]')), 5_000);
        }
        expect(await invoke("comments:list")).toHaveLength(2);
        await picture("packaged-step2-comments");
        await click('[data-act="send"]', true);
        await until(async () => (await invoke("comments:list")).length === 0, 5_000);
        await done(launched, 2, 240_000);
        await launched.window.getByTestId("mode-edit").click();
        const sent = await launched.window.getByTestId("maker-message").last().textContent();
        expect(sent).toContain("Mention that classes are on Saturdays");
        expect(liquid().join("\n")).toMatch(/Saturday/i);
        log(`comments answered ${Date.now() - started} ms after the start`);
        await launched.capture("packaged-step2-after-comments");

        const out = join(runsDir, "packaged-step2-export");
        rmSync(out, { recursive: true, force: true });
        const result = await invoke("export:run", out, "static");
        log(`exported ${result.pages.join(", ")}; warnings: ${result.warnings.length}`);
        const site = await serve(out);
        try {
          const served = await load(launched, `${site.origin}/`);
          expect(served.text).toMatch(/Brume/);
          expect(served.text).toMatch(/Saturday/i);
          expect(served.styled).toBe(true);
        } finally {
          site.close();
        }
        const problems = await launched.app.evaluate(() =>
          [
            ...(
              globalThis as { spaka?: { agent: { sessions: Map<string, { problems: string[] }> } } }
            ).spaka!.agent.sessions.values(),
          ].flatMap((s) => s.problems),
        );
        expect(problems).toEqual([]);
      } finally {
        await launched.close();
      }
    },
    900_000,
  );

  // The whole of build step 3 with the real agent, in the packaged app: the
  // blog (blog-check.ts), a record changed in the Content tab, a record's
  // text edited in the preview and an image replaced through the picker when
  // the agent's templates allow it, then exported with its record pages,
  // credits and WebP copies, served.
  test.runIf(real)(
    "with the real agent: blog, Content tab, editing in place, Replace…, export and serve",
    async () => {
      const dataDir = join(import.meta.dirname, "../.cache/packaged-step3-data");
      rmSync(dataDir, { recursive: true, force: true });
      const record = join(runsDir, "packaged-step3.jsonl");
      rmSync(record, { force: true });
      const launched = await launchApp({
        packaged: true,
        env: {
          SPAKA_AGENT_REPLAY: "",
          SPAKA_AGENT_CONFIG_DIR: configDir,
          SPAKA_AGENT_RECORD: record,
          SPAKA_DATA_DIR: dataDir,
        },
      });
      const { page, click, typeText, key } = previewDriver(() => launched);
      const log = (line: string) => process.stdout.write(`[step3] ${line}\n`);
      const w = launched.window;
      try {
        const invoke = invokeIn(launched);
        await w.getByTestId("message-input").waitFor();
        await until(async () => (await invoke("agent:status")).auth === "signed-in", 30_000);
        const report = await buildBlog(launched, record);
        writeFileSync(join(runsDir, "packaged-step3.json"), JSON.stringify(report, null, 2));
        log(`blog: ${JSON.stringify(report)}`);
        const { path } = await invoke("projects:current");
        const ds = report.datasource!;
        const last = async () => (await invoke("history:list")).at(-1)?.label as string;

        // A record's first text field changed in the Content tab: one version on leaving.
        const definition = readFileSync(join(path, "data", ds, "_datasource.yaml"), "utf8");
        const field = /-\s*name:\s*(\w+)\s*\n\s*kind:\s*text\b/.exec(definition)?.[1] ?? "title";
        const id = report.records[0]!.replace(/\.md$/, "");
        await w.getByTestId("tab-content").click();
        await w.locator(`[data-testid="datasource"][data-name="${ds}"]`).click();
        await w.locator(`[data-testid="record"][data-id="${id}"] button`).first().click();
        const input = w.getByTestId(`field-${field}`);
        await input.fill("Edited by hand");
        await until(
          async () => readFileSync(join(path, "data", ds, `${id}.md`), "utf8").includes("Edited by hand"),
          5_000,
        );
        await w.getByTestId("content-back").click();
        await until(async () => (await last()) === "Edited Edited by hand", 5_000);
        log("a record's field changed in the Content tab");
        await w
          .getByTestId("tab-conversation")
          .click()
          .catch(() => undefined);

        // In the preview, on a record's page: its text edited in place when a lone field shows it.
        const editor = (file: string, at: number) =>
          launched.app.evaluate(
            // biome-ignore lint/suspicious/noExplicitAny: the main process's objects, set for checks
            (_electron, [file, at]) => (globalThis as any).spaka.editor.info(file, at),
            [file, at] as const,
          );
        const traced = async (selector: string) =>
          (await page(
            `[...document.querySelectorAll(${JSON.stringify(selector)})].map((e, i) => { e.setAttribute("data-check", String(i)); return e.getAttribute("data-spaka-src"); })`,
          )) as string[];
        const route = report.recordRoutes[1] ?? report.recordRoutes[0]!;
        await invoke("preview:navigate", route);
        await until(
          () => page(`location.pathname === ${JSON.stringify(route)} && !!document.querySelector("[data-spaka-src]")`),
          10_000,
        );
        let editedInPlace = false;
        const texts = await traced("h1, h2, h3");
        for (const [i, src] of texts.entries()) {
          const [file, , at] = src.split(":");
          const info = await editor(file!, Number(at));
          if (!info.field) continue;
          await click(`[data-check="${i}"]`, false, 2);
          await until(() => page(`document.querySelector('[data-check="${i}"]').isContentEditable`), 5_000);
          await key("End");
          await typeText(" today");
          await key("Enter");
          await until(async () => (await last())?.startsWith("Edited "), 10_000);
          editedInPlace = true;
          break;
        }
        log(
          editedInPlace
            ? "a record's text edited in place"
            : "no heading shows a lone record field: not edited in place",
        );

        // Replace… on an image of the page, through the picker.
        let replaced = false;
        const images = await traced("img");
        for (const [i, src] of images.entries()) {
          const [file, , at] = src.split(":");
          const info = await editor(file!, Number(at));
          if (!info.image) continue;
          const current = await page(`document.querySelector('[data-check="${i}"]').getAttribute("src")`);
          const other = report.media.find((m) => `/${m.path}` !== current);
          if (!other) break;
          await click(`[data-check="${i}"]`);
          await until(
            () =>
              page(
                `!!document.querySelector('spaka-editor').shadowRoot.querySelector('[data-testid="editor-replace"]')`,
              ),
            5_000,
          );
          await click('[data-testid="editor-replace"]', true);
          await w.getByTestId("media-picker").waitFor();
          await w.locator(`[data-testid="picker-item"][data-path="${other.path}"]`).click();
          await w.getByTestId("media-picker").waitFor({ state: "detached" });
          await until(async () => (await last()) === "Image replaced", 10_000);
          replaced = true;
          break;
        }
        log(replaced ? "an image replaced through the picker" : "no replaceable image on the record's page");

        // Exported with sharp inside the packaged app, served.
        const out = join(runsDir, "packaged-step3-export");
        rmSync(out, { recursive: true, force: true });
        const result = await invoke("export:run", out, "static");
        log(`exported ${result.pages.join(", ")}; warnings: ${result.warnings.join(" | ")}`);
        for (const r of report.recordRoutes) expect(result.pages).toContain(r);
        if (report.credits) expect(result.pages).toContain("/credits");
        expect(existsSync(join(out, "data"))).toBe(false);
        const copies = readdirSync(join(out, "media")).filter((f) => /-\d+w\.webp$/.test(f));
        log(`WebP copies: ${copies.join(", ")}`);
        expect(copies.length).toBeGreaterThan(0);
        const site = await serve(out);
        try {
          const served = await load(launched, `${site.origin}${report.recordRoutes[0]}`);
          expect(served.styled).toBe(true);
          expect(served.text.length).toBeGreaterThan(40);
        } finally {
          site.close();
        }
        const problems = await launched.app.evaluate(() =>
          [
            ...(
              globalThis as { spaka?: { agent: { sessions: Map<string, { problems: string[] }> } } }
            ).spaka!.agent.sessions.values(),
          ].flatMap((s) => s.problems),
        );
        expect(problems).toEqual([]);
      } finally {
        await launched.close();
      }
    },
    1_200_000,
  );

  // Build step 4 in the packaged app (the "Guestbook" scenario): the real
  // agent writes a guestbook and a contact form; the Node export, made with
  // the server the app ships, runs on this machine and is sent two entries;
  // the Content tab then lists them with the test records, one is approved,
  // the other deleted for good, the rest saved as CSV.
  test.runIf(real)(
    "step 4 with the real agent: a guestbook, the Node export run, what it collected in the Content tab",
    async () => {
      const dataDir = join(import.meta.dirname, "../.cache/packaged-step4-data");
      rmSync(dataDir, { recursive: true, force: true });
      const launched = await launchApp({
        packaged: true,
        env: {
          SPAKA_AGENT_REPLAY: "",
          SPAKA_AGENT_CONFIG_DIR: configDir,
          SPAKA_AGENT_RECORD: join(runsDir, "packaged-step4.jsonl"),
          SPAKA_DATA_DIR: dataDir,
        },
      });
      const log = (line: string) => process.stdout.write(`[step4] ${line}\n`);
      const w = launched.window;
      let server: ChildProcess | undefined;
      try {
        const invoke = invokeIn(launched);
        await w.getByTestId("message-input").waitFor();
        await until(async () => (await invoke("agent:status")).auth === "signed-in", 30_000);
        const report = await buildGuestbook(launched);
        writeFileSync(join(runsDir, "packaged-step4.json"), JSON.stringify(report, null, 2));
        log(`guestbook: ${JSON.stringify(report)}`);
        const name = report.guestbook!;

        // The Node export, with the server the packaged app ships.
        const out = join(runsDir, "packaged-node");
        rmSync(out, { recursive: true, force: true });
        const token = (await invoke("site:token")) as string;
        const choices = await invoke("export:choices");
        expect(choices.choices.find((c: { id: string }) => c.id === "static").refused).toContain(name);
        await invoke("export:run", out, "node");
        const port = await new Promise<number>((resolve) => {
          const probe = createServer();
          probe.listen(0, "127.0.0.1", () => {
            const p = (probe.address() as AddressInfo).port;
            probe.close(() => resolve(p));
          });
        });
        const base = `http://127.0.0.1:${port}`;
        server = spawn(process.execPath, ["server.mjs"], {
          cwd: out,
          env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", SPAKA_TOKEN: token },
          stdio: "ignore",
        });
        await until(async () => (await fetch(`${base}/`)).ok, 15_000);
        const definition = readFileSync(
          join((await invoke("projects:current")).path, "data", name, "_datasource.yaml"),
          "utf8",
        );
        const { fields } = parse(definition) as { fields: { name: string; kind: string }[] };
        const entry = (who: string) => new URLSearchParams(sampleValues(fields, who));
        for (const who of ["Anne", "Bruno"]) {
          const sent = await fetch(`${base}/_data/${name}`, { method: "POST", body: entry(who) });
          expect(sent.status, await sent.text()).toBe(200);
        }

        // What it collected, in the Content tab.
        await invoke("projects:set-site-url", base);
        expect(await invoke("site:check")).toMatchObject({ ok: true });
        await w.getByTestId("tab-content").click();
        await w.locator(`[data-testid="datasource"][data-name="${name}"]`).click();
        await until(async () => (await w.getByTestId("collected").getAttribute("data-connected")) === "true", 15_000);
        const rows = () =>
          w
            .getByTestId("record")
            .evaluateAll((els) =>
              els.map((e) => [e.getAttribute("data-kind"), e.getAttribute("data-id"), e.hasAttribute("data-pending")]),
            );
        const listed = (await rows()) as [string, string, boolean][];
        const published = listed.filter((r) => r[0] === "published");
        expect(published.length).toBe(2);
        expect(published.every((r) => r[2])).toBe(true);
        expect(listed.filter((r) => r[0] === "test").length).toBeGreaterThanOrEqual(3);
        writeFileSync(join(runsDir, "packaged-step4-content.png"), await w.screenshot());
        await w.locator(`[data-id="${published[0]![1]}"]`).getByTestId("record-approve").click();
        await until(
          async () => !((await rows()) as [string, string, boolean][]).find((r) => r[1] === published[0]![1])?.[2],
          10_000,
        );
        const second = w.locator(`[data-id="${published[1]![1]}"]`);
        await second.hover();
        await second.getByTestId("record-delete").click();
        await second.getByTestId("record-delete-for-good").click();
        await until(
          async () => !((await rows()) as [string, string, boolean][]).some((r) => r[1] === published[1]![1]),
          10_000,
        );
        await w.getByTestId("collected-csv").click();
        await until(async () => (await w.getByTestId("collected-note").count()) === 1, 10_000);
        const csv = readFileSync(
          ((await w.getByTestId("collected-note").textContent()) ?? "").replace(/^Saved as /, ""),
          "utf8",
        );
        log(`csv: ${csv}`);
        expect(csv.split("\r\n").filter(Boolean).length).toBe(2);
        // The page shows the approved entry, not the deleted one.
        const home = await (
          await fetch(
            `${base}/${report.forms
              .find((f) => f.datasource === name)!
              .page.replace(/^pages\/|\.liquid$/g, "")
              .replace(/^index$/, "")}`,
          )
        ).text();
        log(`page shows Anne: ${home.includes("Anne")}, Bruno: ${home.includes("Bruno")}`);
      } finally {
        server?.kill("SIGTERM");
        await launched.close();
      }
    },
    1_200_000,
  );
});
