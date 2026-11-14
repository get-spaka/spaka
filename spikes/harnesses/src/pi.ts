// Pi in RPC mode (JSONL over stdio), apart from the maker's own Pi: its own
// agent folder, no skills, context files or project settings of theirs.
import { spawn } from "node:child_process";
import { join, relative } from "node:path";
import { BIN, confined, homeOf, INSTRUCTIONS, REQUESTS, type Run } from "./common.ts";
import { partialWrite } from "./partial.ts";
import { blockReader, textInstructions } from "./text-files.ts";

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
  // OpenAI without a key in keys.env: Pi's Sign in with ChatGPT (homes/pi/auth.json).
  const account = opts.model?.startsWith("openai/") && !opts.env?.OPENAI_API_KEY ? "chatgpt" : undefined;
  // The reply's text, by content index, and the file blocks read from it so far.
  const texts = new Map<number, string>();
  const readBlocks = blockReader(run);

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
      else if (msg.type === "agent_settled") finished(run.finish({ model, outputTokens: output, cost: Number(cost.toFixed(4)), textFiles: !!opts.textFiles, thinking: opts.thinking, account }));
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
