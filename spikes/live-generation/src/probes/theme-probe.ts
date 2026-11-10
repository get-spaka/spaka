// Probe for ADR 0006: daisyUI's variables pointed at the theme's. Changing one
// theme value must restyle daisyUI components and Tailwind utilities alike.
// Also measures how fast the preview gets its stylesheet on a cold load.
// No agent involved.   node src/probes/theme-probe.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PreviewServer } from "../preview/server.ts";

const root = path.resolve(import.meta.dirname, "../..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, ".browsers");
const { chromium } = await import("playwright");

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const runDir = path.join(root, "runs", `probe-theme-${stamp}`);
const projectDir = path.join(runDir, "project");
mkdirSync(path.join(projectDir, "pages"), { recursive: true });

const theme = (primary: string, radius: string, heading: string) => `:root {
  --theme-color-primary: ${primary};
  --theme-color-primary-content: #ffffff;
  --theme-color-secondary: #0f766e;
  --theme-color-secondary-content: #f0fdfa;
  --theme-color-accent: #f59e0b;
  --theme-color-accent-content: #1c1917;
  --theme-color-neutral: #1c1917;
  --theme-color-neutral-content: #fafaf9;
  --theme-color-surface: #fffbf5;
  --theme-color-surface-alt: #fdf2e3;
  --theme-color-border: #ecd9bd;
  --theme-color-text: #292524;
  --theme-font-heading: ${heading};
  --theme-font-body: ui-sans-serif, system-ui, sans-serif;
  --theme-radius: ${radius};
}
`;
writeFileSync(path.join(projectDir, "theme.css"), theme("#c2410c", "1rem", "Georgia, serif"));
writeFileSync(
  path.join(projectDir, "pages/index.liquid"),
  `<!doctype html><html lang="en"><head><title>Theme probe</title></head>
<body class="p-10 space-y-6">
  <h1 id="heading" class="text-4xl font-bold">Heading font comes from the theme</h1>
  <div class="flex gap-4 items-center">
    <button id="daisy-btn" class="btn btn-primary">daisyUI: btn-primary</button>
    <span id="daisy-badge" class="badge badge-primary badge-outline">daisyUI: badge-outline</span>
    <input id="daisy-input" class="input input-primary" placeholder="daisyUI: input-primary">
    <progress id="daisy-progress" class="progress progress-primary w-40" value="60" max="100"></progress>
  </div>
  <div class="flex gap-4 items-center">
    <div id="tw-bg" class="bg-primary text-primary-content px-4 py-2 rounded-box">Tailwind: bg-primary rounded-box</div>
    <div id="tw-text" class="text-primary font-bold">Tailwind: text-primary</div>
    <div id="tw-border" class="border-2 border-primary/50 px-4 py-2 rounded-field">Tailwind: border-primary/50 rounded-field</div>
    <div id="tw-gradient" class="bg-gradient-to-r from-primary to-accent text-primary-content px-4 py-2 md:px-6 hover:bg-primary/80">Tailwind: from-primary</div>
  </div>
  <div id="daisy-card" class="card card-border bg-base-200 w-96"><div class="card-body"><h2 class="card-title">daisyUI: card</h2><p>Its radius is --radius-box.</p></div></div>
</body></html>
`,
);

const server = new PreviewServer({ projectDir, label: "theme probe" });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 520 } });
await page.goto(server.url + "/", { waitUntil: "load" });
await page.waitForTimeout(500);

const read = () =>
  page.evaluate(() => {
    const cs = (id: string) => getComputedStyle(document.getElementById(id)!);
    return {
      "daisyUI btn-primary background": cs("daisy-btn").backgroundColor,
      "daisyUI badge-outline colour": cs("daisy-badge").color,
      "daisyUI input-primary border": cs("daisy-input").borderColor,
      "daisyUI progress-primary colour": cs("daisy-progress").color,
      "Tailwind bg-primary background": cs("tw-bg").backgroundColor,
      "Tailwind text-primary colour": cs("tw-text").color,
      "Tailwind border-primary/50 border": cs("tw-border").borderColor,
      "Tailwind from-primary gradient": cs("tw-gradient").backgroundImage.slice(0, 60),
      "daisyUI btn radius (--radius-field)": cs("daisy-btn").borderRadius,
      "daisyUI card radius (--radius-box)": cs("daisy-card").borderRadius,
      "Tailwind rounded-box radius": cs("tw-bg").borderRadius,
      "Tailwind rounded-field radius": cs("tw-border").borderRadius,
      "h1 font (--theme-font-heading)": cs("heading").fontFamily,
    };
  });

// Cold load: when is the stylesheet there?
const cold = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
  const res = (name: string) => {
    const r = performance.getEntriesByType("resource").find((e) => e.name.endsWith(name)) as PerformanceResourceTiming | undefined;
    return r ? { endMs: Math.round(r.responseEnd), bytes: r.decodedBodySize } : null;
  };
  const build = performance.getEntriesByType("measure").find((m) => /^Build #1 /.test(m.name));
  const paint = performance.getEntriesByType("paint").map((p) => [p.name, Math.round(p.startTime)]);
  return {
    domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
    loadMs: Math.round(nav.loadEventEnd),
    daisyuiCss: res("daisyui.css"),
    tailwindJs: res("tailwind.js"),
    firstTailwindBuild: build ? { startMs: Math.round(build.startTime), durationMs: Math.round(build.duration * 10) / 10 } : null,
    paint,
  };
});

const before = await read();
await page.screenshot({ path: path.join(runDir, "before.png") });

// Change three theme values in the file, as a maker or the agent would.
const tWrite = Date.now();
writeFileSync(path.join(projectDir, "theme.css"), theme("#1d4ed8", "0rem", "ui-monospace, monospace"));
await page.waitForFunction(() => getComputedStyle(document.getElementById("tw-bg")!).backgroundColor !== "rgb(194, 65, 12)", null, { timeout: 5000 });
const restyleMs = Date.now() - tWrite;
await page.waitForTimeout(400); // daisyUI transitions colours
const after = await read();
await page.screenshot({ path: path.join(runDir, "after.png") });

const rows = Object.keys(before).map((k) => ({ what: k, before: (before as any)[k], after: (after as any)[k], changed: (before as any)[k] !== (after as any)[k] }));
const out = { cold, restyleMs, rows, allChanged: rows.every((r) => r.changed) };
writeFileSync(path.join(runDir, "probe.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(cold));
for (const r of rows) console.log(`${r.changed ? "changed " : "SAME    "} ${r.what.padEnd(38)} ${r.before}  ->  ${r.after}`);
console.log(`theme.css written -> page restyled: ${restyleMs} ms (no reload) | every value followed: ${out.allChanged}`);
console.log("log:", path.relative(root, path.join(runDir, "probe.json")));
await browser.close();
await server.close();
process.exit(0);
