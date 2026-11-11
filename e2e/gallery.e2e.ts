import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PALETTES } from "../apps/desktop/src/shared/palettes.ts";
import { type LaunchedApp, launchApp } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

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
    await launched.window.getByTestId("conversation").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    path = (await invoke("projects:current")).path;
    await invoke("preview:navigate", "/");
    await until(() => page("!!document.querySelector('upstart-editor') && location.pathname === '/'"));
    blocks = await invoke("gallery:list");
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("the Blocks tab shows every block by kind, drawn with the project's theme", async () => {
    await launched.window.getByTestId("tab-blocks").click();
    const cards = launched.window.getByTestId("block");
    await until(async () => (await cards.count()) === blocks.length);
    expect(blocks.length).toBeGreaterThanOrEqual(24);
    // The first ones on screen are drawn.
    const first = launched.window.locator('[data-testid="block"] img').first();
    await first.waitFor({ timeout: 20_000 });
    expect(await first.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    await until(async () => (await launched.window.locator('[data-testid="block"] img').count()) >= 4, 20_000);
    await launched.window.screenshot({ path: join(__dirname, ".runs/gallery-tab.png") });
  }, 40_000);

  test("the search bar narrows the blocks as one types, in English or French", async () => {
    const search = launched.window.getByTestId("blocks-search");
    const cards = launched.window.getByTestId("block");
    await search.fill("Pricing");
    await until(async () => (await cards.count()) < blocks.length);
    const pricing = blocks.filter((b) => b.kind === "pricing").length;
    expect(await cards.count()).toBe(pricing);
    await search.fill("tarif");
    await until(async () => (await cards.count()) === pricing);
    await search.fill("zzzz");
    await launched.window.getByTestId("blocks-none").waitFor();
    await search.press("Escape");
    await until(async () => (await cards.count()) === blocks.length);
  });

  test("resting on a block shows it large over the top of the preview, rendered for real (Q109)", async () => {
    const hero = blocks.find((b) => b.kind === "hero")!;
    const peek = () =>
      launched.app.evaluate(() => {
        // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
        const u = (globalThis as any).upstart;
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
    // Inside the preview, near its top, almost its width.
    expect(p.bounds.x).toBeGreaterThan(p.preview.x);
    expect(p.bounds.x + p.bounds.width).toBeLessThan(p.preview.x + p.preview.width);
    expect(p.bounds.width).toBeGreaterThan(p.preview.width - 40);
    expect(p.bounds.y - p.preview.y).toBeLessThan(20);
    expect(p.bounds.height).toBeGreaterThan(100);
    const text = await launched.app.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (globalThis as any).upstart.peek.view.webContents.executeJavaScript("document.body.innerText"),
    );
    expect(text.trim().length).toBeGreaterThan(20);
    // The site under it is untouched.
    expect(await page("document.body.innerText")).not.toContain(text.trim().slice(0, 40));
    await launched.window.getByTestId("tab-blocks").hover();
    await until(async () => !(await peek()).visible, 5_000);
  });

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
    await until(() => page(`!!document.querySelector('[data-up-src^="parts/${cta.id}.liquid"]')`));
    // Added again: a second, independent part.
    await invoke("gallery:add", cta.id);
    await until(async () => home().includes(`{% render '${cta.id}-2' %}`));
  });

  test("a block dropped into the page goes where the line shows", async () => {
    const before = home();
    const hero = blocks.find((b) => b.kind === "features")!;
    // The drag the Blocks tab starts, as it reaches the page: below the middle of the first section.
    const drag = (type: string) => `(() => {
      const first = document.querySelector('main > *, body > section');
      const r = first.getBoundingClientRect();
      const data = new DataTransfer();
      data.setData('application/x-upstart-block', ${JSON.stringify(hero.id)});
      const event = new DragEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, dataTransfer: data,
        clientX: 200, clientY: Math.round(Math.min(r.bottom - 2, r.top + r.height * 0.75)) });
      return !document.elementFromPoint(200, 10).dispatchEvent(event);
    })()`;
    expect(await page(drag("dragover"))).toBe(true);
    await until(() =>
      page(
        "getComputedStyle(document.querySelector('upstart-editor').shadowRoot.querySelector('[data-testid=insertion-line]')).display !== 'none'",
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

  test("every block reads well with a light, a warm and a dark palette", async () => {
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
        () => (globalThis as any).upstart.preview.origin as string,
      );
      await until(async () =>
        (await (await fetch(`${origin}/theme.css`)).text()).includes(colors["--theme-color-primary"]),
      );
      const found = (await launched.app.evaluate(
        async ({ BrowserWindow }, { ids, origin, check }) => {
          const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { offscreen: true } });
          const out: string[] = [];
          try {
            for (const id of ids) {
              await win.loadURL(`${origin}/__up/block/${id}`);
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
  }, 120_000);
});

/**
 * In a block's page, once Tailwind has styled it: every text against what is
 * really behind it (backgrounds composed up the tree), at WCAG's thresholds.
 */
const CONTRAST_CHECK = `new Promise((done) => {
  const started = Date.now();
  const styled = () => [...document.querySelectorAll("style")].some((s) => !s.hasAttribute("data-up-runtime") && s.textContent.length > 0);
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
