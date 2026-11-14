// Pi in RPC mode (JSONL over stdio), apart from the maker's own Pi: its own
// agent folder, no skills, context files or project settings of theirs.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { BIN, confined, homeOf, INSTRUCTIONS, REQUESTS, type Run } from "./common.ts";
import { partialWrite } from "./partial.ts";

/**
 * Upstart's own way of writing a file, for a harness of its own: the file in
 * the reply's text, which every provider streams as it is generated, where a
 * tool call's arguments come whole from some (Gemini).
 */
const TEXT_FILES = `

# Writing files

Do not use a tool to create or replace a file. Write the whole file in your reply instead, in a block of its own:

<file path="pages/index.liquid">
…the file's whole content…
</file>

The opening and closing lines hold nothing else, and no Markdown fence surrounds the block. Upstart writes each block into the project as it arrives, creating its folders. Write the files one after another, then say in a sentence or two what you made. Use the edit tool only for a small change to a file that already exists.`;

const textInstructions = () =>
  INSTRUCTIONS.replace(
    "Write each new file with a single call of your file-writing tool, top to bottom in reading order. Use your editing tool for later changes.",
    "Write each new file in one block, top to bottom in reading order (see Writing files). Use your editing tool for later changes.",
  ).replace("(your file-writing tool creates folders)", "(Upstart creates folders)") + TEXT_FILES;

export async function runPi(
  run: Run,
  opts: { model?: string; env?: Record<string, string>; textFiles?: boolean; thinking?: string },
): Promise<Record<string, unknown>> {
  const args = [
    "--mode",
    "rpc",
    "--no-session",
    "--no-skills",
    "--no-context-files",
    "--no-approve",
    "--no-extensions",
    "--no-prompt-templates",
    "--append-system-prompt",
    opts.textFiles ? textInstructions() : INSTRUCTIONS,
    // Files written in the reply's text: no write tool to fall back on.
    ...(opts.textFiles ? ["--tools", "read,edit,bash"] : []),
  ];
  if (opts.model) args.push("--model", opts.model);
  if (opts.thinking) args.push("--thinking", opts.thinking);
  const [command, argv] = confined(join(BIN, "pi"), args, [run.project, homeOf("pi")]);
  const child = spawn(command, argv, {
    cwd: run.project,
    env: { ...process.env, ...opts.env, PWD: run.project, PI_CODING_AGENT_DIR: homeOf("pi"), PI_TELEMETRY: "0", PI_OFFLINE: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let finished: (summary: Record<string, unknown>) => void;
  const done = new Promise<Record<string, unknown>>((r) => (finished = r));
  // Each tool call's arguments as they arrive, by content index.
  const calls = new Map<number, { name: string; json: string; last: number }>();
  let usage: unknown;
  let output = 0;
  let cost = 0;
  let model = opts.model ?? "";
  // The reply's text, by content index, and the file blocks read from it so far.
  const texts = new Map<number, string>();
  const blocks = new Map<string, { last: number; written: boolean }>();
  const readBlocks = (text: string) => {
    for (const m of text.matchAll(/<file path="([^"]+)">\n?([\s\S]*?)(\n<\/file>|$)/g)) {
      const path = m[1]!;
      const closed = !!m[3];
      // A closing tag cut in the middle is not content.
      const body = closed ? m[2]! : m[2]!.replace(/\n<(\/(f(i(le?)?)?)?)?$/, "");
      const b = blocks.get(path) ?? { last: -1, written: false };
      blocks.set(path, b);
      if (b.written) continue;
      if (closed) {
        const abs = join(run.project, path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, `${body}\n`);
        run.content(relative(run.project, abs), body.length, false);
        b.written = true;
      } else if (body.length > b.last) {
        run.content(relative(run.project, join(run.project, path)), body.length, true);
        b.last = body.length;
      }
    }
  };

  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      const e = msg.assistantMessageEvent;
      run.event(msg.type + (e ? `:${e.type}` : ""), e?.type === "toolcall_delta" ? { i: e.contentIndex, n: e.delta.length } : msg);
      if (msg.usage) usage = msg.usage;
      if (e?.type === "text_delta") {
        texts.set(e.contentIndex, (texts.get(e.contentIndex) ?? "") + e.delta);
        if (opts.textFiles) readBlocks(texts.get(e.contentIndex)!);
      } else if (e?.type === "toolcall_start") calls.set(e.contentIndex, { name: e.toolName, json: "", last: 0 });
      else if (e?.type === "toolcall_delta") {
        const call = calls.get(e.contentIndex);
        if (!call) continue;
        call.json += e.delta;
        if (call.name === "write" || call.name === "edit") {
          const { path, content } = partialWrite(call.json);
          if (path && content !== undefined && content.length !== call.last) {
            run.content(relative(run.project, join(run.project, path)), content.length, true);
            call.last = content.length;
          }
        }
      } else if (e?.type === "toolcall_end") {
        const tc = e.toolCall;
        if (tc?.name === "write") run.content(relative(run.project, join(run.project, tc.arguments.path)), tc.arguments.content?.length ?? 0, false);
      } else if (msg.type === "message_end" && msg.message?.role === "assistant") {
        if (msg.message.model) model = msg.message.model;
        const u = msg.message.usage;
        if (u) {
          output += u.output ?? 0;
          cost += u.cost?.total ?? 0;
        }
      }
      else if (msg.type === "agent_settled") finished(run.finish({ model, outputTokens: output, cost: Number(cost.toFixed(4)), textFiles: !!opts.textFiles, thinking: opts.thinking }));
      else if (msg.type === "response" && msg.success === false) finished(run.finish({ model, error: msg.error }));
    }
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  child.on("exit", (code) => finished(run.finish({ model, exit: code, stderr: stderr.slice(-2000) })));
  child.stdin.write(`${JSON.stringify({ id: "p1", type: "prompt", message: REQUESTS[run.request] })}\n`);
  const summary = await done;
  child.kill();
  return summary;
}
