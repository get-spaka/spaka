// opencode 2 through `opencode run --format json` with a private server, apart
// from the maker's own opencode (XDG folders, its database, no Claude Code
// files), confined by Upstart's sandbox profile since it has none. The
// instructions go in the project's AGENTS.md.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { BIN, confined, homeOf, INSTRUCTIONS, REQUESTS, type Run } from "./common.ts";

export async function runOpencode(run: Run, opts: { model?: string; env?: Record<string, string> }): Promise<Record<string, unknown>> {
  writeFileSync(join(run.project, "AGENTS.md"), INSTRUCTIONS);
  const home = homeOf("opencode");
  for (const d of ["data", "config", "cache", "state"]) mkdirSync(join(home, d), { recursive: true });
  const args = ["run", "--format", "json", "--standalone", "--auto", "--archived"];
  if (opts.model) args.push("--model", opts.model);
  args.push(REQUESTS[run.request]);
  const [command, argv] = confined(join(BIN, "opencode"), args, [run.project, home]);
  const child = spawn(command, argv, {
    cwd: run.project,
    env: {
      ...process.env,
      ...opts.env,
      XDG_DATA_HOME: join(home, "data"),
      XDG_CONFIG_HOME: join(home, "config"),
      XDG_CACHE_HOME: join(home, "cache"),
      XDG_STATE_HOME: join(home, "state"),
      OPENCODE_CONFIG_DIR: join(home, "config/opencode"),
      OPENCODE_DISABLE_CLAUDE_CODE: "1",
      // opencode takes its folder from PWD, which the spike's shell would otherwise give it.
      PWD: run.project,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let finished: (summary: Record<string, unknown>) => void;
  const done = new Promise<Record<string, unknown>>((r) => (finished = r));
  const types: Record<string, number> = {};
  let output = 0;
  let cost = 0;
  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        run.event("text", line);
        continue;
      }
      const type = msg.type ?? msg.event ?? "?";
      types[type] = (types[type] ?? 0) + 1;
      run.event(type, msg);
      const part = msg.part ?? {};
      if (type === "step_finish") {
        output += part.tokens?.output ?? 0;
        cost += part.cost ?? 0;
      }
      // opencode 2's events carry a tool's input once the call is complete: the
      // files a patch adds or a write writes, whole.
      if (type === "tool_use" && part.state?.status === "completed") {
        const input = part.state.input ?? {};
        if (typeof input.patchText === "string")
          for (const [, path, body] of input.patchText.matchAll(/\*\*\* (?:Add|Update) File: (.+)\n([\s\S]*?)(?=\n\*\*\* |$)/g))
            run.content(relative(run.project, resolve(run.project, path!)), body!.length, false);
        else if (typeof input.content === "string" && (input.filePath || input.path))
          run.content(relative(run.project, resolve(run.project, input.filePath ?? input.path)), input.content.length, false);
      }
    }
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  child.on("exit", (code) => finished(run.finish({ model: opts.model, outputTokens: output, cost: Number(cost.toFixed(4)), exit: code, types, stderr: stderr.slice(-2000) })));
  return done;
}
