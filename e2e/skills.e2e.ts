import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";

// Skills (ADR 0010), with the recorded agent: the settings list the three
// origins, a skill added there or written into the project reaches the agent's
// assembled plugins without restarting the app.
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

  test("the settings list Upstart's skills and hide the page meanwhile", async () => {
    const w = launched.window;
    await w.getByTestId("open-settings").click();
    await w.getByTestId("settings").waitFor();
    await until(async () => !(await main((u) => u.preview.view.getVisible())));
    expect(await w.getByTestId("skills-upstart").getByTestId("skill").allTextContents()).toEqual([
      expect.stringContaining("gallery"),
      expect.stringContaining("htmx-patterns"),
      expect.stringContaining("upstart-help"),
      expect.stringContaining("writing-skills"),
    ]);
    // The agent got them from the start, as plugins Upstart assembled.
    expect(existsSync(join(await assembled(), "upstart/skills/upstart-help/SKILL.md"))).toBe(true);
  });

  test("a skill added for all websites is shown, copied, and given to the agent", async () => {
    const w = launched.window;
    const source = skill(mkdtempSync(join(tmpdir(), "skill-")), "brand-voice", "How Chez Margot speaks.");
    await invoke("skills:add", "app", source);
    await until(() => w.getByTestId("skills-app").getByText("brand-voice").count());
    expect(existsSync(join(launched.dataDir, "skills/brand-voice/SKILL.md"))).toBe(true);
    await until(() => assembledHas("app/skills/brand-voice/SKILL.md"));
    await expect(invoke("skills:add", "app", tmpdir())).rejects.toThrow(/SKILL.md/);
  });

  test("a skill written into the project appears and reaches the agent without restarting", async () => {
    const w = launched.window;
    const { path } = await invoke("projects:current");
    skill(join(path, ".upstart/skills"), "menu-format", "How this bakery's menu is written.");
    await until(() => w.getByTestId("skills-project").getByText("menu-format").count());
    await until(() => assembledHas("project/skills/menu-format/SKILL.md"));
    await launched.capture("settings-skills");
    // Removing it from the settings takes it out of the project and from the agent.
    await w.getByTestId("skills-project").getByTestId("skill-remove").click();
    await until(async () => (await w.getByTestId("skills-project").getByTestId("skill").count()) === 0);
    expect(existsSync(join(path, ".upstart/skills/menu-format"))).toBe(false);
    await until(async () => !(await assembledHas("project/skills/menu-format/SKILL.md")));
    await w.getByTestId("settings-close").click();
    await until(() => main((u) => u.preview.view.getVisible()));
  });

  const assembledHas = async (path: string) => {
    const file = join(await assembled(), path);
    return existsSync(file) && readFileSync(file, "utf8").length > 0;
  };
});
