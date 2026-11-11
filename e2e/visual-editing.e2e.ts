import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// Editing in the preview (Q90, Q91, Q99), with the recorded agent and the
// pointer and keyboard sent to the preview as input events, in the
// background: hover, select, act, edit a text in place, the shared part's
// marker, the visitor's view, the widths, and the pause while the agent works.
describe("editing in the preview", () => {
  let launched: LaunchedApp;
  let path: string;
  const { invoke, until, page, input, center, click, typeText, key, drawn, picture } = previewDriver(() => launched);
  const home = () => readFileSync(join(path, "pages/index.liquid"), "utf8");
  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("conversation").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    // The bakery has two pages: the preview went to all of them (Q131); these checks are on one.
    await invoke("preview:set-view", "page");
    path = (await invoke("projects:current")).path;
    await invoke("preview:navigate", "/");
    await until(() => page("!!document.querySelector('upstart-editor') && location.pathname === '/'"));
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("hovering outlines an element; a click selects it, and a link does not navigate", async () => {
    const { x, y } = await center("h1");
    await input([{ type: "mouseMove", x, y }]);
    await until(() => drawn(".hover"));
    await click("a[href]");
    await until(() => drawn(".bar"));
    expect(await page("location.pathname + location.hash")).toBe("/");
    expect(
      await page(`!!document.querySelector('upstart-editor').shadowRoot.querySelector('[data-testid="editor-link"]')`),
    ).toBe(true);
  });

  test("the selection's outline follows its element as the page scrolls", async () => {
    // The recorded page is short: room below it to scroll.
    await page(
      "document.body.insertAdjacentHTML('beforeend', '<div id=\"room\" style=\"height: 3000px\"></div>'), true",
    );
    await click("section:nth-of-type(2) p");
    await until(() => drawn(".selected"));
    const gap = () =>
      page(`(() => {
        const box = document.querySelector('upstart-editor').shadowRoot.querySelector('.selected').getBoundingClientRect();
        const el = document.querySelector('section:nth-of-type(2) p').getBoundingClientRect();
        return Math.abs(box.top - el.top) + Math.abs(box.left - el.left);
      })()`);
    expect(await gap()).toBeLessThan(4);
    await page("window.scrollTo(0, 250), true");
    await until(async () => (await page("window.scrollY")) > 200);
    await until(async () => (await gap()) < 4);
    await page("window.scrollTo(0, 0), document.getElementById('room').remove(), true");
    await key("Escape");
  });

  test("a text edited in place is written into the page's file", async () => {
    await click("h1", false, 2);
    await until(() => page("document.querySelector('h1').isContentEditable"));
    await key("End");
    await typeText(" & co");
    await key("Enter");
    await until(async () => /<h1[^>]*>[^<]* &amp; co<\/h1>/.test(home()));
    expect(await page("document.querySelector('h1').isContentEditable")).toBe(false);
    const entries = await invoke("history:list");
    expect(entries.at(-1)).toMatchObject({ kind: "hand", label: "Text changed" });
  });

  test("Escape gives the text back as it was", async () => {
    const before = home();
    await click("h1", false, 2);
    await until(() => page("document.querySelector('h1').isContentEditable"));
    await typeText("zzz");
    await key("Escape");
    await until(async () => !(await page("document.querySelector('h1').isContentEditable")));
    expect(await page("document.querySelector('h1').textContent")).not.toContain("zzz");
    expect(home()).toBe(before);
  });

  test("a section is reached from its content and moved down", async () => {
    const before = home();
    await click("section h2, section p");
    await until(() => drawn(".bar"));
    // Up to the section itself.
    for (let i = 0; i < 4; i++) {
      const isSection = await page(
        `!!document.querySelector('upstart-editor').shadowRoot.querySelector('[data-testid="editor-down"]')`,
      );
      if (isSection) break;
      await click('[data-testid="editor-parent"]', true);
      await new Promise((r) => setTimeout(r, 150));
    }
    await picture("editor-section-selected");
    await click('[data-testid="editor-down"]', true);
    await until(async () => home() !== before);
    const order = (src: string) => [...src.matchAll(/<section[^>]*>/g)].map((m) => m[0]);
    expect(order(home())).toEqual([order(before)[1], order(before)[0], ...order(before).slice(2)]);
  });

  test("a section dragged by its handle goes where the line shows", async () => {
    const before = home();
    const order = (src: string) => [...src.matchAll(/<section[^>]*>/g)].map((m) => m[0]);
    // The first section, reached from its heading.
    await click("section h1, section h2");
    await until(() => drawn(".bar"));
    for (let i = 0; i < 4; i++) {
      if (
        await page(`!!document.querySelector('upstart-editor').shadowRoot.querySelector('[data-testid="editor-drag"]')`)
      )
        break;
      await click('[data-testid="editor-parent"]', true);
      await new Promise((r) => setTimeout(r, 150));
    }
    const from = await center('[data-testid="editor-drag"]', true);
    const bottom = (await page(
      "Math.round(document.querySelector('section:last-of-type').getBoundingClientRect().bottom - 4)",
    )) as number;
    const steps = [0.25, 0.5, 0.75, 1].map((f) => ({
      type: "mouseMove",
      x: from.x,
      y: Math.round(from.y + (bottom - from.y) * f),
      button: "left",
      modifiers: ["leftButtonDown"],
    }));
    await input([
      { type: "mouseMove", ...from },
      { type: "mouseDown", ...from, button: "left", clickCount: 1 },
      ...steps,
    ]);
    await until(() => drawn('[data-testid="insertion-line"]'));
    await picture("editor-drag-line");
    await input([{ type: "mouseUp", x: from.x, y: bottom, button: "left", clickCount: 1 }]);
    await until(async () => home() !== before);
    const was = order(before);
    expect(order(home())).toEqual([...was.slice(1), was[0]]);
    expect(await drawn('[data-testid="insertion-line"]')).toBe(false);
  });

  test("an element of a shared part shows that it changes every page using it", async () => {
    mkdirSync(join(path, "parts"), { recursive: true });
    writeFileSync(join(path, "parts/notice.liquid"), '<p id="notice">Closed on Mondays</p>\n');
    for (const file of ["pages/index.liquid", "pages/menu.liquid"]) {
      const src = readFileSync(join(path, file), "utf8");
      writeFileSync(join(path, file), src.replace(/<body([^>]*)>/, "<body$1>\n  {% render 'notice' %}"));
    }
    await until(() => page("!!document.querySelector('#notice')"));
    await click("#notice");
    await until(() => drawn('[data-testid="editor-shared"]'));
    await picture("editor-shared-part");
    expect(
      await page(
        `document.querySelector('upstart-editor').shadowRoot.querySelector('[data-testid="editor-shared"]').textContent`,
      ),
    ).toBe("Shared part: changes every page that uses it (2 pages)");
  });

  test("in the visitor's view, a link works", async () => {
    await launched.window.getByTestId("mode-visitor").click();
    await until(
      async () => (await launched.window.getByTestId("mode-visitor").getAttribute("aria-pressed")) === "true",
    );
    try {
      await click('a[href="#hours"]');
      await until(() => page("location.hash === '#hours'"));
      expect(await drawn(".bar")).toBe(false);
    } finally {
      await launched.window.getByTestId("mode-edit").click();
    }
  });

  test("a phone and a tablet at their own size, whole in the column, upright or sideways (Q110)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
    const bounds = () => launched.app.evaluate(() => (globalThis as any).upstart.preview.view.getBounds());
    const wide = await bounds();
    const sized = async (w: number, h: number) => {
      await until(async () => (await page("innerWidth")) === w && (await page("innerHeight")) === h, 5_000);
      const b = await bounds();
      // Drawn smaller to fit, keeping the device's proportions, centred.
      expect(Math.abs(b.width / b.height - w / h)).toBeLessThan(0.02);
      expect(b.width).toBeLessThanOrEqual(w);
      expect(b.height).toBeLessThan(wide.height);
      expect(Math.abs(b.x + b.width / 2 - (wide.x + wide.width / 2))).toBeLessThanOrEqual(1);
    };
    await launched.window.getByTestId("width-phone").click();
    await sized(393, 852);
    await launched.window.getByTestId("rotate").click();
    await sized(852, 393);
    await launched.capture("preview-phone-sideways");
    await launched.window.getByTestId("width-tablet").click();
    await sized(1180, 820);
    await launched.window.getByTestId("rotate").click();
    await sized(820, 1180);
    // A page loaded anew keeps the device's size.
    await invoke("preview:reload");
    await new Promise((r) => setTimeout(r, 300));
    await sized(820, 1180);
    await launched.capture("preview-tablet");
    await launched.window.getByTestId("width-desktop").click();
    await until(async () => (await bounds()).width === wide.width);
    await until(async () => (await page("innerWidth")) === wide.width);
  });

  test("while the agent works nothing is selected; a capture for the agent leaves the drawings out", async () => {
    await invoke("preview:navigate", "/");
    await until(() => page("location.pathname === '/'"));
    // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
    await launched.app.evaluate(() => (globalThis as any).upstart.preview.setPaused(true));
    await click("h1");
    await new Promise((r) => setTimeout(r, 200));
    expect(await drawn(".bar")).toBe(false);
    // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
    await launched.app.evaluate(() => (globalThis as any).upstart.preview.setPaused(false));
    await click("h1");
    await until(() => drawn(".bar"));
    const started = Date.now();
    const shown = await launched.app.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const preview = (globalThis as any).upstart.preview;
      let during = "";
      const send = preview.send.bind(preview);
      preview.send = (m: { type: string }) => {
        send(m);
        if (m.type === "chrome") during += m.type;
      };
      await preview.capture();
      preview.send = send;
      return during;
    });
    expect(shown).toBe("chromechrome");
    expect(Date.now() - started).toBeLessThan(1000);
    await until(() => drawn(".bar"));
  });
});
