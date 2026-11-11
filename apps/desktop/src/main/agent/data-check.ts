// What the agent is told right after it writes a datasource's file (Q170):
// a record whose fields do not read is left out of the site (Q166), and the
// agent fixes it in the same turn instead of finishing with a post missing.
import { isAbsolute, relative } from "node:path";
import { Datasources, DEFINITION_FILE } from "@upstart/runtime";
import { diskSource } from "@upstart/runtime/node";

const DATA_FILE = /^data\/([a-z0-9][\w-]*)\/([^/]+)$/i;

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
  let data: Datasources;
  try {
    data = new Datasources(diskSource(root));
  } catch {
    return undefined;
  }
  const lines: string[] = [];
  const names = files === "all" ? data.names() : [...new Set(files.map((f) => DATA_FILE.exec(f)![1]!))].filter(Boolean);
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
  if (!lines.length) return undefined;
  return `Upstart could not use what you just wrote:\n${lines.join("\n")}\nFix it now, before you go on: quote a text that holds a colon followed by a space, or that starts with a sign YAML reads (the datasources skill lists them).`;
}
