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
import { GREP_LIMIT, GREP_TYPES, type GrepInput, grepExpression, grepFiles } from "./grep";
import type { PiFamily } from "./models";
import { runShell, type ShellPlace } from "./shell";
import { type FetchedPage, fetchAnswer, fetchPage } from "./web-fetch";

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
  search?: (query: string, signal: AbortSignal | undefined, callId: string) => Promise<string>;
  /** Answers WebFetch's prompt from a page, with the account's small model; the page itself without it. */
  summarize?: (page: FetchedPage, prompt: string, signal?: AbortSignal) => Promise<string | undefined>;
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
// Never searched: the project's history and installed packages. Its .upstart/ folder is, when asked for by name (Q433).
const SKIPPED = new Set([".git", "node_modules"]);
const GLOB_LIMIT = 100;
const BASH_DEFAULT_MS = 120_000;
const BASH_MAX_MS = 600_000;

/** The most an image's longer side keeps when Read shows it, as the binary resizes them. */
const IMAGE_SIDE = 1568;
/** A line longer than this is cut when Read shows it. */
const LINE_LIMIT = 2000;
/** A PDF of more pages than this is read some pages at a time. */
const PDF_PAGES = 10;

/** A file's text as Read shows it: numbered from `from`, as `cat -n` does, long lines cut. */
export function numbered(lines: string[], from: number): string {
  return lines
    .map((line, i) => {
      const text = line.length > LINE_LIMIT ? `${line.slice(0, LINE_LIMIT)}… [line cut]` : line;
      return `${String(from + i).padStart(6)}\t${text}`;
    })
    .join("\n");
}

/** Pages "3", "1-5" or "2,4-6" of `total`, at most 20. */
export function pagesOf(spec: string, total: number): number[] {
  const pages = new Set<number>();
  for (const part of spec.split(",")) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part);
    if (!m) throw new Error(`pages reads as "3", "1-5" or "2,4-6", not "${spec}".`);
    const first = Number(m[1]);
    const last = m[2] ? Number(m[2]) : first;
    for (let p = first; p <= last; p++) if (p >= 1 && p <= total) pages.add(p);
  }
  const list = [...pages].sort((a, b) => a - b);
  if (!list.length) throw new Error(`The PDF has ${total} pages.`);
  if (list.length > 20) throw new Error("At most 20 pages a read.");
  return list;
}

/** The file tools, the shell and the page fetch. */
export function piFileTools({ root, readable, family, shell, search, summarize }: PiToolsOptions): HarnessTool[] {
  const project = [root];
  const readRoots = [root, ...readable];
  // The files read in this session, with when they were last changed then: a file is read before it is
  // changed, and read again once changed by someone else (the maker's hand edits, Q294), as the binary asks.
  const known = new Map<string, number>();
  const stamp = (abs: string) => {
    try {
      return statSync(abs).mtimeMs;
    } catch {
      return undefined;
    }
  };
  const noteRead = (abs: string) => {
    const at = stamp(abs);
    if (at !== undefined) known.set(abs, at);
  };
  const readFirst = (at: { abs: string; shown: string }) => {
    if (!existsSync(at.abs)) return;
    const read = known.get(at.abs);
    if (read === undefined) throw new Error(`Read ${at.shown} before changing it.`);
    if (stamp(at.abs) !== read)
      throw new Error(
        `${at.shown} changed since you read it (the maker or one of Upstart's tools may have edited it): read it again before changing it.`,
      );
  };
  const tools: HarnessTool[] = [
    {
      name: "Read",
      label: "Read",
      description:
        'Reads a file of the project, or of a skill. Answers with its lines numbered as `cat -n` does (the number, a tab, then the line), from line `offset` (1 by default), at most `limit` lines (2000 by default); a line longer than 2000 characters is cut. An image is answered as the image, a PDF as its text page by page (`pages`, such as "1-5", for one of more than 10 pages). Read a file before you change it with Edit or Write.',
      parameters: fileSchema(
        {
          file_path: PATH,
          offset: { type: "integer", minimum: 1, description: "The line to start from" },
          limit: { type: "integer", minimum: 1, description: "How many lines to read" },
          pages: str('For a PDF: the pages to read, such as "3" or "1-5"'),
        },
        ["file_path"],
      ),
      async execute(
        _id,
        { file_path, offset, limit, pages }: { file_path: string; offset?: number; limit?: number; pages?: string },
      ) {
        const at = place(file_path, root, readRoots);
        if (!at) throw outside(file_path);
        if (!existsSync(at.abs)) throw new Error(`${at.shown} does not exist.`);
        if (statSync(at.abs).isDirectory()) throw new Error(`${at.shown} is a folder: use Glob to list it.`);
        const ext = extname(at.abs).toLowerCase();
        if (IMAGES[ext]) {
          const image = await imageToShow(at.abs);
          noteRead(at.abs);
          return { content: [{ type: "image", ...image }], details: undefined };
        }
        if (ext === ".pdf") {
          const { getDocumentProxy, extractText } = await import("unpdf");
          const pdf = await getDocumentProxy(new Uint8Array(readFileSync(at.abs)));
          if (!pages && pdf.numPages > PDF_PAGES)
            throw new Error(
              `${at.shown} has ${pdf.numPages} pages: read it some pages at a time with pages, such as "1-5".`,
            );
          const { text } = await extractText(pdf, { mergePages: false });
          const wanted = pages ? pagesOf(pages, pdf.numPages) : text.map((_t, i) => i + 1);
          noteRead(at.abs);
          return answer(
            wanted.map((p) => `--- Page ${p} of ${pdf.numPages} ---\n${(text[p - 1] ?? "").trim()}`).join("\n\n"),
          );
        }
        const content = readFileSync(at.abs, "utf8");
        noteRead(at.abs);
        if (!content) return answer(`(${at.shown} is empty.)`);
        const lines = content.split("\n");
        const from = (offset ?? 1) - 1;
        if (from >= lines.length)
          return answer(`(${at.shown} has ${lines.length} lines: offset ${offset} is past its end.)`);
        const shown = lines.slice(from, from + (limit ?? 2000));
        const more =
          from + shown.length < lines.length
            ? `\n[${lines.length - from - shown.length} more lines: read on with offset ${from + shown.length + 1}]`
            : "";
        return answer(numbered(shown, from + 1) + more);
      },
    },
    {
      name: "Write",
      label: "Write",
      description:
        "Writes a file of the project with the content given, creating its folders. A file already there is replaced: read it first.",
      parameters: fileSchema({ file_path: PATH, content: str("The whole file") }, ["file_path", "content"]),
      async execute(_id, { file_path, content }: { file_path: string; content: string }) {
        const at = place(file_path, root, project);
        if (!at) throw outside(file_path);
        readFirst(at);
        mkdirSync(dirname(at.abs), { recursive: true });
        writeFileSync(at.abs, content);
        noteRead(at.abs);
        return answer(`Wrote ${at.shown} (${content.split("\n").length} lines).`);
      },
    },
    {
      name: "Edit",
      label: "Edit",
      description:
        "Changes a file of the project, read first: replaces `old_string`, which must appear exactly once in it (give a few lines around it to make it unique), by `new_string`; with replace_all, every occurrence. Copy old_string as the file has it, without the line numbers Read puts before each line.",
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
        readFirst(at);
        if (!old_string) throw new Error("old_string is empty: give the text to replace.");
        if (old_string === new_string) throw new Error("old_string and new_string are the same: nothing to change.");
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
        noteRead(at.abs);
        return answer(`Edited ${at.shown}.`);
      },
    },
    {
      name: "Glob",
      label: "Glob",
      description:
        "Lists the project's files whose path matches a glob pattern, such as pages/**/*.liquid, data/*/_datasource.yaml or .upstart/test-records/**/*.md, the most recently changed first.",
      parameters: fileSchema(
        { pattern: str("The glob pattern"), path: str("The folder to search in; the project by default") },
        ["pattern"],
      ),
      async execute(_id, { pattern, path }: { pattern: string; path?: string }) {
        const at = place(path ?? ".", root, readRoots);
        if (!at) throw outside(path ?? ".");
        const found = globSync(pattern, { cwd: at.abs })
          .filter((p) => !p.split(/[\\/]/).some((part) => SKIPPED.has(part)))
          .flatMap((p) => {
            const abs = join(at.abs, p);
            try {
              const stat = statSync(abs);
              return stat.isFile() ? [{ path: slashed(p), mtime: stat.mtimeMs }] : [];
            } catch {
              return [];
            }
          })
          .sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path))
          .map((f) => f.path);
        if (!found.length) return answer("No file matches.");
        return answer(
          found.slice(0, GLOB_LIMIT).join("\n") +
            (found.length > GLOB_LIMIT ? `\n[${found.length - GLOB_LIMIT} more: narrow the pattern]` : ""),
        );
      },
    },
    {
      name: "Grep",
      label: "Grep",
      description:
        'Searches the project\'s text files for a regular expression (JavaScript syntax). By default answers with the files that match, the most recently changed first; output_mode "content" gives the matching lines as file:line:text (with -A, -B or -C lines around them), "count" the matches per file. -i ignores case; multiline lets a match span lines.',
      parameters: fileSchema(
        {
          pattern: str("The regular expression"),
          path: str("A folder or file to search in; the project by default"),
          glob: str("Only files whose path matches this glob, e.g. *.liquid or pages/**/*.liquid"),
          type: str(`Only files of this type: ${Object.keys(GREP_TYPES).join(", ")}`),
          output_mode: { type: "string", enum: ["files_with_matches", "content", "count"] },
          "-i": { type: "boolean", description: "Ignore case" },
          "-n": { type: "boolean", description: "Line numbers in content mode (on by default)" },
          "-A": { type: "integer", minimum: 0, description: "Lines after each match, in content mode" },
          "-B": { type: "integer", minimum: 0, description: "Lines before each match, in content mode" },
          "-C": { type: "integer", minimum: 0, description: "Lines before and after each match, in content mode" },
          multiline: { type: "boolean", description: "Let . match newlines and a match span lines" },
          head_limit: {
            type: "integer",
            minimum: 1,
            description: `At most this many lines or files (${GREP_LIMIT} by default)`,
          },
        },
        ["pattern"],
      ),
      async execute(_id, input: GrepInput & { path?: string; glob?: string; type?: string }) {
        const at = place(input.path ?? ".", root, readRoots);
        if (!at) throw outside(input.path ?? ".");
        grepExpression(input);
        const types = input.type ? GREP_TYPES[input.type] : undefined;
        if (input.type && !types) throw new Error(`type is one of ${Object.keys(GREP_TYPES).join(", ")}.`);
        const isDir = statSync(at.abs).isDirectory();
        const paths = isDir
          ? (input.glob
              ? globSync(input.glob.includes("/") ? input.glob : `**/${input.glob}`, { cwd: at.abs }).filter(
                  (p) => !p.split(/[\\/]/).some((part) => SKIPPED.has(part)),
                )
              : walk(at.abs)
            ).map((p) => join(at.abs, p))
          : [at.abs];
        const files = paths
          .filter((abs) => !types || types.includes(extname(abs).toLowerCase()))
          .map((abs) => ({ abs, shown: slashed(relative(real(root), abs)) || abs }));
        return answer(grepFiles(files, input));
      },
    },
    ...(search
      ? [
          {
            name: "WebSearch",
            label: "WebSearch",
            description:
              "Searches the web and answers with what it found and its sources: to check a fact you are unsure of (an address, opening hours, a price). WebFetch then reads a page it found.",
            parameters: fileSchema({ query: str("What to search for, in a few words or a question") }, ["query"]),
            async execute(id: string, { query }: { query: string }, signal?: AbortSignal) {
              if (typeof query !== "string" || !query.trim()) throw new Error("Say what to search for.");
              return answer(await search(query.trim(), signal, id));
            },
          } satisfies HarnessTool,
        ]
      : []),
    {
      name: "WebFetch",
      label: "WebFetch",
      description:
        "Reads a web page and answers `prompt` from it: a page the maker points you to (their current site, their social page, a menu online), or one that checks a fact. An http address is read over https; a page that sends to another site is not followed: you are told where, to fetch that address instead.",
      parameters: fileSchema(
        { url: str("The page's address, https://…"), prompt: str("What to find or take from the page") },
        ["url", "prompt"],
      ),
      async execute(_id, { url, prompt }: { url: string; prompt: string }, signal) {
        const page = await fetchPage(url, signal);
        if ("redirect" in page)
          return answer(`The page sends to another site: ${page.redirect}. Fetch that address to read it.`);
        const said = summarize && prompt?.trim() ? await summarize(page, prompt.trim(), signal) : undefined;
        return answer(fetchAnswer(page, said));
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
        readFirst(at);
        mkdirSync(dirname(at.abs), { recursive: true });
        appendFileSync(at.abs, content);
        noteRead(at.abs);
        return answer(`Added ${content.split("\n").length} lines to ${at.shown}.`);
      },
    });
  if (shell)
    tools.push({
      name: "Bash",
      label: "Bash",
      description: `${
        shell.gate
          ? "Runs a shell command (bash) in the project folder. A plain file command on the project's files (rm, mv, cp, mkdir, ls, cat, with paths inside the project) runs at once; any other waits for the maker's approval."
          : "Runs a shell command (bash) in the project folder, in Upstart's sandbox: it may write in the project and the temporary folder only."
      } For what the file tools cannot do, such as deleting or moving files. It stops after \`timeout\` milliseconds (2 minutes by default, 10 at most).`,
      parameters: fileSchema(
        {
          command: str("The command"),
          description: str("What it does, in a few words, for the maker"),
          timeout: {
            type: "integer",
            minimum: 1000,
            maximum: BASH_MAX_MS,
            description: "Milliseconds before it is stopped",
          },
        },
        ["command"],
      ),
      async execute(
        id,
        { command, description, timeout }: { command: string; description?: string; timeout?: number },
        signal,
      ) {
        if (shell.gate && !safeCommand(command, root)) {
          const refused = await shell.gate(id, command, description, signal);
          if (refused) throw new Error(refused);
        }
        const timeoutMs = Math.min(Math.max(timeout ?? BASH_DEFAULT_MS, 1000), BASH_MAX_MS);
        const result = await runShell(command, shell.place, shell.env(), { signal, timeoutMs });
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
    // Hidden folders and files (.upstart/, .git) only when the search names them, as Glob does.
    if (SKIPPED.has(entry.name) || entry.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(dir, rel));
    else out.push(rel);
  }
  return out;
}

/** An image as Read shows it: as it is when small enough, else its longer side brought to IMAGE_SIDE. */
async function imageToShow(abs: string): Promise<{ data: string; mimeType: string }> {
  const data = readFileSync(abs);
  const mime = IMAGES[extname(abs).toLowerCase()]!;
  const sharp = (await import("sharp")).default;
  const meta = await sharp(data).metadata();
  const small = (meta.width ?? 0) <= IMAGE_SIDE && (meta.height ?? 0) <= IMAGE_SIDE && data.length <= 3_750_000;
  if (small && mime !== "image/gif") return { data: data.toString("base64"), mimeType: mime };
  const resized = sharp(data, { animated: false }).resize(IMAGE_SIDE, IMAGE_SIDE, {
    fit: "inside",
    withoutEnlargement: true,
  });
  const out = meta.hasAlpha ? await resized.png().toBuffer() : await resized.jpeg({ quality: 85 }).toBuffer();
  return { data: out.toString("base64"), mimeType: meta.hasAlpha ? "image/png" : "image/jpeg" };
}
