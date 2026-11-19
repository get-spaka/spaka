// The tools of Upstart's own harness (ADR 0012), under the names and with the
// inputs the app already knows from Claude's (Read, Write, Edit, Bash, Glob,
// Grep; Append for Gemini's long files, Q273), so that the live preview, the
// conversation's lines and the checks read them alike. The file tools reach
// the project alone; Read also reads the skills.
import {
  appendFileSync,
  existsSync,
  globSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { z } from "zod";
import type { AgentQuestion, QuestionAnswer } from "../../../shared/conversation";
import {
  ASK_DESCRIPTION,
  ASK_TOOL,
  AskInput,
  answerResult,
  BAD_FORM,
  NOT_ANSWERED,
  PLAN_DESCRIPTION,
  PLAN_TOOL,
  readQuestions,
} from "../questions";
import { type UpstartToolDef, upstartToolName } from "../upstart-tools";
import { safeCommand } from "./bash-gate";
import type { PiFamily } from "./models";
import { runShell, type ShellPlace } from "./shell";

export type PiToolsOptions = {
  /** The project's folder. */
  root: string;
  /** Folders Read may read besides the project: the assembled skills. */
  readable: string[];
  family: PiFamily;
  /**
   * The shell's place and environment; no shell without it (Q278). Sandboxed
   * on macOS; on Windows, Git Bash with `gate`, which asks the maker about a
   * command that is not a plain file command on the project's files (Q381,
   * Q382) and resolves with why it did not run, or undefined to run it.
   */
  shell?: {
    place: ShellPlace;
    env: () => Record<string, string>;
    gate?: (
      callId: string,
      command: string,
      description: string | undefined,
      signal?: AbortSignal,
    ) => Promise<string | undefined>;
  };
  /** The provider's web search (web-search.ts); no WebSearch without it (Q276). */
  search?: (query: string, signal?: AbortSignal) => Promise<string>;
};

// biome-ignore lint/suspicious/noExplicitAny: the loop checks each call's input against the tool's schema before it runs
export type HarnessTool = AgentTool<any>;
type Result = AgentToolResult<undefined>;
const answer = (text: string): Result => ({ content: [{ type: "text", text }], details: undefined });

const fileSchema = (props: Record<string, object>, required: string[]) => ({
  type: "object",
  properties: props,
  required,
  additionalProperties: false,
});
const str = (description: string) => ({ type: "string", description });
const PATH = str("The file's path, relative to the project folder (e.g. pages/index.liquid) or absolute");

const real = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/** Where a path given by the agent lands, if it is inside one of `roots`; its path for messages. */
function place(path: string, root: string, roots: string[]): { abs: string; shown: string } | undefined {
  if (typeof path !== "string" || !path.trim()) return undefined;
  const abs = resolve(root, path);
  // The nearest folder that exists, resolved, must be inside a root: no way out through a link.
  let probe = abs;
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  const target = join(real(probe), relative(probe, abs));
  for (const r of roots.map(real)) {
    const rel = relative(r, target);
    if (!rel.startsWith("..") && !isAbsolute(rel))
      return { abs: target, shown: r === real(root) ? slashed(rel) || "." : target };
  }
  return undefined;
}

/** A path inside the project as the agent writes it, with forward slashes on every system. */
const slashed = (path: string) => path.split(sep).join("/");

const outside = (path: string) =>
  new Error(`${path} is outside the project. Upstart's agent reads and writes the project's files only.`);

const IMAGES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const SKIPPED = new Set([".git", "node_modules", ".upstart"]);

/** The file tools, the shell and the page fetch. */
export function piFileTools({ root, readable, family, shell, search }: PiToolsOptions): HarnessTool[] {
  const project = [root];
  const readRoots = [root, ...readable];
  const tools: HarnessTool[] = [
    {
      name: "Read",
      label: "Read",
      description:
        "Reads a file of the project, or of a skill. Answers with its text, from line `offset` (1 by default), at most `limit` lines (2000 by default); an image is answered as the image.",
      parameters: fileSchema(
        { file_path: PATH, offset: { type: "integer", minimum: 1 }, limit: { type: "integer", minimum: 1 } },
        ["file_path"],
      ),
      async execute(_id, { file_path, offset, limit }: { file_path: string; offset?: number; limit?: number }) {
        const at = place(file_path, root, readRoots);
        if (!at) throw outside(file_path);
        if (!existsSync(at.abs)) throw new Error(`${at.shown} does not exist.`);
        if (statSync(at.abs).isDirectory()) throw new Error(`${at.shown} is a folder: use Glob to list it.`);
        const mime = IMAGES[extname(at.abs).toLowerCase()];
        if (mime) {
          const data = readFileSync(at.abs);
          if (data.length > 4_000_000) throw new Error(`${at.shown} is too large to look at.`);
          return { content: [{ type: "image", data: data.toString("base64"), mimeType: mime }], details: undefined };
        }
        const lines = readFileSync(at.abs, "utf8").split("\n");
        const from = (offset ?? 1) - 1;
        const shown = lines.slice(from, from + (limit ?? 2000));
        const more =
          from + shown.length < lines.length
            ? `\n[${lines.length - from - shown.length} more lines: read on with offset]`
            : "";
        return answer(shown.join("\n") + more);
      },
    },
    {
      name: "Write",
      label: "Write",
      description:
        "Writes a file of the project with the content given, creating its folders; a file already there is replaced.",
      parameters: fileSchema({ file_path: PATH, content: str("The whole file") }, ["file_path", "content"]),
      async execute(_id, { file_path, content }: { file_path: string; content: string }) {
        const at = place(file_path, root, project);
        if (!at) throw outside(file_path);
        mkdirSync(dirname(at.abs), { recursive: true });
        writeFileSync(at.abs, content);
        return answer(`Wrote ${at.shown} (${content.split("\n").length} lines).`);
      },
    },
    {
      name: "Edit",
      label: "Edit",
      description:
        "Changes a file of the project: replaces `old_string`, which must appear exactly once in it (give a few lines around it to make it unique), by `new_string`; with replace_all, every occurrence.",
      parameters: fileSchema(
        {
          file_path: PATH,
          old_string: str("The exact text to replace, as the file has it"),
          new_string: str("The text that replaces it"),
          replace_all: { type: "boolean", description: "Replace every occurrence" },
        },
        ["file_path", "old_string", "new_string"],
      ),
      async execute(
        _id,
        {
          file_path,
          old_string,
          new_string,
          replace_all,
        }: { file_path: string; old_string: string; new_string: string; replace_all?: boolean },
      ) {
        const at = place(file_path, root, project);
        if (!at) throw outside(file_path);
        if (!existsSync(at.abs)) throw new Error(`${at.shown} does not exist: use Write to create it.`);
        if (!old_string) throw new Error("old_string is empty: give the text to replace.");
        const text = readFileSync(at.abs, "utf8");
        const count = text.split(old_string).length - 1;
        if (!count) throw new Error(`old_string is not in ${at.shown}: read the file and copy the text exactly.`);
        if (count > 1 && !replace_all)
          throw new Error(
            `old_string appears ${count} times in ${at.shown}: give more lines around it, or replace_all.`,
          );
        writeFileSync(
          at.abs,
          replace_all ? text.split(old_string).join(new_string) : text.replace(old_string, () => new_string),
        );
        return answer(`Edited ${at.shown}.`);
      },
    },
    {
      name: "Glob",
      label: "Glob",
      description:
        "Lists the project's files whose path matches a glob pattern, such as pages/**/*.liquid or data/*/_datasource.yaml.",
      parameters: fileSchema(
        { pattern: str("The glob pattern"), path: str("The folder to search in; the project by default") },
        ["pattern"],
      ),
      async execute(_id, { pattern, path }: { pattern: string; path?: string }) {
        const at = place(path ?? ".", root, readRoots);
        if (!at) throw outside(path ?? ".");
        const found = globSync(pattern, { cwd: at.abs })
          .filter((p) => !p.split(/[\\/]/).some((part) => SKIPPED.has(part)))
          .map(slashed)
          .sort();
        if (!found.length) return answer("No file matches.");
        return answer(found.slice(0, 300).join("\n") + (found.length > 300 ? `\n[${found.length - 300} more]` : ""));
      },
    },
    {
      name: "Grep",
      label: "Grep",
      description:
        "Searches the project's text files for a regular expression (JavaScript syntax). Answers with each matching line as file:line: text.",
      parameters: fileSchema(
        {
          pattern: str("The regular expression"),
          path: str("A folder or file to search in; the project by default"),
          glob: str("Only files whose path matches this glob, e.g. *.liquid"),
        },
        ["pattern"],
      ),
      async execute(_id, { pattern, path, glob }: { pattern: string; path?: string; glob?: string }) {
        const at = place(path ?? ".", root, readRoots);
        if (!at) throw outside(path ?? ".");
        let re: RegExp;
        try {
          re = new RegExp(pattern);
        } catch (e) {
          throw new Error(`The pattern does not read: ${(e as Error).message}`);
        }
        const files = statSync(at.abs).isDirectory()
          ? (glob ? globSync(glob.includes("/") ? glob : `**/${glob}`, { cwd: at.abs }) : walk(at.abs)).map((p) =>
              join(at.abs, p),
            )
          : [at.abs];
        const lines: string[] = [];
        for (const file of files) {
          if (file.split(/[\\/]/).some((part) => SKIPPED.has(part)) || IMAGES[extname(file).toLowerCase()]) continue;
          let text: string;
          try {
            if (statSync(file).size > 2_000_000) continue;
            text = readFileSync(file, "utf8");
          } catch {
            continue;
          }
          const rel = slashed(relative(real(root), file)) || file;
          text.split("\n").forEach((line, i) => {
            if (lines.length < 200 && re.test(line)) lines.push(`${rel}:${i + 1}: ${line.slice(0, 300)}`);
          });
        }
        return answer(lines.length ? lines.join("\n") : "No match.");
      },
    },
    ...(search
      ? [
          {
            name: "WebSearch",
            label: "WebSearch",
            description:
              "Searches the web and answers with what it found and its sources: to check a fact you are unsure of (an address, opening hours, a price), or to study what well-made sites do now. WebFetch then reads a page it found.",
            parameters: fileSchema({ query: str("What to search for, in a few words or a question") }, ["query"]),
            async execute(_id: string, { query }: { query: string }, signal?: AbortSignal) {
              if (typeof query !== "string" || !query.trim()) throw new Error("Say what to search for.");
              return answer(await search(query.trim(), signal));
            },
          } satisfies HarnessTool,
        ]
      : []),
    {
      name: "WebFetch",
      label: "WebFetch",
      description:
        "Reads a web page and answers with its text: a page the maker points you to (their current site, their social page, a menu online), or one that checks a fact.",
      parameters: fileSchema({ url: str("The page's address, https://…") }, ["url"]),
      async execute(_id, { url }: { url: string }, signal) {
        if (!/^https?:\/\//.test(url)) throw new Error("Give a full address, starting with https://.");
        const response = await fetch(url, { signal, redirect: "follow", headers: { "user-agent": "Upstart" } });
        if (!response.ok) throw new Error(`The page answered ${response.status}.`);
        const type = response.headers.get("content-type") ?? "";
        const body = await response.text();
        const text = type.includes("html") ? pageText(body) : body;
        return answer(text.slice(0, 40_000) + (text.length > 40_000 ? "\n[cut]" : ""));
      },
    },
  ];
  if (family === "gemini")
    tools.splice(2, 0, {
      name: "Append",
      label: "Append",
      description:
        "Adds content at the end of a file of the project, creating it if needed: the next part of a long file whose first part you wrote with Write (see Writing long files).",
      parameters: fileSchema({ file_path: PATH, content: str("The next part of the file") }, ["file_path", "content"]),
      async execute(_id, { file_path, content }: { file_path: string; content: string }) {
        const at = place(file_path, root, project);
        if (!at) throw outside(file_path);
        mkdirSync(dirname(at.abs), { recursive: true });
        appendFileSync(at.abs, content);
        return answer(`Added ${content.split("\n").length} lines to ${at.shown}.`);
      },
    });
  if (shell)
    tools.push({
      name: "Bash",
      label: "Bash",
      description: shell.gate
        ? "Runs a shell command (bash) in the project folder. A plain file command on the project's files (rm, mv, cp, mkdir, ls, cat, with paths inside the project) runs at once; any other waits for the maker's approval. For what the file tools cannot do, such as deleting or moving files."
        : "Runs a shell command (bash) in the project folder, in Upstart's sandbox: it may write in the project and the temporary folder only. For what the file tools cannot do, such as deleting or moving files.",
      parameters: fileSchema(
        { command: str("The command"), description: str("What it does, in a few words, for the maker") },
        ["command"],
      ),
      async execute(id, { command, description }: { command: string; description?: string }, signal) {
        if (shell.gate && !safeCommand(command, root)) {
          const refused = await shell.gate(id, command, description, signal);
          if (refused) throw new Error(refused);
        }
        const result = await runShell(command, shell.place, shell.env(), { signal });
        const output = result.output.trim() || "(no output)";
        if (result.timedOut) throw new Error(`The command took too long and was stopped.\n${output}`);
        if (result.code !== 0) throw new Error(`Exit code ${result.code}\n${output}`);
        return answer(output);
      },
    });
  // What changes the project runs in the order written: a long file's parts (Q273), an edit after a write.
  for (const tool of tools) tool.executionMode = WRITERS.has(tool.name) ? "sequential" : "parallel";
  return tools;
}

const WRITERS = new Set(["Write", "Edit", "Append", "Bash"]);

/** Upstart's own tools for the harness, under their short names; the app knows them by the SDK's. */
export function piUpstartTools(defs: UpstartToolDef[]): HarnessTool[] {
  return defs.map((def) => ({
    name: def.name,
    label: def.name,
    description: def.description,
    parameters: z.toJSONSchema(z.object(def.shape), { io: "input" }) as object,
    executionMode: def.readOnly ? "parallel" : "sequential",
    async execute(_id: string, params: unknown, signal?: AbortSignal) {
      return { content: await def.run(z.object(def.shape).parse(params), signal), details: undefined };
    },
  }));
}

/** What the maker answered a question, and what they changed by hand while it waited (Q294). */
export type Answered = { answer: QuestionAnswer; note?: string };

/**
 * The agent's questions to the maker (Q283), in the form of Claude's
 * AskUserQuestion and answered in its words. `ask` shows them and resolves
 * with the answer, or undefined when the turn stopped first.
 */
export function piAskTool(
  ask: (callId: string, questions: AgentQuestion[], signal?: AbortSignal) => Promise<Answered | undefined>,
): HarnessTool {
  return {
    name: ASK_TOOL,
    label: ASK_TOOL,
    description: ASK_DESCRIPTION,
    parameters: z.toJSONSchema(AskInput, { io: "input" }) as object,
    executionMode: "sequential",
    async execute(id: string, params: unknown, signal?: AbortSignal) {
      const questions = readQuestions(params);
      if (!questions) throw new Error(BAD_FORM);
      const got = await ask(id, questions, signal);
      if (!got) throw new Error(NOT_ANSWERED);
      return answer(answerResult(questions, got.answer) + (got.note ? `\n\n${got.note}` : ""));
    },
  };
}

/**
 * The tool the agent hands its plan in with, in plan mode (Q286, Q290):
 * `propose` shows it and resolves with what the agent reads back (approved,
 * or the maker's changes), or undefined when the turn stopped first.
 */
export function piPlanTool(
  propose: (callId: string, plan: string, signal?: AbortSignal) => Promise<string | undefined>,
): HarnessTool {
  return {
    name: PLAN_TOOL,
    label: PLAN_TOOL,
    description: PLAN_DESCRIPTION,
    parameters: fileSchema({ plan: str("The plan, as short formatted text (Markdown), in the maker's language") }, [
      "plan",
    ]),
    executionMode: "sequential",
    async execute(id: string, { plan }: { plan: string }, signal?: AbortSignal) {
      if (typeof plan !== "string" || !plan.trim()) throw new Error("Give the plan's text in `plan`.");
      const said = await propose(id, plan.trim(), signal);
      if (said === undefined) throw new Error(NOT_ANSWERED);
      return answer(said);
    },
  };
}

/** The names the app knows a harness tool by: Upstart's own under the SDK's names. */
export function canonicalTool(name: string, upstart: Set<string>): string {
  return upstart.has(name) ? upstartToolName(name) : name;
}

function walk(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(dir, rel));
    else out.push(rel);
  }
  return out;
}

/** A page's readable text, roughly: without its scripts, styles and tags. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}
