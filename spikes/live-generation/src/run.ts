// One run of the spike: one request, one approach, recorded.
//
//   node src/run.ts --approach A --request launch --run 1
//   node src/run.ts --approach C --replay runs/<an A run>      (same generation, other delivery)
//   node src/run.ts --approach A --fixture                      (no agent: a canned page, to tune the preview)
//
// Options: --model <id>  --interval <ms>  --headed  --no-video  --keep-open
// Throwaway spike code.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { drive, type AgentEvent } from "./agent/drive.ts";
import { REQUESTS, UPSTART_INSTRUCTIONS, type RequestName } from "./agent/instructions.ts";
import { FileTap } from "./approaches/tap.ts";
import { InstructionTap, PREVIEW_TOOLS, previewToolServer } from "./approaches/instructions-tap.ts";
import { UPSTART_INSTRUCTIONS_B } from "./agent/instructions-b.ts";
import { fixtureEvents } from "./dev/fixture.ts";
import { PreviewServer } from "./preview/server.ts";
import { summarize } from "./measure/summary.ts";
import { checkHtmx } from "./measure/htmx-check.ts";
import { tryForm } from "./measure/form-check.ts";

const root = path.resolve(import.meta.dirname, "..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, ".browsers");
const { chromium } = await import("playwright");

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const approach = (opt("--approach", "A") as string).toUpperCase() as "A" | "B" | "C";
const replayDir = opt("--replay");
const fixture = flag("--fixture");
const replayed: any = replayDir ? JSON.parse(readFileSync(path.join(replayDir, "run.json"), "utf8")) : null;
// --edit <project folder> --prompt "...": a later request on an existing project.
const editOf: string | undefined = replayed?.editOf ?? opt("--edit");
const customPrompt: string | undefined = replayed?.prompt && replayed?.editOf ? replayed.prompt : opt("--prompt");
const request = (replayed?.request ?? (editOf ? "edit" : opt("--request", "launch"))) as RequestName;
const runNo = replayed?.run ?? Number(opt("--run", "1"));
const model = replayed?.model ?? opt("--model", "claude-sonnet-5-5")!;
const interval = Number(opt("--interval", "60"));
const thinking = (replayed?.thinking ?? opt("--thinking", "adaptive")) as "off" | "adaptive";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const source = fixture ? "fixture" : replayDir ? "replay" : "live";
const runId = `${approach}-${fixture ? "fixture" : request}-${runNo}-${source}-${stamp}`;
const runDir = path.join(root, "runs", runId);
const projectDir = path.join(runDir, "project");
mkdirSync(projectDir, { recursive: true });
mkdirSync(path.join(root, "recordings"), { recursive: true });
if (editOf) cpSync(path.resolve(root, editOf), projectDir, { recursive: true });

const shortModel = model.replace(/^claude-/, "");
const label = `${approach} · ${fixture ? "fixture" : request} · run ${runNo} · ${shortModel} · thinking ${thinking}${source === "live" ? "" : " · " + source}`;
const server = new PreviewServer({ projectDir, interval, label, mode: approach === "C" ? "reload" : approach === "B" ? "instructions" : "stream" });
await server.listen();
console.log(`[run] ${runId}\n[run] preview ${server.url}`);

// ---- the browser that watches, and records -----------------------------------
const browser = await chromium.launch({ headless: !flag("--headed") });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  ...(flag("--no-video") ? {} : { recordVideo: { dir: path.join(runDir, "video"), size: { width: 1280, height: 800 } } }),
});
const page = await context.newPage();
const consoleErrors: string[] = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 300)));
page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 300)));
const ready = new Promise<void>((ok) => {
  server.onReport = (r) => r.kind === "ready" && ok();
});
const videoStart = Date.now();
await page.goto(server.url + "/");
await ready;
await page.waitForTimeout(600); // let the stylesheet engine settle on the empty page

// ---- the request ---------------------------------------------------------------
const tap = approach === "B" ? new InstructionTap(server, { replay: source !== "live" }) : new FileTap(server, { live: approach === "A", replay: source !== "live" });
const events: AgentEvent[] = [];
const onEvent = (e: AgentEvent) => {
  events.push(e);
  tap.handle(e);
};
const finalReport = new Promise<any>((ok) => {
  server.onReport = (r) => r.kind === "final" && ok(r);
});
const t0 = Date.now();
server.start(t0);
const prompt = fixture ? "(fixture)" : customPrompt ?? REQUESTS[request];
console.log(`[run] t0; request: ${prompt.slice(0, 90)}`);

if (source === "live") {
  await drive({
    prompt,
    projectDir,
    systemPrompt:
      (approach === "B" ? UPSTART_INSTRUCTIONS_B : UPSTART_INSTRUCTIONS) +
      // The conversation is not kept between runs of the spike: say that the project already exists.
      (editOf ? "\n\n# This project already exists\n\nThe project folder already holds a finished project. Read the files you need, then change them with Edit, as little as the request needs. Do not rewrite a whole file." : ""),
    model,
    t0,
    onEvent,
    thinking,
    // Approach B: the two preview tools, allowed by rule so that auto mode does not judge them.
    extra: approach === "B" ? { mcpServers: { preview: previewToolServer() }, allowedTools: PREVIEW_TOOLS } : undefined,
  });
} else {
  // Replay recorded events with their original timing.
  const recorded: AgentEvent[] = fixture
    ? fixtureEvents(projectDir)
    : readFileSync(path.join(replayDir!, "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  for (const e of recorded) {
    const wait = e.t - (Date.now() - t0);
    if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
    onEvent({ ...e, t: Date.now() - t0 });
  }
}
const tAgentDone = Date.now() - t0;
await new Promise((ok) => setTimeout(ok, 700)); // last renders
server.doneText = `done in ${(tAgentDone / 1000).toFixed(1)} s`;
server.push("done", { text: server.doneText });
const report = await Promise.race([finalReport, new Promise((ok) => setTimeout(() => ok(null), 4000))]);

// ---- after the run: look at the result, then stop recording --------------------
await page.waitForTimeout(1200);
const routes = server.runtime.routes();
const shots: string[] = [];
try {
  for (const r of routes.slice(0, 4)) {
    if (r.route !== new URL(page.url()).pathname) await page.goto(server.url + r.route);
    await page.waitForTimeout(700);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    // A slow scroll through the finished page, so the recording ends on the whole result.
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(700);
    for (let y = 400; y < height - 400; y += 400) {
      await page.evaluate((top) => scrollTo({ top, behavior: "smooth" }), y);
      await page.waitForTimeout(450);
    }
    await page.waitForTimeout(500);
    const shot = path.join(runDir, `final${r.route === "/" ? "-home" : r.route.replace(/\//g, "-")}.png`);
    await page.evaluate(() => ((document.getElementById("up-hud") as HTMLElement).style.visibility = "hidden"));
    await page.screenshot({ path: shot, fullPage: true });
    await page.evaluate(() => ((document.getElementById("up-hud") as HTMLElement).style.visibility = ""));
    shots.push(shot);
  }
} catch (e) {
  console.log("[run] tour failed:", (e as Error).message);
}
const traceCheck = await page
  .evaluate(() => {
    const all = [...document.body.querySelectorAll("*")].filter((e) => !["SCRIPT", "STYLE"].includes(e.tagName));
    const untraced = all.filter((e) => !e.closest("[data-up-src]"));
    return {
      elements: all.length,
      withSource: all.filter((e) => e.hasAttribute("data-up-src")).length,
      untraced: untraced.length,
      untracedSample: untraced.slice(0, 5).map((e) => e.outerHTML.slice(0, 80)),
      withRecord: all.filter((e) => e.getAttribute("data-up-rec")).length,
      sources: [...new Set(all.map((e) => (e.getAttribute("data-up-src") ?? "").split(":")[0]).filter(Boolean))],
    };
  })
  .catch(() => null);

// Does the form the agent wrote work in htmx 4, with the compatibility extension off?
const formCheck = flag("--no-form-check") ? null : await tryForm(page, server, projectDir).catch((e) => ({ error: String(e) }));

if (flag("--keep-open")) {
  console.log(`[run] preview stays open at ${server.url} (Ctrl-C to stop)`);
  await new Promise(() => {});
}
const video = page.video();
await context.close();
await browser.close();
let recording: string | undefined;
if (video) {
  const src = await video.path();
  recording = path.join(root, "recordings", `${runId}.webm`);
  cpSync(src, recording);
  // An .mp4 beside it when ffmpeg is on the machine: Quick Look and QuickTime do not play .webm.
  try {
    const { execFileSync } = await import("node:child_process");
    const mp4 = recording.replace(/\.webm$/, ".mp4");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", recording, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", mp4]);
    recording = mp4;
  } catch {}
}
await server.close();

// ---- what was measured -----------------------------------------------------------
const summary = summarize(events);
const run = {
  runId,
  approach,
  request: fixture ? "fixture" : request,
  run: runNo,
  model,
  thinking,
  source,
  replayOf: replayDir ?? null,
  editOf: editOf ?? null,
  interval,
  prompt,
  t0: new Date(t0).toISOString(),
  videoLeadMs: t0 - videoStart,
  recording: recording ? path.relative(root, recording) : null,
  screenshots: shots.map((s) => path.relative(root, s)),
  page: report,
  agent: summary,
  liquidNotes: Object.fromEntries(server.noteCounts),
  trace: traceCheck,
  instructionStats: tap instanceof InstructionTap ? tap.stats : null,
  htmx: checkHtmx(projectDir),
  formCheck,
  consoleErrors: [...new Set(consoleErrors)].slice(0, 20),
  files: listFiles(projectDir),
};
writeFileSync(path.join(runDir, "run.json"), JSON.stringify(run, null, 2));
writeFileSync(path.join(runDir, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
writeFileSync(path.join(runDir, "push-log.json"), JSON.stringify(server.pushLog, null, 1));

const s = (v?: number) => (v === undefined || v === null ? "—" : (v / 1000).toFixed(1) + " s");
const m = (report?.marks ?? {}) as Record<string, number>;
console.log(`[run] first change ${s(m.firstChange)} | first section ${s(m.firstSection)} (complete ${s(m.firstSectionComplete)}) | home complete ${s(m.homeComplete)}${approach === "B" ? ` (from files ${s(m.homeFiles)})` : ""} | agent done ${s(tAgentDone)}`);
console.log(`[run] longest stretch with nothing moving, until home complete: ${s(report?.longestStillBeforeHomeMs)}; whole run: ${s(report?.longestStillMs)}`);
console.log(`[run] first token ${s(summary.firstTokenMs)} | first file character ${s(summary.firstFileCharMs)} | ${summary.outputTokens} output tokens | ${summary.requests} requests`);
console.log(`[run] run.json: ${path.relative(root, path.join(runDir, "run.json"))}${recording ? `\n[run] recording: ${path.relative(root, recording)}` : ""}`);
process.exit(0);

function listFiles(dir: string, base = ""): { path: string; bytes: number }[] {
  if (!existsSync(dir)) return [];
  const out: { path: string; bytes: number }[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(path.join(dir, e.name), rel));
    else out.push({ path: rel, bytes: readFileSync(path.join(dir, e.name)).length });
  }
  return out;
}
