import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PALETTES } from "../apps/desktop/src/shared/palettes.ts";
import { type LaunchedApp, launchApp } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// The Theme tab (Q93), with the recorded agent: a palette, a colour, the
// roundness and a font, each written into theme.css in place as one version;
// the page follows during a gesture; a shipped font is copied into the
// project and exported with it.
describe("the theme", () => {
  let launched: LaunchedApp;
  let path: string;
  const { invoke, until, page } = previewDriver(() => launched);
  const theme = () => readFileSync(join(path, "theme.css"), "utf8");
  const shown = (name: string) =>
    page(`getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(name)}).trim()`);
  const tab = () => launched.window.getByTestId("theme");

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("conversation").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    path = (await invoke("projects:current")).path;
    await invoke("preview:navigate", "/");
    await until(() => page("location.pathname === '/'"));
    await launched.window.getByTestId("tab-theme").click();
    await tab().waitFor();
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("the tab shows the theme the agent wrote", async () => {
    const primary = tab().locator('[data-name="--theme-color-primary"] input:not([type])');
    await until(async () => (await primary.inputValue()) === "#9a3412");
    expect(await launched.window.getByTestId("font-heading").inputValue()).toBe("");
  });

  test("a palette is written in place, as one version, and shown", async () => {
    const before = theme();
    await launched.window.getByTestId("palette-forest").click();
    const forest = PALETTES.find((p) => p.id === "forest")!.colors;
    await until(async () => theme().includes(forest["--theme-color-primary"]));
    // The fonts and the radius the agent chose are still there, where they were.
    for (const line of before.split("\n").filter((l) => /--theme-(font|radius)/.test(l)))
      expect(theme()).toContain(line);
    expect((await invoke("history:list")).at(-1)).toMatchObject({ kind: "hand", label: "Theme changed" });
    await until(async () => (await shown("--theme-color-primary")) === forest["--theme-color-primary"]);
    expect(await launched.window.getByTestId("palette-forest").getAttribute("aria-pressed")).toBe("true");
  });

  test("during a gesture the page follows; the file waits for its end", async () => {
    const before = theme();
    await invoke("theme:show", { "--theme-color-primary": "#123456" });
    await until(async () => (await shown("--theme-color-primary")) === "#123456");
    expect(theme()).toBe(before);
    // The slider: moved, then let go.
    await launched.window.getByTestId("radius").fill("1.5");
    await until(async () => theme().includes("--theme-radius: 1.5rem"));
  });

  test("a text colour hard to read on its background is flagged", async () => {
    const row = tab().locator('[data-name="--theme-color-primary-content"] input[type="color"]');
    const primary = await tab().locator('[data-name="--theme-color-primary"] input:not([type])').inputValue();
    await row.fill(primary);
    await until(() =>
      tab().locator('[data-name="--theme-color-primary-content"] [data-testid="contrast-warning"]').count(),
    );
  });

  test("the tab, as the maker sees it", async () => {
    await launched.window.screenshot({ path: join(__dirname, ".runs/theme-tab.png") });
  });

  test("a shipped font is copied into the project, served, and exported", async () => {
    await launched.window.getByTestId("font-heading").selectOption("fraunces");
    await until(async () => theme().includes('--theme-font-heading: "Fraunces"'));
    expect(theme()).toContain('src: url("/fonts/fraunces/normal.woff2") format("woff2")');
    expect(existsSync(join(path, "fonts/fraunces/normal.woff2"))).toBe(true);
    await until(() => page("document.fonts.load('700 32px Fraunces').then((f) => f.length > 0)"));
    expect(await page("getComputedStyle(document.querySelector('h1')).fontFamily")).toMatch(/^"?Fraunces/);
    const out = mkdtempSync(join(tmpdir(), "upstart-export-"));
    await invoke("export:run", out, "static");
    expect(existsSync(join(out, "fonts/fraunces/normal.woff2"))).toBe(true);
  });

  test("undo takes the font away again", async () => {
    await invoke("history:undo");
    await until(async () => !theme().includes("Fraunces"));
    expect(existsSync(join(path, "fonts/fraunces/normal.woff2"))).toBe(false);
  });
});
