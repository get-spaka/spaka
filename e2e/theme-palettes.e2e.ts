import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PALETTES } from "../apps/desktop/src/shared/palettes.ts";
import { type LaunchedApp, launchApp } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// Palettes clicked one after another (the page follows each), with a theme
// as the real agent writes it: a Google Fonts @import whose address holds
// semicolons; and the "Site's own" palette, the agent's first colours (Q113),
// edited while it is the one shown (Q114).
const IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Fraunces:wght@500;700&display=swap');";

describe("the palettes", () => {
  let launched: LaunchedApp;
  let path: string;
  const { invoke, until, page } = previewDriver(() => launched);
  const theme = () => readFileSync(join(path, "theme.css"), "utf8");
  const primary = () =>
    page(`getComputedStyle(document.documentElement).getPropertyValue("--theme-color-primary").trim()`);
  const tile = (id: string) => launched.window.getByTestId(`palette-${id}`);
  const pressed = async (id: string) => (await tile(id).getAttribute("aria-pressed")) === "true";
  let agent: string;

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("conversation").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    path = (await invoke("projects:current")).path;
    agent = /--theme-color-primary:\s*([^;]+);/.exec(theme())![1]!.trim();
    // The fonts as the real agent loads them, with a shipped font, so the Theme tab writes its @font-face region.
    writeFileSync(
      join(path, "theme.css"),
      `${IMPORT}\n\n${theme().replace(/--theme-font-body:[^;]*;/, "--theme-font-body: 'Inter', system-ui, sans-serif;")}`,
    );
    await invoke("preview:navigate", "/");
    await until(() => page("location.pathname === '/'"));
    await launched.window.getByTestId("tab-theme").click();
    await launched.window.getByTestId("theme").waitFor();
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("the agent's colours are the \"Site's own\" palette, shown as chosen", async () => {
    await until(() => pressed("own"));
  });

  test("palettes one after another: each is written and shown", async () => {
    for (const p of PALETTES.filter((p) => p.colors["--theme-color-primary"] !== agent).slice(0, 4)) {
      await tile(p.id).click();
      const want = p.colors["--theme-color-primary"];
      await until(async () => theme().includes(want) && (await primary()) === want);
      expect(await pressed(p.id)).toBe(true);
      expect(await pressed("own")).toBe(false);
      expect(theme().startsWith(`${IMPORT}\n`)).toBe(true);
    }
  });

  test("\"Site's own\" brings the agent's colours back", async () => {
    await tile("own").click();
    await until(async () => (await primary()) === agent);
    expect(await pressed("own")).toBe(true);
  });

  const setPrimary = async (value: string) => {
    const field = launched.window.locator('[data-name="--theme-color-primary"] input:not([type])');
    await field.fill(value);
    await field.press("Enter");
    await until(async () => (await primary()) === value);
  };

  test('a colour changed while it is shown changes "Site\'s own" too', async () => {
    await setPrimary("#123456");
    expect(await pressed("own")).toBe(true);
    expect((await invoke("theme:get")).own["--theme-color-primary"]).toBe("#123456");
  });

  test("a colour changed from another palette leaves it as it was", async () => {
    await tile("forest").click();
    await until(
      async () => (await primary()) === PALETTES.find((p) => p.id === "forest")!.colors["--theme-color-primary"],
    );
    await setPrimary("#654321");
    expect((await invoke("theme:get")).own["--theme-color-primary"]).toBe("#123456");
    await tile("own").click();
    await until(async () => (await primary()) === "#123456");
  });
});
