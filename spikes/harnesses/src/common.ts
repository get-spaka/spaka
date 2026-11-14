// What every harness run shares: a fresh project with the agent's instructions,
// the request, the stream's events recorded with their time, and the project's
// files watched on disk. Each harness's adapter (src/<harness>.ts) starts its
// agent and says, for each event, whether it carries a file's content while it
// is being written (the live preview's need, ADR 0009).
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

/** The spike's keys, written by Matt in homes/keys.env, as environment variables. */
export function keys(): Record<string, string> {
  const file = join(ROOT, "homes/keys.env");
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .map((l) => /^([A-Z_]+)=(.+)$/.exec(l.trim()))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => [m[1]!, m[2]!.trim()]),
  );
}

/**
 * A command confined by macOS's sandbox as Upstart would confine a harness that
 * has none: everything may be read, but only these folders written (and the
 * temporary ones). Network allowed.
 */
export function confined(command: string, args: string[], writable: string[]): [string, string[]] {
  const profile = `(version 1)
(allow default)
(deny file-write*)
(allow file-write*
  ${writable.map((w) => `(subpath ${JSON.stringify(w)})`).join("\n  ")}
  (subpath "/private/var/folders") (subpath "/private/tmp") (subpath "/dev"))`;
  return ["/usr/bin/sandbox-exec", ["-p", profile, command, ...args]];
}

export type RequestName = keyof typeof REQUESTS;
export { REQUESTS };

/** The instructions' file a harness reads from the project, left out of what is measured. */
export const CONTEXT_FILES = ["AGENTS.md", "GEMINI.md"];

export type Content = { file: string; at: number; chars: number; partial: boolean };
export type Disk = { file: string; at: number; size: number };

/**
 * What a run's stream and disk give the live preview. A file's content counts
 * as streamed only when a piece of it came before the whole: a tool call sent
 * in one piece moves the preview once, when it is complete. The home page is
 * complete when its whole content is in the stream, or else on disk (as spike
 * 1's "home complete", from the stream).
 */
export function summarize(total: number, contents: Content[], disk: Disk[]) {
  const whole = new Map<string, number>();
  for (const c of contents) if (!c.partial) whole.set(c.file, Math.max(whole.get(c.file) ?? 0, c.chars));
  const streamed = contents.filter((c) => c.partial && c.chars < (whole.get(c.file) ?? Infinity));
  const first = (list: { at: number }[]) => (list.length ? Math.min(...list.map((x) => x.at)) : null);
  const r2 = (v: number | null) => (v === null ? null : Number(v.toFixed(2)));
  const isHome = (f: string) => f === "pages/index.liquid";
  const homeWhole = first(contents.filter((c) => isHome(c.file) && !c.partial));
  const homeDisk = first(disk.filter((d) => isHome(d.file)));
  // The longest stretch with nothing new: neither streamed content, a whole file in the stream, nor a file changed on disk.
  const moments = [0, ...contents.map((c) => c.at), ...disk.map((d) => d.at)].sort((a, b) => a - b);
  let still = 0;
  let stillToHome = 0;
  const homeAt = homeWhole ?? homeDisk ?? total;
  for (let i = 1; i < moments.length; i++) {
    const gap = moments[i]! - moments[i - 1]!;
    still = Math.max(still, gap);
    if (moments[i]! <= homeAt) stillToHome = Math.max(stillToHome, gap);
  }
  return {
    total: Number(total.toFixed(2)),
    firstStreamed: r2(first(streamed)),
    homeFirstStreamed: r2(first(streamed.filter((c) => isHome(c.file)))),
    homeComplete: r2(homeWhole ?? homeDisk),
    homeOnDisk: r2(homeDisk),
    firstFileOnDisk: r2(first(disk)),
    longestStillToHome: Number(stillToHome.toFixed(2)),
    longestStill: Number(still.toFixed(2)),
    streamedPieces: streamed.length,
  };
}

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
  mkdirSync(dir, { recursive: true });
  // The project outside any repository, as a maker's is: a harness looks for
  // instructions and a project root up the folders. Copied into the run at the end.
  const project = mkdtempSync(join(realpathSync(tmpdir()), `harness-${harness}-`));
  const started = Date.now();
  const events = join(dir, "events.jsonl");
  const t = () => (Date.now() - started) / 1000;
  const contents: Content[] = [];

  // The files as they reach the disk, every 50 ms.
  const seen = new Map<string, number>();
  const disk: Disk[] = [];
  const walk = (d: string): string[] =>
    existsSync(d)
      ? readdirSync(d, { withFileTypes: true }).flatMap((e) =>
          e.name.startsWith(".") || CONTEXT_FILES.includes(e.name) ? [] : e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
        )
      : [];
  const poll = setInterval(() => {
    for (const f of walk(project)) {
      const size = statSync(f).size;
      const file = relative(project, f);
      if (seen.get(file) !== size) {
        seen.set(file, size);
        disk.push({ file, at: t(), size });
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
    },
    finish(extra = {}) {
      clearInterval(poll);
      const home = join(project, "pages/index.liquid");
      const summary = {
        id,
        harness,
        request,
        ...summarize(t(), contents, disk),
        files: [...seen.keys()].sort(),
        homeChars: existsSync(home) ? readFileSync(home, "utf8").length : 0,
        ...extra,
      };
      writeFileSync(join(dir, "run.json"), JSON.stringify({ summary, contents, disk }, null, 2));
      cpSync(project, join(dir, "project"), { recursive: true });
      return summary;
    },
  };
}
