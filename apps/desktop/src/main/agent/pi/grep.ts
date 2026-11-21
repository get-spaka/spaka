// The harness's Grep, after the official binary's (Q433): a regular
// expression over the project's text files, answered as the files that match
// (by default), their matching lines with context, or a count per file.
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

export type GrepInput = {
  pattern: string;
  output_mode?: "files_with_matches" | "content" | "count";
  "-i"?: boolean;
  "-n"?: boolean;
  "-A"?: number;
  "-B"?: number;
  "-C"?: number;
  multiline?: boolean;
  head_limit?: number;
};

/** The file types Grep's `type` knows, by their extensions. */
export const GREP_TYPES: Record<string, string[]> = {
  liquid: [".liquid"],
  html: [".html", ".htm"],
  css: [".css"],
  js: [".js", ".mjs", ".cjs"],
  ts: [".ts", ".tsx", ".mts", ".cts"],
  json: [".json"],
  yaml: [".yaml", ".yml"],
  md: [".md", ".markdown"],
  svg: [".svg"],
  txt: [".txt"],
};

/** The default number of lines or files answered, as the binary's. */
export const GREP_LIMIT = 250;

/** The expression Grep reads, or why it does not read. */
export function grepExpression(input: GrepInput): RegExp {
  const flags = `${input["-i"] ? "i" : ""}${input.multiline ? "gms" : "g"}`;
  try {
    return new RegExp(input.pattern, flags);
  } catch (e) {
    throw new Error(`The pattern does not read: ${(e as Error).message}`);
  }
}

/**
 * Grep over `files` ({ path as shown, absolute path }), newest first for the
 * files that match, as the binary sorts them.
 */
export function grepFiles(files: { shown: string; abs: string }[], input: GrepInput): string {
  const re = grepExpression(input);
  const mode = input.output_mode ?? "files_with_matches";
  const limit = input.head_limit && input.head_limit > 0 ? input.head_limit : GREP_LIMIT;
  const after = input["-A"] ?? input["-C"] ?? 0;
  const before = input["-B"] ?? input["-C"] ?? 0;
  const numbered = input["-n"] ?? true;
  const matched: { shown: string; mtime: number; count: number; lines: string[] }[] = [];
  for (const file of files) {
    let text: string;
    let mtime: number;
    try {
      const stat = statSync(file.abs);
      if (stat.size > 2_000_000 || BINARY.has(extname(file.abs).toLowerCase())) continue;
      text = readFileSync(file.abs, "utf8");
      mtime = stat.mtimeMs;
    } catch {
      continue;
    }
    if (text.includes("\u0000")) continue;
    const lines = text.split("\n");
    const hit = new Set<number>();
    let count = 0;
    if (input.multiline) {
      // A match may span lines: every line it covers is a hit.
      const starts = lineStarts(text);
      for (const m of text.matchAll(re)) {
        count++;
        const first = lineAt(starts, m.index);
        const last = lineAt(starts, m.index + Math.max(m[0].length - 1, 0));
        for (let i = first; i <= last; i++) hit.add(i);
        if (!m[0].length) re.lastIndex++;
      }
    } else
      lines.forEach((line, i) => {
        re.lastIndex = 0;
        const n = [...line.matchAll(re)].length;
        if (n) {
          hit.add(i);
          count += n;
        }
      });
    if (!count) continue;
    const shownLines: string[] = [];
    if (mode === "content") {
      const keep = new Set<number>();
      for (const i of hit)
        for (let j = Math.max(0, i - before); j <= Math.min(lines.length - 1, i + after); j++) keep.add(j);
      let previous = -2;
      for (const i of [...keep].sort((a, b) => a - b)) {
        if (previous >= 0 && i > previous + 1) shownLines.push("--");
        const mark = hit.has(i) ? ":" : "-";
        const text = lines[i]!.length > 500 ? `${lines[i]!.slice(0, 500)}…` : lines[i]!;
        shownLines.push(`${file.shown}${numbered ? `${mark}${i + 1}` : ""}${mark}${text}`);
        previous = i;
      }
    }
    matched.push({ shown: file.shown, mtime, count, lines: shownLines });
  }
  if (!matched.length) return "No match.";
  if (mode === "files_with_matches") {
    const names = matched.sort((a, b) => b.mtime - a.mtime).map((m) => m.shown);
    return cut(names, limit, `Found ${names.length} file${names.length > 1 ? "s" : ""}`);
  }
  if (mode === "count") {
    const counts = matched.map((m) => `${m.shown}:${m.count}`);
    return cut(counts, limit, `${matched.reduce((n, m) => n + m.count, 0)} matches in ${matched.length} files`);
  }
  return cut(
    matched.flatMap((m) => m.lines),
    limit,
  );
}

function cut(lines: string[], limit: number, head?: string): string {
  const shown = lines.slice(0, limit);
  const more = lines.length > limit ? `\n[${lines.length - limit} more: narrow the search, or raise head_limit]` : "";
  return `${head ? `${head}\n` : ""}${shown.join("\n")}${more}`;
}

const BINARY = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
  ".ico",
  ".pdf",
  ".zip",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".mp4",
  ".webm",
  ".mp3",
]);

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}

function lineAt(starts: number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
