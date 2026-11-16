import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";
import { writeAdaptationRecording } from "./fixtures/adaptation-recording.ts";
import { writePlanRecording, writeQuestionsRecording } from "./fixtures/questions-recording.ts";

// The screens' review sheet (tour and polish slice 6): every screen of the
// interface pictured light and dark side by side, the page's native views laid
// at their places over the interface's picture, one picture per screen in
// e2e/.runs/screens/ and an index.html of them all. Run only when asked:
//   UPSTART_SCREENS_SHEET=1
const asked = process.env.UPSTART_SCREENS_SHEET === "1";
const outDir = join(runsDir, "screens");
const APPEARANCES = ["light", "dark"] as const;

type Layer = { png: string; x: number; y: number; width: number; height: number };

describe.skipIf(!asked)("the screens' review sheet", () => {
  const shots: { name: string; missed?: string }[] = [];
  let count = 0;

  /** The interface and every native view shown over it, each as a PNG with its place. */
  const grab = (launched: LaunchedApp) =>
    launched.app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) =>
        /renderer\/index\.html|localhost/.test(w.webContents.getURL()),
      );
      if (!win) throw new Error("no interface window");
      const [width, height] = win.getContentSize();
      const layers: Layer[] = [];
      const base = await win.webContents.capturePage();
      layers.push({ png: base.toPNG().toString("base64"), x: 0, y: 0, width: width!, height: height! });
      for (const view of win.contentView.children) {
        // biome-ignore lint/suspicious/noExplicitAny: a WebContentsView among the window's views
        const contents = (view as any).webContents as Electron.WebContents | undefined;
        const b = view.getBounds();
        if (!contents || !view.getVisible() || b.width === 0 || b.x + b.width <= 0 || b.x >= width!) continue;
        const image = await contents.capturePage();
        layers.push({ png: image.toPNG().toString("base64"), x: b.x, y: b.y, width: b.width, height: b.height });
      }
      return { width: width!, height: height!, layers };
    });

  /** The screen as it is, light then dark, side by side in one picture. */
  async function shoot(launched: LaunchedApp, name: string) {
    count += 1;
    const id = `${String(count).padStart(2, "0")}-${name}`;
    const dir = join(outDir, id);
    mkdirSync(dir, { recursive: true });
    const sides: string[] = [];
    let size = { width: 1440, height: 900 };
    for (const appearance of APPEARANCES) {
      await setAppearance(launched, appearance);
      const { width, height, layers } = await grab(launched);
      size = { width, height };
      const imgs = layers.map((l, i) => {
        const file = `${appearance}-${i}.png`;
        writeFileSync(join(dir, file), Buffer.from(l.png, "base64"));
        return `<img src="${file}" style="left:${l.x}px;top:${l.y}px;width:${l.width}px;height:${l.height}px">`;
      });
      sides.push(`<div class="side">${imgs.join("")}</div>`);
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#808080;display:flex;gap:16px;padding:16px;width:max-content}
.side{position:relative;width:${size.width}px;height:${size.height}px;overflow:hidden;box-shadow:0 0 0 1px #0004}
.side img{position:absolute;display:block}
</style></head><body>${sides.join("")}</body></html>`;
    writeFileSync(join(dir, "pair.html"), html);
    const opened = launched.app.waitForEvent("window", (page) => page.url().endsWith(`/${id}/pair.html`));
    await launched.app.evaluate(
      async ({ BrowserWindow }, { file, width, height }) => {
        const win = new BrowserWindow({ show: false, width, height, useContentSize: true });
        await win.loadFile(file);
      },
      { file: join(dir, "pair.html"), width: size.width * 2 + 48, height: size.height + 32 },
    );
    const page = await opened;
    await page.screenshot({ path: join(outDir, `${id}.png`), fullPage: true });
    await page.close();
    rmSync(dir, { recursive: true, force: true });
    shots.push({ name: id });
  }

  async function setAppearance(launched: LaunchedApp, appearance: "light" | "dark") {
    await invoke(launched, "settings:set", { appearance });
    await launched.window.waitForFunction(
      (dark) => matchMedia("(prefers-color-scheme: dark)").matches === dark,
      appearance === "dark",
    );
    // The page's overlays and the interface's transitions settle.
    await new Promise((r) => setTimeout(r, 400));
  }

  /** A step of the walk: pictured if it can be reached, named in the index if not. */
  async function step(launched: LaunchedApp, name: string, reach: () => Promise<unknown>) {
    try {
      await reach();
      await shoot(launched, name);
    } catch (error) {
      count += 1;
      shots.push({ name: `${String(count).padStart(2, "0")}-${name}`, missed: String(error).slice(0, 300) });
    }
  }

  const invoke = <T = unknown>(launched: LaunchedApp, channel: string, ...args: unknown[]): Promise<T> =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...(args as unknown[])),
      [channel, args] as const,
    ) as Promise<T>;

  const until = async (read: () => Promise<unknown>, timeout = 20_000) => {
    const started = Date.now();
    for (;;) {
      if (await read().catch(() => false)) return;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const turnsDone = (launched: LaunchedApp, n: number) =>
    until(
      async () => (await launched.window.locator('[data-testid="agent-message"][data-status="done"]').count()) >= n,
    );
  const recording = (write: (file: string) => void) => {
    const file = join(mkdtempSync(join(tmpdir(), "upstart-screens-")), "agent.jsonl");
    write(file);
    return file;
  };

  test("a template's website: the start screen, the adaptation, the tabs, the preview, publishing, the settings, the tour", async () => {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    const launched = await launchApp({
      followAppearance: true,
      tour: true,
      env: { UPSTART_AGENT_REPLAY: recording(writeAdaptationRecording) },
    });
    const w = launched.window;
    try {
      await w.getByTestId("start").waitFor();
      await until(() => w.getByTestId("template-card").count());
      await step(launched, "start", async () => {});
      await step(launched, "start-template-chosen", () =>
        w.locator('[data-testid="template-card"][data-template="reel"] button[aria-pressed]').click(),
      );
      await w.getByTestId("message-input").fill("A website for Terra Lenta, a ceramics studio in Lisbon, with a shop.");
      await w.getByTestId("message-input").press("Enter");
      const card = w.locator('[data-testid="pages-card"][data-state="waiting"]');
      await step(launched, "pages-card", async () => {
        await card.waitFor();
        await until(() => card.locator('[data-route="/work"] img').count());
      });
      // As the recording has it: the studio kept, then the contact page taken off.
      await card.locator('[data-testid="pages-choice"][data-route="/studio"]').click();
      await w.getByTestId("pages-keep").click();
      await turnsDone(launched, 1);
      await w
        .locator('[data-testid="adaptation-step"][data-route="/contact"] [data-testid="adaptation-remove"]')
        .click();
      await step(launched, "adaptation-bar", () => w.getByTestId("adaptation-bar").waitFor());
      await step(launched, "publish-during-adaptation", async () => {
        await w.getByTestId("export-open").click();
        await w.getByTestId("export-dialog").waitFor();
      });
      await w.keyboard.press("Escape");
      await w.getByTestId("export-dialog").waitFor({ state: "detached" });
      // The rest of the adaptation, then the tour.
      for (let n = 2; n <= 4; n++) {
        if (!(await w.getByTestId("adaptation-continue").count())) break;
        await w.getByTestId("adaptation-continue").click();
        await turnsDone(launched, n);
        // The agent removes the contact page in that turn, which the recording only says.
        if (n === 2) {
          const { path } = await invoke<{ path: string }>(launched, "projects:current");
          rmSync(join(path, "pages/contact.liquid"), { force: true });
        }
      }
      await w.getByTestId("tour").waitFor({ timeout: 20_000 });
      for (let i = 0; i < 5; i++) {
        const name = await w.getByTestId("tour").getAttribute("data-step");
        await step(launched, `tour-${i + 1}-${name}`, async () => {});
        if (i < 4) {
          if (await w.getByTestId("tour-next").count()) await w.getByTestId("tour-next").click();
          else
            await launched.app.evaluate(() =>
              // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
              (globalThis as any).upstart.preview.view.webContents.executeJavaScript(
                `document.querySelector("upstart-editor").shadowRoot.querySelector('[data-testid="page-tour-next"]').click()`,
              ),
            );
          await until(async () => (await w.getByTestId("tour").getAttribute("data-step")) !== name);
        }
      }
      await w.keyboard.press("Escape");
      await w.getByTestId("tour").waitFor({ state: "detached" });

      await step(launched, "conversation", () => w.getByTestId("tab-conversation").click());
      await step(launched, "blocks", async () => {
        await w.getByTestId("tab-blocks").click();
        await until(() => w.locator('[data-testid="block"] img').count());
      });
      await step(launched, "theme", () => w.getByTestId("tab-theme").click());
      await step(launched, "content", async () => {
        await w.getByTestId("tab-content").click();
        await w.getByTestId("datasource").first().waitFor();
      });
      await step(launched, "content-records", async () => {
        await w.getByTestId("datasource").first().click();
        await w.getByTestId("record").first().waitFor();
      });
      await step(launched, "content-record", async () => {
        await w.getByTestId("record").first().click();
        await w.getByTestId("record-form").waitFor();
      });
      await w.getByTestId("tab-content").click();
      if (await w.getByTestId("content-back").count()) await w.getByTestId("content-back").first().click();
      await step(launched, "content-media", async () => {
        if (await w.getByTestId("content-back").count()) await w.getByTestId("content-back").first().click();
        await w.getByTestId("content-media").click();
        await w.getByTestId("media").waitFor();
      });
      await w.getByTestId("tab-conversation").click();

      await step(launched, "preview-edit", () => w.getByTestId("mode-edit").click());
      await step(launched, "preview-comment", () => w.getByTestId("mode-comment").click());
      await step(launched, "preview-visitor", () => w.getByTestId("mode-visitor").click());
      await w.getByTestId("mode-edit").click();
      await step(launched, "preview-tablet", () => w.getByTestId("width-tablet").click());
      await step(launched, "preview-phone", () => w.getByTestId("width-phone").click());
      await w.getByTestId("width-desktop").click();
      await step(launched, "all-pages", async () => {
        await w.getByTestId("view-pages").click();
        await w.getByTestId("pages-grid").waitFor();
        await new Promise((r) => setTimeout(r, 1500));
      });
      await w.getByTestId("view-page").click();
      // The zoom back to the page lands once the page is drawn.
      await new Promise((r) => setTimeout(r, 2000));
      await step(launched, "history", async () => {
        await w.getByTestId("history").click();
        await w.getByTestId("history-entry").first().waitFor();
        await new Promise((r) => setTimeout(r, 600));
      });
      await w.keyboard.press("Escape");
      await step(launched, "publish", async () => {
        await w.getByTestId("export-open").click();
        await w.getByTestId("export-dialog").waitFor();
        await until(() => w.getByTestId("publish-choice").count());
      });
      await w.keyboard.press("Escape");
      await w.getByTestId("export-dialog").waitFor({ state: "detached" });
      // A first export into a folder, as the folder's dialog would give it; then Publish exports again there.
      await invoke(launched, "export:run", mkdtempSync(join(tmpdir(), "upstart-screens-export-")), "static");
      await step(launched, "publish-done", async () => {
        await w.getByTestId("export-open").click();
        await w.locator('[data-testid="publish-choice"][data-id="static"]').click();
        await w.getByTestId("export-again").click();
        await w.getByTestId("export-result").waitFor({ timeout: 30_000 });
      });
      await w.keyboard.press("Escape");
      await w
        .getByTestId("export-dialog")
        .waitFor({ state: "detached" })
        .catch(() => {});

      for (const page of ["general", "agent", "skills", "connectors", "privacy", "about"]) {
        await step(launched, `settings-${page}`, async () => {
          await invoke(launched, "settings:open", page);
          await w.getByTestId("settings").waitFor();
          await new Promise((r) => setTimeout(r, 300));
        });
      }
      await w.keyboard.press("Escape");
      await w.getByTestId("settings").waitFor({ state: "detached" });
      await step(launched, "site-settings", async () => {
        await w.getByTestId("project-settings").first().click();
        await w.getByTestId("site-settings").waitFor();
      });
      await w.keyboard.press("Escape");
      await step(launched, "shortcuts", async () => {
        await launched.app.evaluate(({ Menu }) => {
          const help = Menu.getApplicationMenu()?.items.find((m) => m.role === "help");
          help?.submenu?.items.find((i) => i.label === "Keyboard Shortcuts")?.click();
        });
        await w.getByTestId("shortcuts").waitFor();
      });
      await w.keyboard.press("Escape");
      await step(launched, "start-with-websites", async () => {
        await invoke(launched, "projects:close");
        await w.getByTestId("start").waitFor();
      });
    } finally {
      await launched.close();
    }
  }, 900_000);

  test("the agent's cards: a question and a plan", async () => {
    for (const [name, write, plan] of [
      ["question-card", writeQuestionsRecording, false],
      ["plan-card", writePlanRecording, true],
    ] as const) {
      const launched = await launchApp({ followAppearance: true, env: { UPSTART_AGENT_REPLAY: recording(write) } });
      const w = launched.window;
      try {
        await w.getByTestId("message-input").waitFor();
        if (plan) await w.getByTestId("mode-select").selectOption("plan");
        await w.getByTestId("message-input").fill("A bakery in Lyon.");
        await w.getByTestId("message-input").press("Enter");
        await step(launched, name, () =>
          w.locator(`[data-testid="${name}"][data-state="${plan ? "proposed" : "waiting"}"]`).waitFor(),
        );
      } finally {
        await launched.close();
      }
    }
  }, 300_000);

  test("the index", () => {
    const rows = shots
      .map((s) =>
        s.missed
          ? `<section><h2>${s.name}</h2><p class="missed">Not reached: ${s.missed.replace(/</g, "&lt;")}</p></section>`
          : `<section><h2>${s.name}</h2><img src="${s.name}.png"></section>`,
      )
      .join("\n");
    writeFileSync(
      join(outDir, "index.html"),
      `<!doctype html><meta charset="utf-8"><title>Screens</title><style>body{font:14px system-ui;margin:24px;background:#ddd}img{width:100%;max-width:1480px;display:block}h2{font-size:15px}.missed{color:#a00}</style>${rows}`,
    );
    expect(shots.length).toBeGreaterThan(0);
  });
});
