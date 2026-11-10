// Gathers the runs of the matrix into tables.   node src/measure/aggregate.ts
// For each approach, request and run number the latest run counts. Throwaway spike code.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const runsDir = path.join(root, "runs");

// A live run whose page-side figures were spoiled by a bug of the preview, since fixed: the same
// generation was replayed through the fixed preview and the page-side figures come from that replay.
const PAGE_SIDE_FROM_REPLAY: Record<string, string> = {
  "A-business-1-live-2026-11-09T22-10-38": "A-business-1-replay-2026-11-09T22-12-22",
};
// Runs made before the matrix, with other settings: kept for comparison, not counted.
const NOT_BEFORE = "2026-11-09T22-16"; // the matrix started after this

type Row = Record<string, any>;
const REQUESTS = ["launch", "business", "app"];
const read = (dir: string) => JSON.parse(readFileSync(path.join(runsDir, dir, "run.json"), "utf8"));

const candidates = readdirSync(runsDir)
  .map((d) => ({ d, m: /^([ABC])-(launch|business|app)-(\d+)-(live|replay)-(.+)$/.exec(d) }))
  .filter((x) => x.m && existsSync(path.join(runsDir, x.d, "run.json")))
  .map((x) => ({ dir: x.d, approach: x.m![1], request: x.m![2], run: Number(x.m![3]), source: x.m![4], stamp: x.m![5] }));

const chosen = new Map<string, (typeof candidates)[number]>();
for (const c of candidates.sort((a, b) => a.stamp.localeCompare(b.stamp))) {
  const wanted = c.approach === "C" ? c.source === "replay" : c.source === "live";
  if (!wanted) continue;
  if (c.stamp < NOT_BEFORE && !PAGE_SIDE_FROM_REPLAY[c.dir]) continue;
  chosen.set(`${c.approach}-${c.request}-${c.run}`, c); // the latest wins
}

const sec = (ms?: number | null) => (ms === undefined || ms === null ? null : Math.round(ms / 100) / 10);
const rows: Row[] = [];
for (const c of [...chosen.values()].sort((a, b) => (a.approach + REQUESTS.indexOf(a.request) + a.run).localeCompare(b.approach + REQUESTS.indexOf(b.request) + b.run))) {
  const run = read(c.dir);
  const pageSide = PAGE_SIDE_FROM_REPLAY[c.dir] ? read(PAGE_SIDE_FROM_REPLAY[c.dir]) : run;
  const marks = pageSide.page?.marks ?? {};
  const a = run.agent ?? {};
  // Thinking tokens of the first request, from the recorded events.
  let thinkingTokens: number | null = null;
  try {
    const eventsDir = run.replayOf ? path.resolve(root, run.replayOf) : path.join(runsDir, c.dir);
    for (const line of readFileSync(path.join(eventsDir, "events.jsonl"), "utf8").split("\n")) {
      if (!line.includes('"kind":"usage"')) continue;
      thinkingTokens = JSON.parse(line).usage?.output_tokens_details?.thinking_tokens ?? null;
      break;
    }
  } catch {}
  const writes = (a.tools ?? []).filter((t: any) => t.name === "Write" || t.name === "Edit");
  const lastResult = Math.max(0, ...(a.tools ?? []).map((t: any) => t.resultMs ?? 0));
  const firstResult = Math.min(...writes.map((t: any) => t.resultMs ?? Infinity));
  rows.push({
    approach: c.approach,
    request: c.request,
    run: c.run,
    dir: c.dir,
    pageSideFrom: PAGE_SIDE_FROM_REPLAY[c.dir] ?? null,
    recording: pageSide.recording,
    model: run.model,
    thinking: run.thinking,
    thinkingTokens,
    firstToken: sec(a.firstTokenMs),
    firstFileChar: sec(a.firstFileCharMs),
    firstChange: sec(marks.firstChange),
    firstContent: sec(marks.firstContent),
    firstSection: sec(marks.firstSection),
    firstSectionComplete: sec(marks.firstSectionComplete),
    homeComplete: sec(marks.homeComplete),
    homeFiles: sec(marks.homeFiles),
    agentDone: sec(a.agentDoneMs),
    stillBeforeHome: sec(pageSide.page?.longestStillBeforeHomeMs),
    // Counted from the request, so that the wait before anything appears is part of it.
    stillFromRequest: marks.firstChange === undefined ? null : sec(Math.max(marks.firstChange, pageSide.page?.longestStillBeforeHomeMs ?? 0)),
    swap: pageSide.page?.swap ?? null,
    still: sec(pageSide.page?.longestStillMs),
    requests: a.requests,
    filesWritten: writes.length,
    firstFileOnDisk: Number.isFinite(firstResult) ? sec(firstResult) : null,
    lastToolResult: sec(lastResult),
    outputTokens: a.outputTokens,
    costUsd: a.costUsd ? Math.round(a.costUsd * 1000) / 1000 : null,
    fileCps: a.fileCharsPerSecond,
    shellCommands: (a.tools ?? []).filter((t: any) => t.name === "Bash").length,
    denied: (a.permissionDenied ?? []).length,
    asked: (a.permissionAsked ?? []).length,
    htmxAttributes: run.htmx?.attributes ?? 0,
    htmxValid: run.htmx?.valid ?? 0,
    htmxInvalid: (run.htmx?.invalid ?? []).map((f: any) => `${f.attribute}="${f.value}" (${f.problem}) ${f.file}:${f.line}`),
    htmxNeedsExtension: (run.htmx?.needsExtension ?? []).map((f: any) => `${f.attribute} ${f.file}:${f.line}`),
    form: pageSide.formCheck?.found === false ? "none" : pageSide.formCheck?.error ? "error" : pageSide.formCheck ? (pageSide.formCheck.viaHtmx && pageSide.formCheck.recordAdded ? "works" : `posted=${pageSide.formCheck.posted} status=${pageSide.formCheck.status} htmx=${pageSide.formCheck.viaHtmx} added=${pageSide.formCheck.recordAdded}`) : null,
    formUpdatesList: pageSide.formCheck?.swappedIn?.withRecord > 0,
    elements: pageSide.trace?.elements,
    traced: pageSide.trace?.withSource,
    tracedToRecord: pageSide.trace?.withRecord,
    applies: pageSide.page?.applies,
    unstyledFrames: pageSide.page?.unstyledFrames,
    consoleErrors: (pageSide.consoleErrors ?? []).length,
    consoleErrorSample: (pageSide.consoleErrors ?? []).slice(0, 2),
    liquidNotes: pageSide.liquidNotes ?? {},
    instructionStats: run.instructionStats ?? null,
    pages: (run.files ?? []).filter((f: any) => f.path.startsWith("pages/")).length,
  });
}

const median = (xs: number[]) => {
  const s = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
};
const range = (xs: (number | null)[]) => {
  const s = xs.filter((x): x is number => x !== null && x !== undefined);
  return s.length ? `${median(s)} (${Math.min(...s)}–${Math.max(...s)})` : "—";
};
const cell = (v: any) => (v === null || v === undefined ? "—" : String(v));

let md = "";
for (const approach of ["A", "B", "C"]) {
  const of = rows.filter((r) => r.approach === approach);
  if (!of.length) continue;
  md += `\n### Approach ${approach}: every run\n\n`;
  md += `| Request | Run | Thinking tokens | First token | First visible change | First text | First section (started / complete) | Home complete${approach === "B" ? " (shown / from files)" : ""} | Agent done | Longest stretch still, request to home complete | Output tokens |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of of)
    md += `| ${r.request} | ${r.run} | ${cell(r.thinkingTokens)} | ${cell(r.firstToken)} | ${cell(r.firstChange)} | ${cell(r.firstContent)} | ${cell(r.firstSection)} / ${cell(r.firstSectionComplete)} | ${cell(r.homeComplete)}${approach === "B" ? " / " + cell(r.homeFiles) : ""} | ${cell(r.agentDone)} | ${cell(r.stillFromRequest)} | ${cell(r.outputTokens)} |\n`;
}
md += `\n### Medians (min–max), seconds\n\n| Approach | Request | Runs | First visible change (3 s) | First text | First section started (10 s) | First section complete | Home complete (60 s) | Agent done | Longest stretch still, request to home complete | Output tokens |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const approach of ["A", "B", "C"])
  for (const request of [...REQUESTS, "all"]) {
    const of = rows.filter((r) => r.approach === approach && (request === "all" || r.request === request));
    if (!of.length) continue;
    const col = (k: string) => range(of.map((r) => r[k]));
    md += `| ${approach} | ${request} | ${of.length} | ${col("firstChange")} | ${col("firstContent")} | ${col("firstSection")} | ${col("firstSectionComplete")} | ${col("homeComplete")} | ${col("agentDone")} | ${col("stillFromRequest")} | ${col("outputTokens")} |\n`;
  }
md += `\n### Within the targets\n\n| Approach | Runs | First change ≤ 3 s | First section started ≤ 10 s | First section complete ≤ 10 s | Home complete ≤ 60 s |\n|---|---|---|---|---|---|\n`;
for (const approach of ["A", "B", "C"]) {
  const of = rows.filter((r) => r.approach === approach);
  if (!of.length) continue;
  const n = (k: string, max: number) => `${of.filter((r) => r[k] !== null && r[k] <= max).length} of ${of.length}`;
  md += `| ${approach} | ${of.length} | ${n("firstChange", 3)} | ${n("firstSection", 10)} | ${n("firstSectionComplete", 10)} | ${n("homeComplete", 60)} |\n`;
}
md += `\n### htmx 4, forms, tracing, page errors\n\n| Approach | Request | htmx attributes valid | Forms that work | Elements traced to a source | Elements traced to a record | Unstyled frames | Console errors | Shell commands | Refused / asked |\n|---|---|---|---|---|---|---|---|---|---|\n`;
for (const approach of ["A", "B", "C"])
  for (const request of [...REQUESTS, "all"]) {
    const of = rows.filter((r) => r.approach === approach && (request === "all" || r.request === request));
    if (!of.length) continue;
    const sum = (k: string) => of.reduce((t, r) => t + (r[k] ?? 0), 0);
    const forms = of.filter((r) => r.form && r.form !== "none");
    md += `| ${approach} | ${request} | ${sum("htmxValid")} of ${sum("htmxAttributes")} | ${forms.filter((r) => r.form === "works").length} of ${forms.length} | ${sum("traced")} of ${sum("elements")} | ${sum("tracedToRecord")} | ${sum("unstyledFrames")} of ${sum("applies")} | ${sum("consoleErrors")} | ${sum("shellCommands")} | ${sum("denied")} / ${sum("asked")} |\n`;
  }
const invalid = rows.flatMap((r) => r.htmxInvalid.map((f: string) => `- ${r.approach} ${r.request} ${r.run}: ${f}`));
const ext = rows.flatMap((r) => r.htmxNeedsExtension.map((f: string) => `- ${r.approach} ${r.request} ${r.run}: ${f}`));
if (invalid.length) md += `\nInvalid htmx 4 attributes:\n${invalid.join("\n")}\n`;
if (ext.length) md += `\nValid but needing an extension that is not loaded:\n${ext.join("\n")}\n`;
const badForms = rows.filter((r) => r.form && r.form !== "none" && r.form !== "works").map((r) => `- ${r.approach} ${r.request} ${r.run}: ${r.form}`);
if (badForms.length) md += `\nForms that did not work:\n${badForms.join("\n")}\n`;
const errs = rows.filter((r) => r.consoleErrors).map((r) => `- ${r.approach} ${r.request} ${r.run}: ${r.consoleErrorSample.join(" | ")}`);
if (errs.length) md += `\nConsole errors:\n${errs.join("\n")}\n`;

// Approach B: the page shown by instructions against the page the files render.
const b = rows.filter((r) => r.approach === "B");
if (b.length) {
  md += `\n### Approach B: shown by instructions, then rendered from the files\n\n| Request | Run | Sections shown | Characters of instructions | Page shown | Files ready | Nothing moves in between | Same text after the switch | Elements (shown → files) | Page height (shown → files) |\n|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of b)
    md += `| ${r.request} | ${r.run} | ${cell(r.instructionStats?.sectionCalls)} | ${cell(r.instructionStats?.instructionChars)} | ${cell(r.homeComplete)} | ${cell(r.homeFiles)} | ${r.homeComplete !== null && r.homeFiles !== null ? Math.round((r.homeFiles - r.homeComplete) * 10) / 10 : "—"} | ${r.swap ? (r.swap.sameText ? "yes" : `no (${r.swap.commonPrefix} of ${r.swap.textBefore} characters in common at the start)`) : "—"} | ${r.swap ? `${r.swap.elementsBefore} → ${r.swap.elementsAfter}` : "—"} | ${r.swap ? `${r.swap.heightBefore} → ${r.swap.heightAfter}` : "—"} |\n`;
}

// The Liquid cases, counted over the runs of approach A.
const notes: Record<string, number> = {};
for (const r of rows.filter((x) => x.approach === "A")) for (const [k, v] of Object.entries(r.liquidNotes)) notes[k] = (notes[k] ?? 0) + (v as number);
const group = (re: RegExp) => Object.entries(notes).filter(([k]) => re.test(k)).reduce((t, [, v]) => t + v, 0);
md += `\n### Liquid while being written, approach A, all runs\n\n- renders of an unfinished file that needed a cut or closers: ${group(/^repaired: (?!data)/)}\n- of which an unfinished Liquid tag or output: ${group(/unfinished \{[%{]/)}\n- renders with a shared part that did not exist yet: ${group(/^missing/)}\n- renders with stand-in records for a datasource that did not exist yet: ${group(/stand-in/)}\n- renders of a data file still being written (complete records kept): ${group(/data file still being written/)}\n- render errors: ${group(/render error/)}\n`;

writeFileSync(path.join(runsDir, "summary.json"), JSON.stringify(rows, null, 1));
writeFileSync(path.join(runsDir, "summary.md"), md);
console.log(md);
console.log(`\n${rows.length} runs -> runs/summary.md, runs/summary.json`);
