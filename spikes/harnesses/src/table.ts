// The runs side by side, as a Markdown table: each harness and model, the
// median of its runs (summarized again from run.json, so a change to
// summarize() applies to past runs) and its checks.json, beside the median of
// spike 1's Claude runs of the same request. Runs moved to runs/superseded are
// left out.
//
//   node src/table.ts [launch]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, summarize } from "./common.ts";

const request = process.argv[2] ?? "launch";
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const sec = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toFixed(1)} s`);
const spread = (xs: (number | null)[]) => {
  const ok = xs.filter((x): x is number => x !== null);
  if (!ok.length) return "—";
  return ok.length === 1 ? sec(ok[0]) : `${sec(median(ok))} (${Math.min(...ok).toFixed(1)}–${Math.max(...ok).toFixed(1)})`;
};

type Row = {
  name: string;
  starts: (number | null)[];
  complete: (number | null)[];
  done: number[];
  still: number[];
  tokens: number[];
  cost: number[];
  forms: boolean[];
};
const groups = new Map<string, Row>();
const row = (name: string) => {
  if (!groups.has(name)) groups.set(name, { name, starts: [], complete: [], done: [], still: [], tokens: [], cost: [], forms: [] });
  return groups.get(name)!;
};

// Spike 1, approach A, its last five live runs of the request (Claude Sonnet 5.5, Agent SDK).
const LG = join(ROOT, "../live-generation/runs");
for (const d of readdirSync(LG).filter((d) => d.startsWith(`A-${request}-`) && d.includes("-live-2026-11-09T22"))) {
  const r = JSON.parse(readFileSync(join(LG, d, "run.json"), "utf8"));
  const g = row("Claude Agent SDK, Sonnet 5.5 (spike 1)");
  g.starts.push(r.page.marks.firstContent / 1000);
  g.complete.push(r.page.marks.homeComplete / 1000);
  g.done.push(r.page.marks.done / 1000);
  g.still.push(r.page.longestStillBeforeHomeMs / 1000);
  g.tokens.push(r.agent.outputTokens);
  g.cost.push(r.agent.costUsd);
  g.forms.push(!!r.formCheck?.posted);
}

const NAMES: Record<string, string> = {
  "pi openai/gpt-6.1-sol": "Pi, GPT-6.1 Sol (OpenRouter)",
  "pi gemini-4-argon": "Pi, Gemini 4 Argon (Google API)",
  "pi google/gemini-4-hydrogen": "Pi, Gemini 4 Hydrogen (OpenRouter)",
  "pi gemini-4-hydrogen": "Pi, Gemini 4 Hydrogen (Google API)",
  "pi gpt-6.1-sol": "Pi, GPT-6.1 Sol (OpenAI API)",
  "pi gpt-6.1-sol chatgpt": "Pi, GPT-6.1 Sol (OpenAI API, ChatGPT Plus through Sign in with ChatGPT)",
  "pi gpt-6.1-terra chatgpt": "Pi, GPT-6.1 Terra (OpenAI API, ChatGPT Plus)",
  "pi gpt-6.1-sol low chatgpt": "Pi, GPT-6.1 Sol (OpenAI API, ChatGPT Plus), thinking low",
  "pi gpt-6.1-sol text chatgpt": "Pi, GPT-6.1 Sol (OpenAI API, ChatGPT Plus), files in the text",
  "pi gpt-6.1-sol text": "Pi, GPT-6.1 Sol (OpenAI API), files in the text",
  "pi gemini-4-hydrogen text": "Pi, Gemini 4 Hydrogen (Google API), files in the text",
  "pi gemini-4-argon text": "Pi, Gemini 4 Argon (Google API), files in the text",
  "pi openai/gpt-6.1-sol low": "Pi, GPT-6.1 Sol (OpenRouter), thinking low",
  "pi gemini-4-hydrogen text low": "Pi, Gemini 4 Hydrogen (Google API), files in the text, thinking low",
  "opencode openrouter/openai/gpt-6.1-sol": "opencode, GPT-6.1 Sol (OpenRouter)",
  "codex gpt-6-luna": "Codex, GPT-6 Luna (ChatGPT sign-in)",
  "gemini gemini-4-hydrogen gemini-api-key": "Gemini CLI over ACP, Gemini 4 Hydrogen (Google API)",
  "gemini gemini-4-hydrogen text gemini-api-key": "Gemini CLI over ACP, Gemini 4 Hydrogen (Google API), files in the text",
  "antigravity gemini-4-hydrogen-medium gemini-api-key": "Antigravity over ACP, Gemini 4 Hydrogen medium (Google API)",
  "antigravity gemini-4-hydrogen-medium text gemini-api-key": "Antigravity over ACP, Gemini 4 Hydrogen medium (Google API), files in the text",
  "antigravity gemini-4-hydrogen-low text gemini-api-key": "Antigravity over ACP, Gemini 4 Hydrogen low (Google API), files in the text",
  "antigravity gemini-4-argon-low text gemini-api-key": "Antigravity over ACP, Gemini 4 Argon low (Google API), files in the text",
  "antigravity gemini-4-carbon-low text gemini-api-key": "Antigravity over ACP, Gemini 4 Carbon low (Google API), files in the text",
  "codex openai/gpt-6.1-sol": "Codex, GPT-6.1 Sol (OpenRouter)",
};
for (const id of readdirSync(join(ROOT, "runs")).sort()) {
  const dir = join(ROOT, "runs", id);
  if (!existsSync(join(dir, "run.json"))) continue;
  const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
  if (run.summary.request !== request) continue;
  const key = `${run.summary.harness} ${run.summary.model}${run.summary.textFiles ? " text" : ""}${run.summary.thinking ? ` ${run.summary.thinking}` : ""}${run.summary.account ? ` ${run.summary.account}` : ""}`;
  const g = row(NAMES[key] ?? key);
  const s = summarize(run.summary.total, run.contents, run.disk);
  g.starts.push(s.homeFirstStreamed ?? s.homeComplete);
  g.complete.push(s.homeComplete);
  g.done.push(s.total);
  g.still.push(s.longestStillToHome);
  const tokens = run.summary.outputTokens ?? run.summary.usage?.total?.outputTokens;
  if (tokens !== undefined) g.tokens.push(tokens);
  if (typeof run.summary.cost === "number") g.cost.push(run.summary.cost);
  const checks = existsSync(join(dir, "checks.json")) ? JSON.parse(readFileSync(join(dir, "checks.json"), "utf8")) : null;
  if (checks) g.forms.push(!!checks.formCheck?.posted);
}

console.log(
  [
    "| Harness, model | Runs | Home page starts showing | Home page complete | Done | Longest still, until the home page is complete | Output tokens | Cost | Form works |",
    "|---|---|---|---|---|---|---|---|---|",
    ...[...groups.values()].map((g) =>
      [
        g.name,
        g.done.length,
        spread(g.starts),
        spread(g.complete),
        spread(g.done),
        spread(g.still),
        g.tokens.length ? Math.round(median(g.tokens)!) : "—",
        g.cost.length ? `$${median(g.cost)!.toFixed(3)}` : "—",
        g.forms.length ? `${g.forms.filter(Boolean).length}/${g.forms.length}` : "—",
      ].join(" | "),
    ).map((r) => `| ${r} |`),
  ].join("\n"),
);
