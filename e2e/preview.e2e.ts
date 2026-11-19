import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, MAC, runsDir, SLOW } from "./app.ts";

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
    timeout *= SLOW;
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

  test("a reload while a page is being opened, as new scripts ask, opens that page rather than the one before", async () => {
    await launched.app.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const preview = (globalThis as any).upstart.preview;
      const going = preview.navigate("/menu", true);
      preview.reload();
      await going;
    });
    await until("location.pathname === '/menu' && document.querySelector('h1')?.textContent === 'Our breads'");
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

  test("the menus' shortcuts do what the buttons do: tabs, screens, modes, all pages, publish (Q335)", async () => {
    const w = launched.window;
    const menuItem = (accelerator: string) =>
      launched.app.evaluate(({ Menu }, accelerator) => {
        const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
          for (const i of items) {
            if (i.accelerator === accelerator) return i;
            const inner = i.submenu && find(i.submenu.items);
            if (inner) return inner;
          }
        };
        find(Menu.getApplicationMenu()?.items ?? [])?.click();
      }, accelerator);
    const pressed = (testid: string) => w.getByTestId(testid).getAttribute("aria-pressed");
    await menuItem("CommandOrControl+2");
    await expect.poll(() => w.getByTestId("tab-blocks").getAttribute("aria-selected")).toBe("true");
    await menuItem("CommandOrControl+1");
    await expect.poll(() => w.getByTestId("tab-conversation").getAttribute("aria-selected")).toBe("true");
    await menuItem("Alt+CommandOrControl+3");
    await expect.poll(() => pressed("width-phone")).toBe("true");
    await menuItem("Alt+CommandOrControl+1");
    await expect.poll(() => pressed("width-desktop")).toBe("true");
    await menuItem("Alt+CommandOrControl+V");
    await expect.poll(() => pressed("mode-visitor")).toBe("true");
    await menuItem("Alt+CommandOrControl+E");
    await expect.poll(() => pressed("mode-edit")).toBe("true");
    await menuItem("Shift+CommandOrControl+A");
    await expect.poll(() => pressed("view-pages")).toBe("true");
    await menuItem("Shift+CommandOrControl+A");
    await expect.poll(() => pressed("view-page")).toBe("true");
    await menuItem("Shift+CommandOrControl+P");
    await w.getByTestId("export-dialog").waitFor();
    await w.getByTestId("export-close").click();
    await w.getByTestId("export-dialog").waitFor({ state: "detached" });
    // The bar's buttons say their shortcut in their tooltip (Q329).
    await w.getByTestId("width-phone").hover();
    await expect.poll(() => w.getByTestId("tip").textContent()).toContain(MAC ? "⌥⌘3" : "Ctrl+Alt+3");
    // Below the button, drawn over the page's native view by a view of its own.
    expect(await w.getByTestId("tip").getAttribute("data-side")).toBe("bottom");
    await expect
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      .poll(() => launched.app.evaluate(() => (globalThis as any).upstart.tips.shown))
      .toContain("Phone");
    const tip = await launched.app.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const { view } = (globalThis as any).upstart.tips;
      return { bounds: view.getBounds(), png: (await view.webContents.capturePage()).toPNG().toString("base64") };
    });
    writeFileSync(join(runsDir, "tooltip-over-page.png"), Buffer.from(tip.png, "base64"));
    expect(tip.bounds.height).toBeGreaterThan(20);
    // A long one goes onto several lines, as the interface lays it out.
    await w.getByTestId("mode-edit").hover();
    await expect
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      .poll(() => launched.app.evaluate(() => (globalThis as any).upstart.tips.shown))
      .toContain("Edit the page");
    const long = await launched.app.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const { view } = (globalThis as any).upstart.tips;
      await new Promise((r) => setTimeout(r, 200));
      const lines = await view.webContents.executeJavaScript(
        "Math.round(document.querySelector('#tip span').getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('#tip')).lineHeight))",
      );
      return { lines, png: (await view.webContents.capturePage()).toPNG().toString("base64") };
    });
    writeFileSync(join(runsDir, "tooltip-over-page-long.png"), Buffer.from(long.png, "base64"));
    expect(long.lines).toBeGreaterThan(1);
    // Radix keeps it while the pointer may be on its way to it: the next move closes it.
    await w.mouse.move(400, 500, { steps: 4 });
    await w.mouse.move(410, 520);
    // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
    await expect.poll(() => launched.app.evaluate(() => (globalThis as any).upstart.tips.shown)).toBeUndefined();
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
    const listed = () => launched.window.getByTestId("project-item").allTextContents();
    // The new website, changed by nothing yet, is the latest: it comes first (Q393).
    await expect.poll(listed).toEqual(["Second", "Chez Margot"]);
    await launched.window.getByTestId("project-item").filter({ hasText: "Chez Margot" }).click();
    await until("document.title.length > 0 && location.pathname === '/'");
    const started = Date.now();
    while (!(await visible()) && Date.now() - started < 3000) await new Promise((r) => setTimeout(r, 50));
    expect(await visible()).toBe(true);
    // Its pages were written after it first opened: reopened, it records them, and its website is the latest changed.
    await expect.poll(listed).toEqual(["Chez Margot", "Second"]);
    // Opening a website changes nothing of it: it does not move.
    for (const name of ["Second", "Chez Margot"]) {
      await launched.window.getByTestId("project-item").filter({ hasText: name }).click();
      await expect
        .poll(() =>
          // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
          launched.window.evaluate(() => (window as any).upstart.invoke("projects:current").then((p: any) => p?.name)),
        )
        .toBe(name);
      await new Promise((r) => setTimeout(r, 300));
      expect(await listed()).toEqual(["Chez Margot", "Second"]);
    }
    await until("document.title.length > 0 && location.pathname === '/'");
  });

  test("the projects in the order chosen beside their heading (Q394, Q395)", async () => {
    const w = launched.window;
    const listed = () => w.getByTestId("project-item").allTextContents();
    const choose = async (order: string) => {
      await w.getByTestId("project-order").click();
      const choice = w.locator(`[data-testid="project-order-choice"][data-order="${order}"]`);
      await choice.waitFor();
      const label = await choice.textContent();
      await choice.click();
      // The button names the order chosen once it is applied.
      await expect
        .poll(() => w.getByTestId("project-order").getAttribute("aria-label"))
        .toBe(`Sort the projects: ${label}`);
    };
    // From the default order, also on a retry.
    await w.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      (window as any).upstart.invoke("settings:set", { projectOrder: "updated" }),
    );
    await w.getByTestId("project-order").click();
    await expect(w.getByTestId("project-order-choice").allTextContents()).resolves.toEqual([
      "Last updated",
      "Name A–Z",
      "Date created",
    ]);
    await expect
      .poll(() => w.locator('[data-testid="project-order-choice"][data-order="updated"]').getAttribute("aria-checked"))
      .toBe("true");
    await new Promise((r) => setTimeout(r, 400));
    await w.screenshot({
      path: join(runsDir, "project-order-menu.png"),
      clip: { x: 0, y: 0, width: 480, height: 320 },
    });
    await w.keyboard.press("Escape");
    await choose("name");
    await expect.poll(listed).toEqual(["Chez Margot", "Second"]);
    await choose("created");
    await expect.poll(listed).toEqual(["Second", "Chez Margot"]);
    // Kept with the app's settings.
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      w.evaluate(() => (window as any).upstart.invoke("settings:get").then((s: any) => s.projectOrder)),
    ).resolves.toBe("created");
    await choose("updated");
    await expect.poll(listed).toEqual(["Chez Margot", "Second"]);
  });
});
