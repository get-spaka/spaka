import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { shotPages, writeAnimatedWebp, writeWebp } from "../apps/desktop/src/main/templates/pictures.ts";
import { projectFiles, readTemplateFolder } from "../apps/desktop/src/main/templates/reader.ts";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// `pnpm template:shoot <folder>` (Q232): the template's pictures, taken in the
// app, in the background, as visitors see it, moving — each page at desktop and phone
// width, whole, the home page's first screen as its cover, and a short
// animated sequence of it for the start screen's hover — written into its
// pictures/, and a review sheet in e2e/.runs/template-sheets/.
const dir = process.env.UPSTART_TEMPLATE_SHOOT ?? "";
const DEVICES = [
  { name: "desktop", width: 1440, height: 900, out: 1200 },
  { name: "phone", width: 390, height: 844, out: 780 },
] as const;
const HOVER = { width: 640, frames: 14, every: 110, scroll: 14 };
/** A page is photographed down to this height, in slices of this many pixels. */
const PAGE_MAX = 16_000;
const SLICE = 2400;

describe.skipIf(!dir)("a template's pictures", () => {
  let launched: LaunchedApp;
  let origin: string;
  const { invoke, until } = previewDriver(() => launched);
  const files = dir ? readTemplateFolder(dir) : new Map();
  const id = JSON.parse(files.get("template.json")?.toString("utf8") ?? "{}").id as string;

  /**
   * A page in a window of its own, never shown (the app's checks keep hidden
   * windows painting and animating), moving as in visitor mode; `act` pictures it.
   */
  const inWindow = (route: string, device: { width: number; height: number }, act: string) =>
    launched.app.evaluate(
      async ({ BrowserWindow }, { url, device, act }) => {
        const win = new BrowserWindow({
          show: false,
          width: device.width,
          height: device.height,
          useContentSize: true,
          enableLargerThanScreen: true,
          webPreferences: { backgroundThrottling: false },
        });
        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const js = (code: string) => win.webContents.executeJavaScript(code);
        const png = async (rect?: { x: number; y: number; width: number; height: number }) =>
          (await win.webContents.capturePage(rect)).toPNG().toString("base64");
        const resize = async (height: number) => win.setContentSize(device.width, height);
        try {
          await win.loadURL(url);
          // Visitor mode, as the preview's own script sets it.
          await js(
            "document.documentElement.setAttribute('data-up-moving', ''); window.__upStart && window.__upStart.go()",
          );
          for (let i = 0; i < 100 && !(await js("!window.__upStart || window.__upStart.started")); i++) await wait(50);
          await js("document.fonts.ready.then(() => true)");
          // biome-ignore lint/security/noGlobalEval: the step, written by the check itself
          return await eval(act)({ wait, js, png, resize });
        } finally {
          win.destroy();
        }
      },
      { url: new URL(route, origin).toString(), device, act },
    );

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("conversation").waitFor();
    // A copy of it, opened as a site: the template's folder stays as it is.
    const copy = join(launched.projectsDir, id);
    mkdirSync(copy, { recursive: true });
    for (const [path, bytes] of projectFiles(files)) {
      mkdirSync(join(copy, path, ".."), { recursive: true });
      writeFileSync(join(copy, path), bytes);
    }
    const project = await launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, path) => (globalThis as any).upstart.projects.openFolder(path),
      copy,
    );
    await invoke("projects:open", project.id);
    origin = (await until(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      launched.app.evaluate(() => (globalThis as any).upstart.preview.origin as string),
    )) as string;
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("each page at desktop and phone width, its cover and its hover sequence", async () => {
    const routes = shotPages(files);
    expect(routes.length).toBeGreaterThan(0);
    const pictures = join(dir, "pictures");
    rmSync(pictures, { recursive: true, force: true });
    mkdirSync(join(pictures, "pages"), { recursive: true });
    const webp = (png: string | string[], width: number, path: string) =>
      writeWebp(
        Array.isArray(png) ? png.map((p) => Buffer.from(p, "base64")) : Buffer.from(png, "base64"),
        width,
        join(dir, path),
      );

    const shots: { route: string; desktop: string; phone: string }[] = [];
    for (const { route, name } of routes) {
      const shot = { route, desktop: "", phone: "" };
      for (const device of DEVICES) {
        // The page whole, in slices (a window, and a capture, have a largest
        // size): the window a slice tall, scrolled down the page a slice at a
        // time, each part given time to rise; writeWebp puts them back together.
        // What stays in place while the page scrolls (sticky) is let go, or it
        // would be in every slice.
        const slices = (await inWindow(
          route,
          device,
          `async ({ wait, js, png, resize }) => {
            await wait(600);
            await js("for (const el of document.querySelectorAll('*')) if (getComputedStyle(el).position === 'sticky') el.style.position = 'static'");
            // The page's height once its images have come, for an image of no set size.
            await js("Promise.race([Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((done) => { i.addEventListener('load', done); i.addEventListener('error', done); }))), new Promise((done) => setTimeout(done, 8000))])");
            const tall = Math.min(await js("document.documentElement.scrollHeight"), ${PAGE_MAX});
            const view = Math.min(tall, ${SLICE});
            await resize(view);
            await wait(1200);
            const slices = [];
            for (let y = 0; y < tall; y += view) {
              const top = Math.min(y, tall - view);
              await js("scrollTo({ top: " + top + ", behavior: 'instant' })");
              await wait(1800);
              slices.push(await png({ x: 0, y: y - top, width: ${device.width}, height: Math.min(view, tall - y) }));
            }
            return slices;
          }`,
        )) as string[];
        const path = `pictures/pages/${name}-${device.name}.webp`;
        await webp(slices, device.out, path);
        shot[device.name] = path;
      }
      shots.push(shot);
    }

    // The cover: the home page's first screen, once it has moved.
    const cover = (await inWindow(
      "/",
      DEVICES[0],
      "async ({ wait, png }) => { await wait(2400); return png(); }",
    )) as string;
    await webp(cover, 1200, "pictures/cover.webp");

    // The hover: the first screen as it comes in, then a slow scroll down it.
    const frames = (await inWindow(
      "/",
      DEVICES[0],
      `async ({ wait, js, png }) => {
        const frames = [];
        for (let i = 0; i < ${HOVER.frames}; i++) { frames.push(await png()); await wait(${HOVER.every}); }
        const end = Math.max(0, Math.min(await js("document.documentElement.scrollHeight - innerHeight"), 2400));
        for (let i = 1; i <= ${HOVER.scroll}; i++) {
          await js("scrollTo({ top: " + Math.round((end * i) / ${HOVER.scroll}) + ", behavior: 'instant' })");
          await wait(${HOVER.every});
          frames.push(await png());
        }
        return frames;
      }`,
    )) as string[];
    const count = await writeAnimatedWebp(
      frames.map((f) => Buffer.from(f, "base64")),
      HOVER.width,
      HOVER.every,
      join(pictures, "hover.webp"),
    );
    // Frames alike in a row are merged by the encoder: it moves if it has more than one.
    expect(count).toBeGreaterThan(1);

    // The review sheet: the cover, then every page side by side, at desktop
    // and phone width, in one row (a screenshot of a very tall page repeats
    // parts of it, so the sheet stays wide rather than tall).
    const sheets = join(runsDir, "template-sheets");
    mkdirSync(sheets, { recursive: true });
    cpSync(pictures, join(sheets, id), { recursive: true });
    const columns = shots
      .map(
        (s) => `<div class="page"><p><b>${s.route}</b></p><div class="cols">
<img class="desktop" src="${id}/${s.desktop.slice("pictures/".length)}"><img class="phone" src="${id}/${s.phone.slice("pictures/".length)}">
</div></div>`,
      )
      .join("\n");
    const sheet = join(sheets, `${id}.html`);
    writeFileSync(
      sheet,
      `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:24px;font:14px system-ui;background:#e5e5e5;color:#111;width:max-content}
h1{font-size:20px;margin:0 0 12px} .pages{display:flex;gap:40px;align-items:flex-start;margin-top:24px} .page p{margin:0 0 6px}
.cols{display:flex;gap:12px;align-items:flex-start} img{display:block;border:1px solid #bbb;background:#fff}
.cover{width:960px} .desktop{width:420px} .phone{width:140px}
</style></head><body><h1>${id}: cover, then each page at desktop and phone width (hover: ${id}/hover.webp)</h1>
<img class="cover" src="${id}/cover.webp"><div class="pages">${columns}</div></body></html>`,
    );
    const opened = launched.app.waitForEvent("window", (page) => page.url().endsWith(`/${id}.html`));
    await launched.app.evaluate(async ({ BrowserWindow }, target) => {
      await new BrowserWindow({ show: false, width: 2600, height: 900, enableLargerThanScreen: true }).loadFile(target);
    }, sheet);
    const page = await opened;
    await page.waitForLoadState("load");
    await page.screenshot({ path: join(sheets, `${id}.png`), fullPage: true });
    await page.close();
  }, 240_000);
});
