import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PALETTES } from "../apps/desktop/src/shared/palettes.ts";
import { type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

/** The checks that place or capture the preview's native view: a CI runner's hidden window does not lay it out as a screen does. */
const ON_A_SCREEN = !process.env.CI;

// The gallery (Q92, Q100, Q101), with the recorded agent: the Blocks tab lists
// the blocks drawn with the project's theme; a block added or dropped into
// the page becomes a shared part of its own, included there, undone alone.
describe("the gallery of blocks", () => {
  let launched: LaunchedApp;
  let path: string;
  const { invoke, until, page, picture } = previewDriver(() => launched);
  const home = () => readFileSync(join(path, "pages/index.liquid"), "utf8");
  type Block = { id: string; kind: string; name: string };
  let blocks: Block[];

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    // The bakery has two pages: the preview went to all of them (Q131); these checks are on one.
    await invoke("preview:set-view", "page");
    path = (await invoke("projects:current")).path;
    await invoke("preview:navigate", "/");
    await until(() => page("!!document.querySelector('spaka-editor') && location.pathname === '/'"));
    blocks = await invoke("gallery:list");
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  /** The cards a closed group shows: its first row. */
  const closed = () => {
    const kinds = new Set(blocks.map((b) => b.kind));
    return [...kinds].reduce((n, k) => n + Math.min(2, blocks.filter((b) => b.kind === k).length), 0);
  };

  test(
    "the Blocks tab shows the kinds as groups, their count and first blocks, drawn with the project's theme (Q204)",
    async () => {
      await launched.window.getByTestId("tab-blocks").click();
      const cards = launched.window.getByTestId("block");
      const groups = launched.window.getByTestId("blocks-group");
      await until(async () => (await cards.count()) === closed());
      expect(blocks.length).toBeGreaterThanOrEqual(24);
      expect(await groups.count()).toBe(new Set(blocks.map((b) => b.kind)).size);
      // The first ones on screen are drawn.
      const first = launched.window.locator('[data-testid="block"] img').first();
      await first.waitFor({ timeout: 20_000 });
      expect(await first.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
      await until(async () => (await launched.window.locator('[data-testid="block"] img').count()) >= 4, 20_000);
      await launched.capture("gallery-tab");
    },
    40_000 * SLOW,
  );

  test("a group opened shows all its blocks; a kind's chip narrows to that kind (Q204)", async () => {
    const w = launched.window;
    const cards = w.getByTestId("block");
    const biggest = Object.entries(Object.groupBy(blocks, (b) => b.kind)).sort(
      (a, b) => b[1]!.length - a[1]!.length,
    )[0]!;
    const [kind, ofKind] = [biggest[0], biggest[1]!.length];
    const group = w.locator(`[data-testid="blocks-group"][data-kind="${kind}"]`);
    expect(await group.getByTestId("block").count()).toBe(Math.min(2, ofKind));
    await group.getByTestId("blocks-group-toggle").click();
    await until(async () => (await group.getByTestId("block").count()) === ofKind);
    expect(await group.textContent()).toContain(String(ofKind));
    await group.getByTestId("blocks-group-toggle").click();
    await until(async () => (await cards.count()) === closed());
    const chip = w.locator(`[data-testid="blocks-chip"][data-kind="${kind}"]`);
    await chip.click();
    await until(async () => (await cards.count()) === ofKind);
    expect(await w.getByTestId("blocks-group").count()).toBe(1);
    expect(await chip.getAttribute("aria-pressed")).toBe("true");
    await launched.capture("gallery-chip");
    await chip.click();
    await until(async () => (await cards.count()) === closed());
  });

  test("the search bar narrows the blocks as one types, in English or French", async () => {
    const search = launched.window.getByTestId("blocks-search");
    const cards = launched.window.getByTestId("block");
    const pricing = blocks.filter((b) => b.kind === "pricing").map((b) => b.id);
    const shown = () => cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-block")));
    // Every pricing block is found, and only a few others (a price list of services).
    for (const word of ["Pricing", "tarif"]) {
      await search.fill(word);
      await until(async () => {
        const ids = await shown();
        return pricing.every((id) => ids.includes(id)) && ids.length < blocks.length / 3;
      });
    }
    await search.fill("zzzz");
    await launched.window.getByTestId("blocks-none").waitFor();
    await search.press("Escape");
    await until(async () => (await cards.count()) === closed());
  });

  test.runIf(ON_A_SCREEN)(
    "resting on a block shows it large over the top of the preview, rendered for real (Q109)",
    async () => {
      const hero = blocks.find((b) => b.kind === "hero")!;
      const peek = () =>
        launched.app.evaluate(() => {
          // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
          const u = (globalThis as any).spaka;
          const v = u.peek.view;
          return {
            shown: u.peek.shown as string | undefined,
            visible: !!v?.getVisible(),
            bounds: v?.getBounds(),
            preview: u.preview.view.getBounds(),
            top: u.win.contentView.children.at(-1) === v,
          };
        });
      await launched.window.locator(`[data-block="${hero.id}"]`).hover();
      await until(async () => (await peek()).shown === hero.id, 10_000);
      const p = await peek();
      expect(p.visible).toBe(true);
      expect(p.top).toBe(true);
      // Over the preview's column, the block on a backdrop, almost the column's width, whole and centered.
      expect(p.bounds).toEqual(p.preview);
      const card = await launched.app.evaluate(async () => {
        // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
        const contents = (globalThis as any).spaka.peek.view.webContents as Electron.WebContents;
        const zoom = contents.getZoomFactor();
        const r = await contents.executeJavaScript(
          "(() => { const r = document.getElementById('spaka-peek-card').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, vw: innerWidth, vh: innerHeight, backdrop: getComputedStyle(document.documentElement).backgroundColor }; })()",
        );
        return { ...r, zoom };
      });
      expect(card.width).toBeGreaterThan(card.vw * card.zoom - 80);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.y + card.height).toBeLessThanOrEqual(card.vh + 1);
      expect(Math.abs(card.x - (card.vw - card.width - card.x))).toBeLessThan(2);
      expect(card.backdrop).toMatch(/rgba\(9, 9, 11, 0\.55\)/);
      writeFileSync(
        join(runsDir, "peek.png"),
        Buffer.from(
          await launched.app.evaluate(async () =>
            // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
            ((await (globalThis as any).spaka.peek.view.webContents.capturePage()) as Electron.NativeImage)
              .toPNG()
              .toString("base64"),
          ),
          "base64",
        ),
      );
      // The block keeps its own colors on its card, as its thumbnail shows them.
      const banner = await launched.app.evaluate(async () => {
        // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
        const { peek } = (globalThis as any).spaka;
        await peek.show("banner-dark-event");
        return peek.view.webContents.executeJavaScript(
          "(() => { const b = document.getElementById('spaka-peek-card').firstElementChild; const probe = document.createElement('div'); probe.style.background = 'var(--color-neutral)'; document.body.append(probe); const want = getComputedStyle(probe).backgroundColor; probe.remove(); return { got: getComputedStyle(b).backgroundColor, want }; })()",
        );
      });
      expect(banner.got).toBe(banner.want);
      // A block taller than the column is scaled down to fit it, whole.
      const scaled = await launched.app.evaluate(async (_electron, id) => {
        // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
        const { peek } = (globalThis as any).spaka;
        const area = peek.view.getBounds();
        peek.setArea({ ...area, height: 200 });
        await peek.show(id);
        const contents = peek.view.webContents as Electron.WebContents;
        const r = await contents.executeJavaScript(
          "(() => { const r = document.getElementById('spaka-peek-card').getBoundingClientRect(); return { top: r.y, bottom: r.bottom, vh: innerHeight }; })()",
        );
        peek.setArea(area);
        return { ...r, zoom: contents.getZoomFactor() };
      }, hero.id);
      expect(scaled.zoom).toBeLessThan(1);
      expect(scaled.top).toBeGreaterThanOrEqual(0);
      expect(scaled.bottom).toBeLessThanOrEqual(scaled.vh + 1);
      const text = await launched.app.evaluate(() =>
        // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
        (globalThis as any).spaka.peek.view.webContents.executeJavaScript("document.body.innerText"),
      );
      expect(text.trim().length).toBeGreaterThan(20);
      // The site under it is untouched.
      expect(await page("document.body.innerText")).not.toContain(text.trim().slice(0, 40));
      await launched.window.getByTestId("tab-blocks").hover();
      await until(async () => !(await peek()).visible, 5_000);

      // In the "All pages" view too, where the page itself is parked out of sight.
      await launched.window.getByTestId("view-pages").click();
      await launched.window.getByTestId("pages-grid").waitFor();
      await launched.window.locator(`[data-block="${hero.id}"]`).hover();
      await until(async () => (await peek()).shown === hero.id, 10_000);
      const g = await peek();
      expect(g.visible).toBe(true);
      expect(g.top).toBe(true);
      const column = await launched.window.getByTestId("pages-grid").evaluate((el) => el.getBoundingClientRect().x);
      expect(g.bounds.x).toBeGreaterThanOrEqual(column);
      await launched.window.getByTestId("tab-blocks").hover();
      await until(async () => !(await peek()).visible, 5_000);
      await launched.window.getByTestId("view-page").click();
    },
  );

  test("a block added goes where its kind usually goes, as a part of its own", async () => {
    const before = home();
    const cta = blocks.find((b) => b.kind === "cta")!;
    await invoke("gallery:add", cta.id);
    await until(async () => home() !== before);
    expect(home()).toContain(`{% render '${cta.id}' %}`);
    expect(existsSync(join(path, `parts/${cta.id}.liquid`))).toBe(true);
    const entries = await invoke("history:list");
    expect(entries.at(-1)).toMatchObject({ kind: "hand", label: "Block added" });
    // The page shows it.
    await until(() => page(`!!document.querySelector('[data-spaka-src^="parts/${cta.id}.liquid"]')`));
    // Added again: a second, independent part.
    await invoke("gallery:add", cta.id);
    await until(async () => home().includes(`{% render '${cta.id}-2' %}`));
  });

  test("a block dropped into the page, from visitor mode, goes where the line shows", async () => {
    const before = home();
    const hero = blocks.find((b) => b.kind === "features")!;
    // The drag the Blocks tab starts, as it reaches the page: below the middle of the first section.
    const drag = (type: string) => `(() => {
      const first = document.querySelector('main > *, body > section');
      const r = first.getBoundingClientRect();
      const data = new DataTransfer();
      data.setData('application/x-spaka-block', ${JSON.stringify(hero.id)});
      const event = new DragEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, dataTransfer: data,
        clientX: 200, clientY: Math.round(Math.min(r.bottom - 2, r.top + r.height * 0.75)) });
      return !document.elementFromPoint(200, 10).dispatchEvent(event);
    })()`;
    // The preview is in visitor mode (Q253); the drag puts it in edit mode by itself (Q254).
    const pressed = (mode: string) => launched.window.getByTestId(`mode-${mode}`).getAttribute("aria-pressed");
    expect(await pressed("visitor")).toBe("true");
    expect(await page(drag("dragover"))).toBe(true);
    await until(async () => (await pressed("edit")) === "true");
    await until(() =>
      page(
        "getComputedStyle(document.querySelector('spaka-editor').shadowRoot.querySelector('[data-testid=insertion-line]')).display !== 'none'",
      ),
    );
    await picture("gallery-drop-line");
    await page(drag("drop"));
    await until(async () => home() !== before);
    // Right after the first section of the page.
    const order = [...home().matchAll(/^\s*(<\w+|\{%-? render '[\w-]+')/gm)].map((m) => m[1]);
    const at = order.indexOf(`{% render '${hero.id}'`);
    expect(at).toBeGreaterThan(0);
  });

  test("undo takes the dropped block away, part and all", async () => {
    const hero = blocks.find((b) => b.kind === "features")!;
    await invoke("history:undo");
    await until(async () => !home().includes(`{% render '${hero.id}' %}`));
    expect(existsSync(join(path, `parts/${hero.id}.liquid`))).toBe(false);
  });

  test(
    "every block reads well with a light, a warm and a dark palette",
    async () => {
      const failures: string[] = [];
      for (const id of ["paper", "bakery", "midnight"]) {
        const colors = PALETTES.find((p) => p.id === id)!.colors;
        const css = `:root {\n${Object.entries(colors)
          .map(([k, v]) => `  ${k}: ${v};`)
          .join(
            "\n",
          )}\n  --theme-font-heading: Georgia, serif;\n  --theme-font-body: system-ui, sans-serif;\n  --theme-radius: 0.75rem;\n}\n`;
        writeFileSync(join(path, "theme.css"), css);
        const origin = await launched.app.evaluate(
          // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
          () => (globalThis as any).spaka.preview.origin as string,
        );
        await until(async () =>
          (await (await fetch(`${origin}/theme.css`)).text()).includes(colors["--theme-color-primary"]),
        );
        const found = (await launched.app.evaluate(
          async ({ BrowserWindow }, { ids, origin, check }) => {
            const win = new BrowserWindow({
              show: false,
              width: 1280,
              height: 900,
              webPreferences: { offscreen: true },
            });
            const out: string[] = [];
            try {
              for (const id of ids) {
                await win.loadURL(`${origin}/__spaka/block/${id}`);
                out.push(...((await win.webContents.executeJavaScript(check)) as string[]).map((f) => `${id}: ${f}`));
              }
            } finally {
              win.destroy();
            }
            return out;
          },
          { ids: blocks.map((b) => b.id), origin, check: CONTRAST_CHECK },
        )) as string[];
        failures.push(...found.map((f) => `[${id}] ${f}`));
      }
      writeFileSync(join(__dirname, ".runs/gallery-contrast.txt"), failures.join("\n"));
      expect(failures).toEqual([]);
    },
    120_000 * SLOW,
  );
});

/**
 * In a block's page, once Tailwind has styled it: every text against what is
 * really behind it (backgrounds composed up the tree), at WCAG's thresholds.
 */
const CONTRAST_CHECK = `new Promise((done) => {
  const started = Date.now();
  const styled = () => [...document.querySelectorAll("style")].some((s) => !s.hasAttribute("data-spaka-runtime") && s.textContent.length > 0);
  const wait = () => styled() || Date.now() - started > 3000 ? requestAnimationFrame(() => requestAnimationFrame(() => done(check()))) : setTimeout(wait, 30);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "rgba(0,0,0,0)"; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const behind = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage !== "none") return undefined;
      const c = rgba(s.backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 0.999) break;
    }
    let base = [255, 255, 255, 1];
    for (const layer of layers.reverse()) base = layer[3] >= 0.999 ? layer : over(layer, base);
    return base;
  };
  const check = () => {
    const out = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (el.closest("svg")) continue;
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join("").trim();
      const box = el.getBoundingClientRect();
      // Not seen: hidden, or there for screen readers only.
      if (!text || box.width <= 1 || box.height <= 1) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.webkitTextFillColor === "rgba(0, 0, 0, 0)") continue;
      const bg = behind(el);
      if (!bg) continue;
      let opacity = 1;
      for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
      // Not seen either: a closed menu daisyUI keeps in place, transparent.
      if (opacity < 0.05) continue;
      const fg = rgba(s.color);
      fg[3] *= opacity;
      const r = ratio(over(fg, bg), bg);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.6 && Number(s.fontWeight) >= 700);
      if (r < (large ? 3 : 4.5)) out.push(el.localName + " " + JSON.stringify(text.slice(0, 30)) + " " + r.toFixed(2));
    }
    return out;
  };
  wait();
})`;
