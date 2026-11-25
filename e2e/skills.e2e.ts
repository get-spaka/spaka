import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, openSettings, SLOW } from "./app.ts";

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
    timeout *= SLOW;
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
    await launched.window.getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    // The bakery has two pages: the preview went to all of them (Q131); these checks are on one.
    await invoke("preview:set-view", "page");
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  let settings: Page;

  test("the settings do not list Upstart's own skills, which the agent still gets; the page is hidden meanwhile", async () => {
    settings = await openSettings(launched.window);
    await settings.getByTestId("settings-page-skills").click();
    await settings.getByTestId("skills-app").waitFor();
    expect(await settings.getByTestId("skills-upstart").count()).toBe(0);
    expect(await settings.getByTestId("settings").getByText("upstart-help").count()).toBe(0);
    await until(async () => !(await main((u) => u.preview.view.getVisible())));
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
    await launched.capture("settings-skills");
    // Escape closes the panel, and the page is shown again.
    await launched.window.keyboard.press("Escape");
    await until(async () => (await launched.window.getByTestId("settings").count()) === 0);
    await until(() => main((u) => u.preview.view.getVisible()));
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

  test("the button before the website's name opens its settings, centred on the window; a click beside them closes them", async () => {
    const w = launched.window;
    await w.getByTestId("header-site-settings").click();
    const dialog = w.getByTestId("site-settings");
    await dialog.waitFor();
    const box = (await dialog.boundingBox())!;
    const size = await w.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - size.height / 2)).toBeLessThan(2);
    await w.mouse.click(10, size.height - 10);
    await dialog.waitFor({ state: "detached" });
    await until(() => main((u) => u.preview.view.getVisible()));
  });

  test("a click on the website's name in its settings renames it; Escape leaves it and keeps the dialog open", async () => {
    const w = launched.window;
    const before = (await invoke("projects:current")).name;
    await w.getByTestId("header-site-settings").click();
    const dialog = w.getByTestId("site-settings");
    const field = dialog.getByTestId("site-rename");
    await dialog.getByTestId("site-name").click();
    await field.waitFor();
    expect(await field.inputValue()).toBe(before);
    await field.fill("Not kept");
    await field.press("Escape");
    await field.waitFor({ state: "detached" });
    expect(await dialog.count()).toBe(1);
    expect(await dialog.getByTestId("site-name").textContent()).toBe(before);
    // Enter keeps it, for the website and in its row in the list.
    await dialog.getByTestId("site-name").click();
    await field.fill("Renamed in settings");
    await field.press("Enter");
    await until(async () => (await invoke("projects:current")).name === "Renamed in settings");
    await until(async () => (await dialog.getByTestId("site-name").textContent()) === "Renamed in settings");
    await until(() => w.getByTestId("project-item").filter({ hasText: "Renamed in settings" }).count());
    // Its folder, shown under its name, is project-<random id> and stays so (Q410).
    const folder = (await invoke("projects:current")).path.split("/").pop();
    expect(folder).toMatch(/^project-[0-9a-z]{10}$/);
    expect(await dialog.getByTestId("site-folder").textContent()).toBe(folder);
    // Back to its name, for the tests after it.
    await dialog.getByTestId("site-name").click();
    await field.fill(before);
    await field.press("Enter");
    await until(async () => (await invoke("projects:current")).name === before);
    await dialog.getByTestId("site-settings-done").click();
    await dialog.waitFor({ state: "detached" });
  });

  const assembledHas = async (path: string) => {
    const file = join(await assembled(), path);
    return existsSync(file) && readFileSync(file, "utf8").length > 0;
  };
});
