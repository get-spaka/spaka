import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, settingsPage } from "./app.ts";

// The settings window (Q116–Q119): opened with ⌘, from the app's menu, one
// window however often it is asked for, six categories, a search that narrows
// them and highlights what it found, and the app's own settings kept and used.
describe("the settings window", () => {
  let launched: LaunchedApp;
  let settings: Page;
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
  const settingsWindows = () => launched.app.windows().filter((p) => p.url().includes("#settings")).length;
  const sidebar = () =>
    settings.locator('[data-testid^="settings-page-"]').evaluateAll((els) => els.map((e) => e.textContent));

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("conversation").waitFor();
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("⌘, in the app's menu opens it, at General, with the websites' folder", async () => {
    await launched.app.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu()?.items[0]?.submenu?.items.find(
        (i) => i.accelerator === "CommandOrControl+,",
      );
      item?.click();
    });
    settings = await settingsPage(launched.app);
    expect(await sidebar()).toEqual(["General", "Agent", "Skills", "Connectors", "Privacy", "About Upstart"]);
    expect(await settings.getByTestId("settings-title").textContent()).toBe("General");
    expect(await settings.getByTestId("projects-dir").textContent()).toBe(launched.projectsDir);
  });

  test("asked again, at a page: the same window shows that page", async () => {
    await invoke("settings:open", "about");
    await until(async () => (await settings.getByTestId("settings-title").textContent()) === "About Upstart");
    expect(await settings.getByTestId("about-version").textContent()).toMatch(/^Version \d/);
    expect(settingsWindows()).toBe(1);
  });

  test("the search narrows the categories and highlights what it found", async () => {
    const search = settings.getByTestId("settings-search");
    await search.fill("statist");
    await until(async () => JSON.stringify(await sidebar()) === JSON.stringify(["Privacy"]));
    expect(await settings.getByTestId("settings-title").textContent()).toBe("Privacy");
    expect(await settings.locator('[data-setting="statistics"]').getAttribute("data-found")).toBe("");
    await search.fill("clé");
    await until(async () => (await settings.getByTestId("settings-title").textContent()) === "Agent");
    expect(await settings.locator('[data-setting="api-key"]').getAttribute("data-found")).toBe("");
    expect(await settings.locator('[data-setting="model"]').getAttribute("data-found")).toBeNull();
    await search.fill("zzzz");
    await settings.getByTestId("settings-none").waitFor();
    await search.press("Escape");
    await until(async () => (await sidebar()).length === 6);
  });

  test("the statistics switch is kept on this computer", async () => {
    await settings.getByTestId("settings-page-privacy").click();
    const toggle = settings.getByTestId("statistics-switch");
    expect(await toggle.getAttribute("aria-checked")).toBe("true");
    await toggle.click();
    await until(async () => (await toggle.getAttribute("aria-checked")) === "false");
    const file = JSON.parse(readFileSync(join(launched.dataDir, "settings.json"), "utf8"));
    expect(file.statistics).toBe(false);
  });

  test("the effort for new websites is the one a new website starts with", async () => {
    await settings.getByTestId("settings-page-agent").click();
    await settings.getByTestId("new-effort").locator('[data-value="high"]').click();
    await until(async () => (await invoke("settings:get")).newEffort === "high");
    await settings.screenshot({ path: join(import.meta.dirname, ".runs/settings-agent.png") });
    // No website is open: the conversation's selector shows it, before the first message.
    await until(async () => (await launched.window.getByTestId("effort-select").inputValue()) === "high");
  });
});
