import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";
import { describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";

const built = existsSync(join(import.meta.dirname, "../apps/desktop/dist/mac-arm64/Upstart.app"));
const real = process.env.UPSTART_REAL_AGENT === "1";
const configDir = join(import.meta.dirname, "../.cache/agent-config");

const invokeIn =
  (launched: LaunchedApp) =>
  // biome-ignore lint/suspicious/noExplicitAny: what the main process answers, as the checks read it
  (channel: string, ...args: unknown[]): Promise<any> =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
      [channel, args] as const,
    );
const until = async (read: () => Promise<unknown>, timeout: number) => {
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
  const server = createServer((req, res) => {
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
    const win = (globalThis as { upstart?: { win: Electron.BrowserWindow } }).upstart!.win;
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

// Run after `pnpm --filter @upstart/desktop package`.
describe.runIf(built && process.platform === "darwin")("the packaged app", () => {
  test("starts in the background, with Upstart's skills, and exports a website", async () => {
    const launched = await launchApp({ packaged: true });
    try {
      const invoke = invokeIn(launched);
      await launched.window.getByTestId("conversation").waitFor();
      expect(await launched.app.evaluate(({ app }) => app.isPackaged)).toBe(true);
      await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
      await done(launched, 1, 30_000);
      // The skills shipped outside the archive, assembled for the agent.
      expect((await invoke("skills:list")).map((s: { name: string }) => s.name)).toEqual([
        "gallery",
        "htmx-patterns",
        "upstart-help",
        "writing-skills",
      ]);
      // The builder finds Tailwind, daisyUI and htmx inside the archive.
      const out = join(runsDir, "packaged-export");
      rmSync(out, { recursive: true, force: true });
      const result = await invoke("export:run", out);
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
  }, 90_000);

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
          UPSTART_AGENT_REPLAY: "",
          UPSTART_AGENT_CONFIG_DIR: configDir,
          UPSTART_AGENT_RECORD: join(runsDir, "packaged-real.jsonl"),
          UPSTART_DATA_DIR: dataDir,
        },
      });
      try {
        const invoke = invokeIn(launched);
        await launched.window.getByTestId("conversation").waitFor();
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
                globalThis as { upstart?: { preview: { view: Electron.WebContentsView } } }
              ).upstart!.preview.view.getVisible(),
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
        const result = await invoke("export:run", out);
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
              globalThis as { upstart?: { agent: { sessions: Map<string, { problems: string[] }> } } }
            ).upstart!.agent.sessions.values(),
          ].flatMap((s) => s.problems),
        );
        expect(problems).toEqual([]);
      } finally {
        await launched.close();
      }
    },
    600_000,
  );
});
