import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";

// The settings (Q116–Q119, Q123, Q125): a panel over the window, opened and
// closed with ⌘, from the app's menu, closed with Escape, its close button or a
// click outside; six categories, a search that narrows them and highlights what
// it found, and the app's own settings kept and used.
describe("the settings panel", () => {
  let launched: LaunchedApp;
  let w: Page;
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
      [channel, args] as const,
    );
  // biome-ignore lint/suspicious/noExplicitAny: the main process's objects, for checks
  const main = <T>(fn: (upstart: any) => T) =>
    launched.app.evaluate(
      (_electron, source) => new Function("u", `return (${source})(u)`)((globalThis as { upstart?: unknown }).upstart),
      fn.toString(),
    ) as Promise<Awaited<T>>;
  const zoom = () => main((u) => u.win.webContents.getZoomFactor());
  const until = async (read: () => Promise<unknown>, timeout = 10_000) => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const menuSettings = () =>
    launched.app.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu()?.items[0]?.submenu?.items.find(
        (i) => i.accelerator === "CommandOrControl+,",
      );
      item?.click();
    });
  const open = () => w.getByTestId("settings").count();
  const closed = async () => (await open()) === 0;
  const sidebar = () =>
    w.locator('[data-testid^="settings-page-"]').evaluateAll((els) => els.map((e) => e.textContent));
  const file = () => JSON.parse(readFileSync(join(launched.dataDir, "settings.json"), "utf8"));

  beforeAll(async () => {
    launched = await launchApp();
    w = launched.window;
    await w.getByTestId("message-input").waitFor();
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("⌘, in the app's menu opens it over the window, at General, with the websites' folder", async () => {
    await menuSettings();
    await until(open);
    // No window of its own (Q123).
    expect(launched.app.windows().filter((p) => p.url().includes("#settings"))).toHaveLength(0);
    expect(await main((u) => u.preview.view.getVisible())).toBe(false);
    expect(await sidebar()).toEqual(["General", "Agent", "Skills", "Connectors", "Privacy", "About Upstart"]);
    expect(await w.getByTestId("settings-title").textContent()).toBe("General");
    expect(await w.getByTestId("projects-dir").textContent()).toBe(launched.projectsDir);
    const box = await w.getByTestId("settings").boundingBox();
    expect(box && Math.round(box.width)).toBeLessThanOrEqual(1100);
    await launched.capture("settings-general");
  });

  test("⌘, again closes it; asked at a page, it opens there", async () => {
    await menuSettings();
    await until(closed);
    await invoke("settings:open", "about");
    await until(async () => (await w.getByTestId("settings-title").textContent()) === "About Upstart");
    expect(await w.getByTestId("about-version").textContent()).toMatch(/^Version \d/);
  });

  test("the search narrows the categories and highlights what it found; Escape empties it, then closes", async () => {
    const search = w.getByTestId("settings-search");
    await search.fill("statist");
    await until(async () => JSON.stringify(await sidebar()) === JSON.stringify(["Privacy"]));
    expect(await w.getByTestId("settings-title").textContent()).toBe("Privacy");
    expect(await w.locator('[data-setting="statistics"]').getAttribute("data-found")).toBe("");
    await search.fill("clé");
    await until(async () => (await w.getByTestId("settings-title").textContent()) === "Agent");
    expect(await w.locator('[data-setting="api-key"]').getAttribute("data-found")).toBe("");
    expect(await w.locator('[data-setting="model"]').getAttribute("data-found")).toBeNull();
    await search.fill("font");
    await until(async () => (await w.locator('[data-setting="text-size"]').getAttribute("data-found")) === "");
    await search.fill("zzzz");
    await w.getByTestId("settings-none").waitFor();
    await search.press("Escape");
    await until(async () => (await sidebar()).length === 6);
    expect(await open()).toBe(1);
    await search.press("Escape");
    await until(closed);
  });

  test("a click outside closes it, and so does its close button", async () => {
    await w.getByTestId("open-settings").click();
    await until(open);
    await w.getByTestId("settings-backdrop").click({ position: { x: 8, y: 300 } });
    await until(closed);
    await w.getByTestId("open-settings").click();
    await w.getByTestId("settings-close").click();
    await until(closed);
  });

  test("the statistics switch is kept on this computer", async () => {
    await invoke("settings:open", "privacy");
    const toggle = w.getByTestId("statistics-switch");
    expect(await toggle.getAttribute("aria-checked")).toBe("true");
    await toggle.click();
    await until(async () => (await toggle.getAttribute("aria-checked")) === "false");
    expect(file().statistics).toBe(false);
  });

  test("the text size draws the interface larger, not the website", async () => {
    await w.getByTestId("settings-page-general").click();
    expect(await w.getByTestId("output-style").locator('[aria-pressed="true"]').textContent()).toBe("Discreet");
    expect(await w.getByTestId("notify-switch").getAttribute("aria-checked")).toBe("true");
    await w.getByTestId("text-size").locator('[data-value="large"]').click();
    await until(async () => (await zoom()) === 1.15);
    expect(file().textSize).toBe("large");
    await launched.capture("settings-text-large");
    await w.getByTestId("text-size").locator('[data-value="medium"]').click();
    await until(async () => (await zoom()) === 1);
  });

  test("the reply style is kept, and the effort for new websites is the one a new website starts with", async () => {
    await w.getByTestId("settings-page-agent").click();
    await w.getByTestId("reply-style").locator('[data-value="teaching"]').click();
    await until(async () => (await invoke("settings:get")).replyStyle === "teaching");
    await w.getByTestId("new-effort").locator('[data-value="high"]').click();
    await until(async () => (await invoke("settings:get")).newEffort === "high");
    await launched.capture("settings-agent");
    await w.keyboard.press("Escape");
    await until(closed);
    // No website is open: the conversation's selector shows it, before the first message.
    await until(async () => (await w.getByTestId("effort-select").inputValue()) === "high");
  });
});
