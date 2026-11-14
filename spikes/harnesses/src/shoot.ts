// Each run's result as spike 1 looked at Claude's: rendered by spike 1's
// preview, photographed whole, its htmx checked and its form tried (on a copy,
// so the run's project stays as the agent left it). Writes <run>/checks.json
// and <run>/final-home.png.
//
//   node src/shoot.ts [<run dir> ...]     (every run without checks.json when none given)
import { cpSync, existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkHtmx } from "../../live-generation/src/measure/htmx-check.ts";
import { tryForm } from "../../live-generation/src/measure/form-check.ts";
import { PreviewServer } from "../../live-generation/src/preview/server.ts";
import { ROOT } from "./common.ts";

const LG = join(ROOT, "../live-generation");
process.env.PLAYWRIGHT_BROWSERS_PATH = join(LG, ".browsers");
const { chromium } = createRequire(join(LG, "package.json"))("playwright");

const given = process.argv.slice(2).map((d) => resolve(d));
const dirs = given.length
  ? given
  : readdirSync(join(ROOT, "runs"))
      .map((d) => join(ROOT, "runs", d))
      .filter((d) => existsSync(join(d, "run.json")) && !existsSync(join(d, "checks.json")));

const browser = await chromium.launch({ headless: true });
for (const dir of dirs) {
  const project = mkdtempSync(join(tmpdir(), "harness-shot-"));
  cpSync(join(dir, "project"), project, { recursive: true });
  const server = new PreviewServer({ projectDir: project, mode: "reload", label: "" });
  await server.listen();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m: any) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e: Error) => consoleErrors.push(String(e).slice(0, 300)));
  const routes = server.runtime.routes().map((r: { route: string }) => r.route);
  const shots: string[] = [];
  for (const route of routes.slice(0, 4)) {
    await page.goto(server.url + route);
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const hud = document.getElementById("up-hud");
      if (hud) hud.style.visibility = "hidden";
    });
    const shot = join(dir, `final${route === "/" ? "-home" : route.replace(/\//g, "-")}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    shots.push(shot);
  }
  const formCheck = await tryForm(page, server, project).catch((e: Error) => ({ error: String(e) }));
  const checks = {
    routes,
    shots,
    htmx: checkHtmx(project),
    formCheck,
    liquidNotes: Object.fromEntries(server.noteCounts),
    consoleErrors: [...new Set(consoleErrors)].slice(0, 20),
  };
  writeFileSync(join(dir, "checks.json"), JSON.stringify(checks, null, 2));
  await page.context().close();
  await server.close();
  const f = formCheck as Record<string, unknown> | null;
  console.log(
    `${dir.split("/").pop()}: ${routes.length} routes, htmx ${checks.htmx.attributes} attributes, ${checks.htmx.invalid.length} invalid, form ${f ? (f.error ?? (f.posted ? `posted ${f.status}` : "not posted")) : "none"}, ${checks.consoleErrors.length} console errors`,
  );
}
await browser.close();
