// What every harness run shares: a fresh project with the agent's instructions,
// the request, the stream's events recorded with their time, and the project's
// files watched on disk. Each harness's adapter (src/<harness>.ts) starts its
// agent and says, for each event, whether it carries a file's content while it
// is being written (the live preview's need, ADR 0009).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { REQUESTS, UPSTART_INSTRUCTIONS } from "../../live-generation/src/agent/instructions.ts";

export const ROOT = join(import.meta.dirname, "..");
export const BIN = join(ROOT, "node_modules/.bin");
/** Each harness's own configuration and sign-in, apart from the maker's (ADR 0010). */
export const homeOf = (harness: string) => join(ROOT, "homes", harness);

/** Spike 1's instructions, without the names of Claude's tools. */
export const INSTRUCTIONS = UPSTART_INSTRUCTIONS.replace(
  "Write each new file with a single Write call, top to bottom in reading order. Use Edit for later changes.",
  "Write each new file with a single call of your file-writing tool, top to bottom in reading order. Use your editing tool for later changes.",
)
  .replace("(Write creates folders)", "(your file-writing tool creates folders)")
  .replace("Do not re-read or review your files", "Do not re-read or review your files");

export type RequestName = keyof typeof REQUESTS;
export { REQUESTS };

export type Run = {
  harness: string;
  request: RequestName;
  dir: string;
  project: string;
  started: number;
  /** Records an event of the stream, with the time since the request was sent. */
  event: (kind: string, data: unknown) => void;
  /** Marks a file's content seen in the stream before the file is complete (partial: true) or once written. */
  content: (file: string, chars: number, partial: boolean) => void;
  finish: (extra?: Record<string, unknown>) => Record<string, unknown>;
};

export function startRun(harness: string, request: RequestName, label = ""): Run {
  const id = `${harness}-${request}-${new Date().toISOString().replace(/[:.]/g, "-")}${label ? `-${label}` : ""}`;
  const dir = join(ROOT, "runs", id);
  const project = join(dir, "project");
  mkdirSync(project, { recursive: true });
  const started = Date.now();
  const events = join(dir, "events.jsonl");
  const t = () => (Date.now() - started) / 1000;
  const firsts: Record<string, number> = {};
  const mark = (name: string) => {
    if (firsts[name] === undefined) firsts[name] = t();
  };
  const contents: { file: string; at: number; chars: number; partial: boolean }[] = [];

  // The files as they reach the disk, every 50 ms.
  const seen = new Map<string, number>();
  const disk: { file: string; at: number; size: number }[] = [];
  const walk = (d: string): string[] =>
    existsSync(d)
      ? readdirSync(d, { withFileTypes: true }).flatMap((e) =>
          e.name.startsWith(".") ? [] : e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
        )
      : [];
  const poll = setInterval(() => {
    for (const f of walk(project)) {
      const size = statSync(f).size;
      const file = relative(project, f);
      if (seen.get(file) !== size) {
        seen.set(file, size);
        disk.push({ file, at: t(), size });
        mark("first file on disk");
        if (file === "pages/index.liquid") mark("home page on disk");
      }
    }
  }, 50);

  return {
    harness,
    request,
    dir,
    project,
    started,
    event(kind, data) {
      appendFileSync(events, `${JSON.stringify({ t: t(), kind, data })}\n`);
    },
    content(file, chars, partial) {
      contents.push({ file, at: t(), chars, partial });
      if (partial) {
        mark("first partial content in the stream");
        if (file.endsWith("index.liquid")) mark("home page partial in the stream");
      }
    },
    finish(extra = {}) {
      clearInterval(poll);
      const home = join(project, "pages/index.liquid");
      // The longest stretch with nothing new: neither streamed content nor a file changed on disk.
      const moments = [0, ...contents.map((c) => c.at), ...disk.map((d) => d.at)].sort((a, b) => a - b);
      let still = 0;
      for (let i = 1; i < moments.length; i++) still = Math.max(still, moments[i]! - moments[i - 1]!);
      const summary = {
        id,
        harness,
        request,
        total: t(),
        firsts,
        longestStill: Number(still.toFixed(2)),
        partialEvents: contents.filter((c) => c.partial).length,
        files: [...seen.keys()].sort(),
        homeChars: existsSync(home) ? readFileSync(home, "utf8").length : 0,
        ...extra,
      };
      writeFileSync(join(dir, "run.json"), JSON.stringify({ summary, contents, disk }, null, 2));
      return summary;
    },
  };
}
