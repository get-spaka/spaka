import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, settingsPage } from "./app.ts";

// Skills (ADR 0010), with the recorded agent: the settings window lists
// Upstart's and the maker's skills for every website (Q116), a website's own
// are in its settings (Q118); a skill added there or written into the project
// reaches the agent's assembled plugins without restarting the app.
describe("skills", () => {
  let launched: LaunchedApp;
  // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
  const main = <T>(fn: (upstart: any, arg: any) => T, arg?: unknown) =>
    launched.app.evaluate(
      (_electron, [source, arg]) =>
        new Function("u", "a", `return (${source})(u, a)`)((globalThis as { upstart?: unknown }).upstart, arg),
      [fn.toString(), arg] as const,
    ) as Promise<Awaited<T>>;
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
      [channel, args] as const,
    );
  const until = async (read: () => Promise<unknown>, timeout = 10_000) => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const skill = (dir: string, name: string, description: string) => {
    mkdirSync(join(dir, name), { recursive: true });
    writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`);
    return join(dir, name);
  };
  const assembled = async () => {
    const { id } = await invoke("projects:current");
    return join(await main((u, id) => u.projects.dataFor(id), id), "skills");
  };

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("conversation").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  let settings: Page;

  test("the settings window lists Upstart's skills; the page stays shown", async () => {
    await launched.window.getByTestId("open-settings").click();
    settings = await settingsPage(launched.app);
    await settings.getByTestId("settings-page-skills").click();
    await until(async () => (await settings.getByTestId("skills-upstart").getByTestId("skill").count()) === 4);
    expect(await settings.getByTestId("skills-upstart").getByTestId("skill").allTextContents()).toEqual([
      expect.stringContaining("gallery"),
      expect.stringContaining("htmx-patterns"),
      expect.stringContaining("upstart-help"),
      expect.stringContaining("writing-skills"),
    ]);
    expect(await main((u) => u.preview.view.getVisible())).toBe(true);
    // The agent got them from the start, as plugins Upstart assembled.
    expect(existsSync(join(await assembled(), "upstart/skills/upstart-help/SKILL.md"))).toBe(true);
  });

  test("a skill added for all websites is shown, copied, and given to the agent", async () => {
    const source = skill(mkdtempSync(join(tmpdir(), "skill-")), "brand-voice", "How Chez Margot speaks.");
    await invoke("skills:add", "app", source);
    await until(() => settings.getByTestId("skills-app").getByText("brand-voice").count());
    expect(existsSync(join(launched.dataDir, "skills/brand-voice/SKILL.md"))).toBe(true);
    await until(() => assembledHas("app/skills/brand-voice/SKILL.md"));
    await expect(invoke("skills:add", "app", tmpdir())).rejects.toThrow(/SKILL.md/);
    await settings.screenshot({ path: join(import.meta.dirname, ".runs/settings-skills.png") });
  });

  test("a skill written into the project appears in its own settings and reaches the agent", async () => {
    const w = launched.window;
    const { path } = await invoke("projects:current");
    skill(join(path, ".upstart/skills"), "menu-format", "How this bakery's menu is written.");
    await w.getByTestId("project-settings").first().click();
    const sheet = w.getByTestId("site-settings");
    await until(() => sheet.getByTestId("skills-project").getByText("menu-format").count());
    await until(() => assembledHas("project/skills/menu-format/SKILL.md"));
    // The page is hidden while the sheet covers it.
    await until(async () => !(await main((u) => u.preview.view.getVisible())));
    await launched.capture("site-settings-skills");
    // Chosen, then removed with −: out of the project and out of the agent's.
    await sheet.getByTestId("skills-project").getByTestId("skill").click();
    await sheet.getByTestId("skills-project-remove").click();
    await until(async () => (await sheet.getByTestId("skills-project").getByTestId("skill").count()) === 0);
    expect(existsSync(join(path, ".upstart/skills/menu-format"))).toBe(false);
    await until(async () => !(await assembledHas("project/skills/menu-format/SKILL.md")));
    await sheet.getByTestId("site-settings-done").click();
    await until(() => main((u) => u.preview.view.getVisible()));
  });

  const assembledHas = async (path: string) => {
    const file = join(await assembled(), path);
    return existsSync(file) && readFileSync(file, "utf8").length > 0;
  };
});
