import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";

const page = (title: string, body: string) =>
  `<!doctype html>\n<html lang="en">\n<head><title>${title}</title></head>\n<body>\n{% render 'header' %}\n${body}\n</body>\n</html>\n`;

describe("a project folder in the preview", () => {
  let launched: LaunchedApp;
  let folder: string;

  /** Runs code in the preview's page and returns its value. */
  const inPage = (code: string) =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, code) => (globalThis as any).upstart.preview.view.webContents.executeJavaScript(code),
      code,
    );
  const until = async (code: string, timeout = 5000) => {
    const started = Date.now();
    for (;;) {
      const value = await inPage(code).catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${code}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("message-input").waitFor();
    const project = await launched.window.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).upstart.invoke("projects:create", "Chez Margot"),
    );
    folder = project.path;
  });
  afterAll(async () => {
    await launched?.close();
  });

  test("a new project opens on an empty page", async () => {
    await expect(launched.window.getByTestId("project-name").textContent()).resolves.toBe("Chez Margot");
    await until("document.readyState === 'complete' && !!document.getElementById('up-theme')");
    await expect(inPage("document.body.children.length")).resolves.toBe(0);
  });

  test("files written into the folder appear, styled, without a reload", async () => {
    await inPage("window.__sameDocument = true");
    writeFileSync(
      join(folder, "theme.css"),
      ":root { --theme-color-primary: #b45309; --theme-color-surface: #fffbeb; }\n",
    );
    mkdirSync(join(folder, "parts"));
    mkdirSync(join(folder, "pages"));
    writeFileSync(
      join(folder, "parts/header.liquid"),
      `<header class="navbar bg-base-200"><a href="/menu" class="btn btn-ghost">Menu</a></header>\n`,
    );
    writeFileSync(
      join(folder, "pages/index.liquid"),
      page(
        "Chez Margot",
        `<main><section class="hero"><h1 class="text-5xl font-bold text-primary">Bread since 1952</h1></section></main>`,
      ),
    );
    await until("document.querySelector('h1')?.textContent === 'Bread since 1952'");
    await expect(inPage("window.__sameDocument")).resolves.toBe(true);
    await expect(inPage("document.querySelector('h1').dataset.upSrc")).resolves.toMatch(/^pages\/index.liquid:6:\d+$/);
    await expect(inPage("document.title")).resolves.toBe("Chez Margot");
    await until("getComputedStyle(document.querySelector('h1')).color === 'rgb(180, 83, 9)'");
    // Tailwind's browser build styles what the morph added (text-5xl).
    await until("getComputedStyle(document.querySelector('h1')).fontSize === '48px'");
    mkdirSync(runsDir, { recursive: true });
    const png = await launched.app.evaluate(async () =>
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      ((await (globalThis as any).upstart.preview.capture()) as Buffer).toString("base64"),
    );
    writeFileSync(join(runsDir, "preview.png"), Buffer.from(png, "base64"));
    const window = await launched.capture("preview-window");
    expect(window).toMatch(/png$/);
  });

  test("the theme changes in place", async () => {
    writeFileSync(join(folder, "theme.css"), ":root { --theme-color-primary: #1d4ed8; }\n");
    await until("getComputedStyle(document.querySelector('h1')).color === 'rgb(29, 78, 216)'");
    await expect(inPage("window.__sameDocument")).resolves.toBe(true);
  });

  test("the pages are listed and reachable, links included", async () => {
    writeFileSync(join(folder, "pages/menu.liquid"), page("Menu", `<main><h1>Our breads</h1></main>`));
    await expect
      .poll(() => launched.window.getByTestId("page-select").locator("option").allTextContents())
      .toEqual(["/", "/menu"]);
    // The preview opens in the visitor's view (Q253), where a link is followed; in the edit mode it selects (Q99).
    expect(await launched.window.getByTestId("mode-visitor").getAttribute("aria-pressed")).toBe("true");
    await launched.window.getByTestId("mode-visitor").click();
    await inPage("document.querySelector('header a').click()");
    await until("location.pathname === '/menu' && document.querySelector('h1')?.textContent === 'Our breads'");
    await launched.window.getByTestId("mode-edit").click();
    await expect.poll(() => launched.window.getByTestId("page-select").inputValue()).toBe("/menu");
    await launched.window.getByTestId("page-select").selectOption("/");
    await until("location.pathname === '/' && document.querySelector('h1')?.textContent === 'Bread since 1952'");
  });

  test("the agent looks at a page in a view of its own: the maker's preview does not move (Q314, Q315)", async () => {
    const look = (route?: string, options: object = {}) =>
      launched.app.evaluate(
        async (_electron, { route, options }) => {
          // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
          const seen = await (globalThis as any).upstart.preview.look(route, options);
          // A PNG's width and height, from its header.
          const size = seen.png && { width: seen.png.readUInt32BE(16), height: seen.png.readUInt32BE(20) };
          return { route: seen.route, screen: seen.screen, size, notes: seen.notes };
        },
        { route, options },
      );
    await launched.window.getByTestId("page-select").selectOption("/");
    await until("location.pathname === '/'");
    await inPage("window.__notMoved = true");
    await expect(look("/menu")).resolves.toMatchObject({
      route: "/menu",
      screen: "desktop",
      size: { width: 1440, height: 900 },
    });
    await expect(look("/nowhere")).resolves.toMatchObject({
      route: "/menu",
      notes: ["No page has the address /nowhere."],
    });
    // With no address, the page it last looked at in this turn, on the same screen.
    await expect(look()).resolves.toMatchObject({ route: "/menu", screen: "desktop" });
    await expect(look("/menu", { screen: "phone" })).resolves.toMatchObject({
      screen: "phone",
      size: { width: 786, height: 1704 },
    });
    await expect(look(undefined, { screen: "tablet" })).resolves.toMatchObject({
      route: "/menu",
      size: { width: 820, height: 1180 },
    });
    // Asked at once, as the agent may: each answered, with its page's picture.
    const all = await launched.app.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const preview = (globalThis as any).upstart.preview;
      const seen = await Promise.all(["/", "/menu", "/"].map((r) => preview.look(r)));
      return seen.map((s: { route: string; png?: Buffer }) => [s.route, !!s.png]);
    });
    expect(all).toEqual([
      ["/", true],
      ["/menu", true],
      ["/", true],
    ]);
    // The maker's preview stayed on its page, the same document.
    await expect(inPage("location.pathname + ' ' + window.__notMoved")).resolves.toBe("/ true");
    // The turn over, a look with no address starts again from the page the maker sees.
    await launched.app.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (globalThis as any).upstart.preview.endTurn(),
    );
    await expect(look()).resolves.toMatchObject({ route: "/", screen: "desktop" });
  });

  test("a page cannot leave the preview, open windows or reach the app", async () => {
    await inPage("window.open('https://example.com'); location.href = 'https://example.com'; 1");
    await new Promise((r) => setTimeout(r, 500));
    await expect(inPage("location.origin.startsWith('http://127.0.0.1')")).resolves.toBe(true);
    await expect(inPage("typeof window.upstart + typeof window.require + typeof window.Idiomorph")).resolves.toBe(
      "undefinedundefinedundefined",
    );
  });

  test("the project is listed and reopens, its page shown", async () => {
    await expect(launched.window.getByTestId("project-item").allTextContents()).resolves.toEqual(["Chez Margot"]);
    const visible = () =>
      launched.app.evaluate(() =>
        // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
        (globalThis as any).upstart.preview.view.getVisible(),
      );
    expect(await visible()).toBe(true);
    // Another project, then back to this one from the list.
    await launched.window.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).upstart.invoke("projects:create", "Second"),
    );
    await launched.window.getByTestId("project-item").filter({ hasText: "Chez Margot" }).click();
    await until("document.title.length > 0 && location.pathname === '/'");
    const started = Date.now();
    while (!(await visible()) && Date.now() - started < 3000) await new Promise((r) => setTimeout(r, 50));
    expect(await visible()).toBe(true);
  });
});
