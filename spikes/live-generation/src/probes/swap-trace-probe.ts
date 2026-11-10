// Probe: does an element that arrives through an htmx swap still say which file and which
// record it comes from? Uses the project of a finished run; no agent involved.
//   node src/probes/swap-trace-probe.ts runs/<a run of the "app" request>
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tryForm } from "../measure/form-check.ts";
import { PreviewServer } from "../preview/server.ts";

const root = path.resolve(import.meta.dirname, "../..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, ".browsers");
const { chromium } = await import("playwright");

const source = path.resolve(process.argv[2]);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const runDir = path.join(root, "runs", `probe-swap-trace-${stamp}`);
const projectDir = path.join(runDir, "project");
mkdirSync(runDir, { recursive: true });
cpSync(path.join(source, "project"), projectDir, { recursive: true });

const server = new PreviewServer({ projectDir, label: "swap trace probe" });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(server.url + "/");
await page.waitForTimeout(600);
const form = (await tryForm(page, server, projectDir)) as any;
const name = /^\/data\/([\w-]+)/.exec(form.action ?? "")?.[1];
const records = JSON.parse(readFileSync(path.join(projectDir, `data/${name}.json`), "utf8")).records;
const ref = `${name}/${records[records.length - 1].id}`;
const swapped = await page.evaluate((r) => {
  const els = [...document.querySelectorAll(`[data-up-rec="${r}"]`)];
  return { elements: els.length, sources: [...new Set(els.map((e) => e.getAttribute("data-up-src")!.split(":")[0]))], first: els[0]?.outerHTML.slice(0, 160) ?? null };
}, ref);
const out = { source: path.relative(root, source), form: { action: form.action, status: form.status, viaHtmx: form.viaHtmx, recordAdded: form.recordAdded }, newRecord: ref, swapped };
writeFileSync(path.join(runDir, "probe.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
await browser.close();
await server.close();
process.exit(0);
