// What the agent is told right after it writes a datasource's file (Q170):
// a record whose fields do not read is left out of the site (Q166), and the
// agent fixes it in the same turn instead of finishing with a post missing.
// A text holding a colon followed by a space, which French typography puts
// everywhere ("Pluie : parapluie"), Spaka quotes itself (Q551).
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { Datasources, DEFINITION_FILE, TEST_RECORDS_DIR } from "@spaka/runtime";
import { diskSource } from "@spaka/runtime/node";

const DATA_FILE = /^(?:data|\.spaka\/test-records)\/([a-z0-9][\w-]*)\/([^/]+)$/i;

/** The datasource files a tool call touched: the one it wrote, or every one for a command. */
function touched(root: string, tool: string, input: unknown): string[] | "all" {
  if (tool === "Bash") return "all";
  const path = (input as { file_path?: unknown } | undefined)?.file_path;
  if (typeof path !== "string") return [];
  const rel = (isAbsolute(path) ? relative(root, path) : path).split("\\").join("/");
  return DATA_FILE.test(rel) ? [rel] : [];
}

/** Why the datasource files a tool call wrote do not read, for the agent; undefined when they do. */
export function dataProblemsAfter(root: string, tool: string, input: unknown): string | undefined {
  const files = touched(root, tool, input);
  if (files !== "all" && !files.length) return undefined;
  const read = () => new Datasources(diskSource(root), { testRecords: diskSource(join(root, TEST_RECORDS_DIR)) });
  let data: Datasources;
  try {
    data = read();
  } catch {
    return undefined;
  }
  const names = files === "all" ? data.names() : [...new Set(files.map((f) => DATA_FILE.exec(f)![1]!))].filter(Boolean);
  const quoted = quoteLeftOut(root, data, names, files);
  if (quoted.length) data = read();
  const lines: string[] = [];
  for (const name of names) {
    const definitionFile = `data/${name}/${DEFINITION_FILE}`;
    if (files === "all" || files.includes(definitionFile)) {
      const problem = data.definition(name).problem;
      if (problem) lines.push(`- ${definitionFile} does not read: ${problem}`);
    }
    for (const record of data.get(name).problems) {
      if (files !== "all" && !files.includes(record.file)) continue;
      lines.push(
        record.skipped
          ? `- ${record.file} is left out of the site: ${record.problems.join("; ")}`
          : `- ${record.file}: ${record.problems.join("; ")}`,
      );
    }
  }
  const said = quoted.length
    ? `Spaka put between double quotes, in ${quoted.join(", ")}, the texts that held a colon followed by a space, which YAML could not read: read the file again before you change it, and quote such a text yourself next time.`
    : undefined;
  if (!lines.length) return said;
  const problems = `Spaka could not use what you just wrote:\n${lines.join("\n")}\nFix it now, before you go on: quote a text that holds a colon followed by a space, or that starts with a sign YAML reads (the datasources skill lists them).`;
  return said ? `${said}\n${problems}` : problems;
}

/**
 * The records left out of the site among those written, each with its texts
 * holding ": " put between double quotes, when that makes it read; the files
 * changed. A record that still does not read is put back as it was.
 */
function quoteLeftOut(root: string, data: Datasources, names: string[], files: string[] | "all"): string[] {
  const changed: string[] = [];
  for (const name of names)
    for (const record of data.get(name).problems) {
      if (!record.skipped || (files !== "all" && !files.includes(record.file))) continue;
      const path = join(root, record.file);
      const text = readFileSync(path, "utf8");
      const fixed = quoteColons(text);
      if (fixed === text) continue;
      writeFileSync(path, fixed);
      const again = new Datasources(diskSource(root), { testRecords: diskSource(join(root, TEST_RECORDS_DIR)) });
      if (again.get(name).problems.some((r) => r.file === record.file && r.skipped)) writeFileSync(path, text);
      else changed.push(record.file);
    }
  return changed;
}

/** A field of the front matter, at its top level, its value plain (not quoted, not a list, a map or a block). */
const PLAIN_FIELD = /^([A-Za-z_][\w-]*):[ \t]+([^"'|>[{&*!%@`#\s].*?)[ \t]*$/;

/** The front matter's plain values holding ": " (or ending with ":"), written as double-quoted strings. */
export function quoteColons(text: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return text;
  const front = m[1]!
    .split("\n")
    .map((line) => {
      const field = PLAIN_FIELD.exec(line.replace(/\r$/, ""));
      if (!field) return line;
      const value = field[2]!;
      if (!/:(?:\s|$)/.test(value)) return line;
      return `${field[1]}: ${JSON.stringify(value)}${line.endsWith("\r") ? "\r" : ""}`;
    })
    .join("\n");
  const start = m.index + m[0].indexOf("\n") + 1;
  return text.slice(0, start) + front + text.slice(start + m[1]!.length);
}
