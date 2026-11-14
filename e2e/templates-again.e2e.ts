import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { shotPages } from "../apps/desktop/src/main/templates/pictures.ts";
import { projectFiles, readTemplateFolder } from "../apps/desktop/src/main/templates/reader.ts";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// Each of Upstart's templates in the preview, moving as visitors see it, then
// rendered again twice as after an edit: its scripts are stopped before each
// new rendering and started again after it (ADR 0011). Nothing should be left
// hidden that was shown, and no error raised, at desktop and phone width.
// Pocket, whose scripts do the most, unless UPSTART_TEMPLATE names another, or
// is "all" (about fifteen minutes); `pnpm template:shoot <folder>` checks the
// template it photographs (UPSTART_TEMPLATE_SHOOT).
const TEMPLATES = join(import.meta.dirname, "../apps/desktop/templates");
const only = process.env.UPSTART_TEMPLATE || "pocket";
const folders = process.env.UPSTART_TEMPLATE_SHOOT
  ? [resolve(process.env.UPSTART_TEMPLATE_SHOOT)]
  : readdirSync(TEMPLATES, { withFileTypes: true })
      .filter((e) => e.isDirectory() && readdirSync(join(TEMPLATES, e.name)).includes("template.json"))
      .map((e) => join(TEMPLATES, e.name))
      .filter((dir) => only === "all" || basename(dir) === only);
const DEVICES = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "phone", width: 390, height: 844, mobile: true },
];

/**
 * The page scrolled through, so that what rises into view has risen, then back
 * at its top: the texts, images and controls left hidden (an opacity under 0.1,
 * its own or a parent's), by their place in the page.
 */
const HIDDEN = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const tall = document.documentElement.scrollHeight;
  for (let y = 0; y < tall; y += innerHeight * 0.7) { scrollTo({ top: y, behavior: "instant" }); await wait(180); }
  scrollTo({ top: tall, behavior: "instant" }); await wait(400);
  scrollTo({ top: 0, behavior: "instant" }); await wait(1400);
  const place = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body; e = e.parentElement)
      parts.unshift(e.tagName.toLowerCase() + (e.parentElement ? ":" + [...e.parentElement.children].indexOf(e) : ""));
    return parts.join("/");
  };
  const hidden = [];
  for (const el of document.body.querySelectorAll("h1, h2, h3, p, li, img, a, button, figure")) {
    if (el.closest("[inert], [hidden], [aria-hidden='true'], template, dialog:not([open]), details:not([open])")) continue;
    let opacity = 1;
    for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    if (opacity < 0.1) hidden.push(place(el) + " " + JSON.stringify((el.textContent || el.getAttribute("alt") || "").trim().slice(0, 40)));
  }
  return hidden;
})()`;

describe("Upstart's templates, rendered again in the preview", () => {
  let launched: LaunchedApp;
  const { invoke, until, page } = previewDriver(() => launched);
  const main = <T>(code: string, arg?: unknown): Promise<T> =>
    launched.app.evaluate(
      (_electron, { code, arg }) =>
        // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
        new Function("upstart", "arg", `return (${code})`)((globalThis as any).upstart, arg),
      { code, arg },
    ) as Promise<T>;
  const errorsSince = (at: number) =>
    main<string[]>(
      "upstart.preview.errors.filter((e) => e.at >= arg).map((e) => e.message + (e.source ? ' (' + e.source + ')' : ''))",
      at,
    );

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("message-input").waitFor();
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test.each(folders)(
    "%s: nothing hidden that was shown, no error",
    async (dir) => {
      const id = basename(dir);
      const files = readTemplateFolder(dir);
      const copy = join(launched.projectsDir, `${id}-again`);
      for (const [path, bytes] of projectFiles(files)) {
        mkdirSync(join(copy, path, ".."), { recursive: true });
        writeFileSync(join(copy, path), bytes);
      }
      const project = await main<{ id: string }>("upstart.projects.openFolder(arg)", copy);
      await invoke("projects:open", project.id);
      await until(() => main<string>("upstart.preview.origin"));
      const problems: string[] = [];
      for (const device of DEVICES) {
        await main(
          `(upstart.preview.view.webContents.debugger.isAttached() || upstart.preview.view.webContents.debugger.attach("1.3"), upstart.preview.view.webContents.debugger).sendCommand("Emulation.setDeviceMetricsOverride", { width: arg.width, height: arg.height, deviceScaleFactor: 1, mobile: arg.mobile, screenWidth: arg.width, screenHeight: arg.height })`,
          device,
        );
        for (const { route } of shotPages(files)) {
          const at = Date.now();
          await invoke("preview:navigate", route);
          await until(() =>
            page(`location.pathname === ${JSON.stringify(route)} && window.__upStart?.started !== false`),
          );
          await new Promise((r) => setTimeout(r, 2000));
          const shown: string[] = await page(HIDDEN);
          const loaded = await errorsSince(at);
          // Rendered again, twice, as after an edit.
          const again = Date.now();
          for (let i = 0; i < 2; i++) {
            await main("upstart.preview.refresh(true)");
            await new Promise((r) => setTimeout(r, 900));
          }
          const hidden: string[] = await page(HIDDEN);
          const where = `${device.name} ${route}`;
          for (const e of loaded) problems.push(`${where}, loaded: ${e}`);
          for (const e of new Set(await errorsSince(again))) problems.push(`${where}, rendered again: ${e}`);
          for (const h of hidden.filter((h) => !shown.includes(h)))
            problems.push(`${where}, hidden once rendered again: ${h}`);
        }
      }
      await main(`upstart.preview.view.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride")`);
      mkdirSync(runsDir, { recursive: true });
      writeFileSync(join(runsDir, `templates-again-${id}.json`), JSON.stringify(problems, null, 2));
      expect(problems).toEqual([]);
    },
    600_000,
  );
});
