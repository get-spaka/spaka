import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";

// The conversation with a recorded agent (fixtures/bakery.jsonl): the first
// message creates the project, the agent's words and activity are shown, the
// files it writes reach the preview.
describe("a conversation with the agent", () => {
  let launched: LaunchedApp;
  const inPreview = (code: string) =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, code) => (globalThis as any).spaka.preview.view.webContents.executeJavaScript(code),
      code,
    );
  const until = async (read: () => Promise<unknown>, timeout = 10_000) => {
    timeout *= SLOW;
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const project = () =>
    launched.window.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).spaka.invoke("projects:current"),
    );

  beforeAll(async () => {
    // The name a small model would give the website (Q407), its quotes and stop taken off.
    launched = await launchApp({ env: { SPAKA_NAME_REPLY: '"Fournil de Lyon."' } });
    await launched.window.getByTestId("message-input").waitFor();
  });
  afterAll(async () => {
    await launched?.close();
  });

  test("the first message creates the project, with the effort picked beforehand, named by a model", async () => {
    const w = launched.window;
    await w.getByTestId("effort-select").selectOption("medium");
    await w.getByTestId("message-input").fill("A bakery in Lyon. Warm colours please.");
    await w.getByTestId("message-input").press("Enter");
    // Named from the first sentence at once, then by the model (Q408); its folder has a name of its own (Q410).
    await expect.poll(() => w.getByTestId("project-name").textContent()).toBe("Fournil de Lyon");
    const info = await project();
    expect(info.name).toBe("Fournil de Lyon");
    expect(info.path).toMatch(/[\\/]project-[0-9a-z]{10}$/);
    expect(info).toMatchObject({ effort: "medium", model: "claude-opus-5-5" });
    expect(JSON.parse(readFileSync(join(info.path, ".spaka/project.json"), "utf8")).effort).toBe("medium");
    await expect(w.getByTestId("maker-message").textContent()).resolves.toContain("A bakery in Lyon");
  });

  test("the agent's words and its steps in one line that unfolds, then the page in the preview", async () => {
    const w = launched.window;
    await until(() => w.locator('[data-testid="agent-message"][data-status="done"]').count());
    // Discreet by default (Q127): the steps are one line, which unfolds into one line per file.
    expect(await w.getByTestId("activity").count()).toBe(0);
    await expect(w.getByTestId("steps").textContent()).resolves.toBe("3 steps");
    await w.getByTestId("steps").click();
    const lines = await w.getByTestId("activity").allTextContents();
    expect(lines).toEqual(["Writing theme.css", "Writing pages/index.liquid", "Writing pages/menu.liquid"]);
    // Normal: one line per step, without unfolding.
    await w.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).spaka.invoke("settings:set", { outputStyle: "normal" }),
    );
    await until(async () => (await w.getByTestId("steps").count()) === 0);
    expect(await w.getByTestId("activity").allTextContents()).toEqual(lines);
    await expect(w.getByTestId("agent-message").textContent()).resolves.toContain("home page is ready");
    // The preview followed the agent to the last page it wrote.
    await until(() =>
      inPreview("location.pathname === '/menu' && document.querySelector('h1')?.textContent === 'Chez Margot · Menu'"),
    );
    await launched.capture("conversation-first-turn");
  });

  test("a follow-up edits the page in place, and the effort can change between messages", async () => {
    const w = launched.window;
    await w.getByTestId("effort-select").selectOption("low");
    await until(async () => (await project()).effort === "low");
    await w.getByTestId("message-input").fill("Close at 8pm");
    await w.getByTestId("send").click();
    await until(() => w.locator('[data-testid="agent-message"][data-status="done"]').nth(1).count());
    // Back on the home page, which the agent edits.
    await until(() => inPreview("location.pathname === '/' && document.body.textContent.includes('7am to 8pm')"));
    expect(await w.getByTestId("activity").allTextContents()).toContain("Editing pages/index.liquid");
  });

  test("undo puts the page back as it was before the last message", async () => {
    const w = launched.window;
    await w.getByTestId("history").click();
    // Newest first: the edit, the first build, the empty folder is not a version.
    expect(await w.getByTestId("history-entry").allTextContents()).toEqual([
      expect.stringContaining("Close at 8pm"),
      expect.stringContaining("A bakery in Lyon"),
    ]);
    await launched.capture("history-panel");
    await w.getByTestId("history").click();
    await w.getByTestId("undo").click();
    await until(() => inPreview("document.body.textContent.includes('7am to 7pm')"));
    const { path } = await project();
    expect(readFileSync(join(path, "pages/index.liquid"), "utf8")).toContain("7am to 7pm");
    await expect(w.getByTestId("notice").last().textContent()).resolves.toContain(
      "Went back to the version after: A bakery in Lyon",
    );
    const entries = await launched.window.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).spaka.invoke("history:list"),
    );
    expect(entries.map((e: { kind: string; current: boolean }) => `${e.kind}${e.current ? "*" : ""}`)).toEqual([
      "turn",
      "turn",
      "restore*",
    ]);
  });

  test("starting over keeps what is shown and says the agent forgot", async () => {
    const w = launched.window;
    // Its tooltip reaches over the page: it is drawn over it, as the preview bar's are.
    await w.getByTestId("start-over").hover();
    await expect
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      .poll(() => launched.app.evaluate(() => (globalThis as any).spaka.tips.shown))
      .toContain("Start over");
    expect(await w.getByTestId("tip").getAttribute("data-over-page")).toBe("true");
    await w.getByTestId("start-over").click();
    await until(() => w.getByTestId("notice").nth(1).count());
    expect(await w.getByTestId("maker-message").count()).toBe(2);
    const { path, id } = await project();
    const data = await launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, id) => (globalThis as any).spaka.projects.dataFor(id),
      id,
    );
    const log = JSON.parse(readFileSync(join(data, "conversation.json"), "utf8"));
    expect(log.map((i: { kind: string }) => i.kind)).toEqual(["maker", "agent", "maker", "agent", "notice", "notice"]);
    expect(path).toContain(launched.projectsDir);
  });
});
