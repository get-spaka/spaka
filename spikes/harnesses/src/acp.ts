// Google's two agents driven over ACP (Agent Client Protocol: JSON-RPC 2.0 over
// stdio), signed in with the maker's Gemini API key from AI Studio, the one
// sign-in Google allows an app to use, and confined by Upstart's sandbox profile:
// - Gemini CLI (`gemini --acp`), apart from the maker's own (GEMINI_CLI_HOME, its
//   own system settings files, no keychain);
// - Antigravity CLI (`antigravity acp`, the release binary in .agy/bin), apart
//   from the maker's own by HOME alone, since it has no folder variable.
// The instructions go in the project's GEMINI.md, which both read. Upstart, as
// the ACP client, writes the files itself when the agent asks it to
// (fs/write_text_file) and answers permission requests.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { BIN, confined, homeOf, INSTRUCTIONS, REQUESTS, ROOT, type Run } from "./common.ts";
import { blockReader, textInstructions } from "./text-files.ts";

export type AcpAgent = "gemini" | "antigravity";

/**
 * The turn's tokens, priced as on the Gemini API (Hydrogen $1.50 / $7.50 per
 * million, cached reads $0.075). Gemini CLI's inputTokens include the cached
 * reads; Antigravity's leave them out (its cached reads exceed its input).
 */
export function cost(agent: AcpAgent, usage: any, model = "") {
  if (!usage) return {};
  // Argon and Carbon: $2 / $10, cached reads $0.20 (until the price doubles on 2026-12-01).
  const [inP, cachedP, outP] = /argon|carbon/.test(model) ? [2, 0.2, 10] : [1.5, 0.075, 7.5];
  const cached = usage.cachedReadTokens ?? 0;
  const fresh = agent === "gemini" ? (usage.inputTokens ?? 0) - cached : (usage.inputTokens ?? 0);
  return {
    inputTokens: fresh + cached,
    cachedReadTokens: cached,
    outputTokens: usage.outputTokens ?? 0,
    cost: Number(((fresh * inP + cached * cachedP + (usage.outputTokens ?? 0) * outP) / 1e6).toFixed(4)),
  };
}

function setUp(agent: AcpAgent, run: Run, opts: { model?: string; env?: Record<string, string>; textFiles?: boolean }) {
  const home = homeOf(agent);
  if (agent === "gemini") {
    mkdirSync(join(home, ".gemini"), { recursive: true });
    writeFileSync(join(home, "system-settings.json"), "{}");
    writeFileSync(
      join(home, ".gemini/settings.json"),
      JSON.stringify(
        {
          security: { auth: { selectedType: "gemini-api-key" }, folderTrust: { enabled: false } },
          privacy: { usageStatisticsEnabled: false },
          telemetry: { enabled: false },
          general: { disableAutoUpdate: true, disableUpdateNag: true },
          // Files written in the reply's text: no write tool to fall back on.
          tools: opts.textFiles ? { exclude: ["write_file"] } : {},
        },
        null,
        2,
      ),
    );
    const args = ["--acp", "--approval-mode", "auto_edit"];
    if (opts.model) args.push("--model", opts.model);
    return {
      home,
      command: join(BIN, "gemini"),
      args,
      env: {
        GEMINI_CLI_HOME: home,
        GEMINI_FORCE_FILE_STORAGE: "true",
        GEMINI_CLI_SYSTEM_SETTINGS_PATH: join(home, "system-settings.json"),
        GEMINI_CLI_SYSTEM_DEFAULTS_PATH: join(home, "system-settings.json"),
      },
      // Gemini CLI takes its model from --model.
      sessionModel: undefined as string | undefined,
    };
  }
  mkdirSync(join(home, ".gemini/antigravity-cli"), { recursive: true });
  writeFileSync(join(home, ".gemini/antigravity-cli/settings.json"), JSON.stringify({ modelProvider: "gemini" }, null, 2));
  return {
    home,
    command: join(ROOT, ".agy/bin/antigravity"),
    args: ["acp", "--disable-telemetry"],
    env: { HOME: home },
    // Antigravity's ACP server has no model flag: the session's model is set after it starts.
    sessionModel: opts.model,
  };
}

export async function runAcp(
  run: Run,
  opts: { agent: AcpAgent; model?: string; env?: Record<string, string>; textFiles?: boolean },
): Promise<Record<string, unknown>> {
  const agent = setUp(opts.agent, run, opts);
  const home = agent.home;
  writeFileSync(join(run.project, "GEMINI.md"), opts.textFiles ? textInstructions() : INSTRUCTIONS);
  const [command, argv] = confined(agent.command, agent.args, [run.project, home]);
  const child = spawn(command, argv, {
    cwd: run.project,
    env: { ...process.env, ...opts.env, PWD: run.project, ...agent.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let finished: (summary: Record<string, unknown>) => void;
  const done = new Promise<Record<string, unknown>>((r) => (finished = r));

  let nextId = 1;
  const pending = new Map<number, (msg: any) => void>();
  const send = (msg: object) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
  const call = (method: string, params: object) =>
    new Promise<any>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      run.event(`call:${method}`, params);
      send({ id, method, params });
    });
  const local = (p: string) => (isAbsolute(p) ? p : join(run.project, p));

  const updates: Record<string, number> = {};
  let text = "";
  const readBlocks = blockReader(run);
  let usage: unknown;
  let firstThought: number | null = null;

  const onAgentRequest = (msg: any) => {
    const p = msg.params ?? {};
    if (msg.method === "session/request_permission") {
      // Upstart answers without asking the maker: allow, as auto mode would inside the sandbox.
      // With files in the text, a file written by a tool is refused (Antigravity has no setting to withdraw its write tool).
      const writes = opts.textFiles && /write_file|write_to_file/.test(`${p.toolCall?.name ?? ""} ${p.toolCall?.toolCallId ?? ""}`);
      const pick = (p.options ?? []).find((o: any) => o.kind === (writes ? "reject_once" : "allow_once")) ?? p.options?.[0];
      send({ id: msg.id, result: { outcome: { outcome: "selected", optionId: pick?.optionId } } });
    } else if (msg.method === "fs/write_text_file") {
      const abs = local(p.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, p.content);
      run.content(relative(run.project, abs), p.content.length, false);
      send({ id: msg.id, result: null });
    } else if (msg.method === "fs/read_text_file") {
      // A file not yet written reads as empty. Answered as the protocol says (error -32002,
      // "Resource not found"), Gemini CLI 0.68 fails the write: it turns the error object
      // into "[object Object]" and so never recognizes a missing file (normalizeFileSystemError).
      let content = "";
      try {
        content = readFileSync(local(p.path), "utf8");
      } catch {}
      send({ id: msg.id, result: { content } });
    } else send({ id: msg.id, error: { code: -32601, message: `not handled: ${msg.method}` } });
  };

  const onUpdate = (u: any) => {
    const kind = u.sessionUpdate as string;
    updates[kind] = (updates[kind] ?? 0) + 1;
    if (kind === "agent_message_chunk" && u.content?.type === "text") {
      text += u.content.text;
      if (opts.textFiles) readBlocks(text);
    } else if (kind === "agent_thought_chunk" && firstThought === null) firstThought = (Date.now() - run.started) / 1000;
    else if (kind === "usage_update") usage = u;
    else if (kind === "tool_call" || kind === "tool_call_update") {
      // A diff in a tool call is the file's content: whole, since the call is complete.
      for (const c of u.content ?? []) {
        if (c.type === "diff" && typeof c.newText === "string") run.content(relative(run.project, local(c.path)), c.newText.length, false);
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
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        run.event("text", line);
        continue;
      }
      if (msg.method === "session/update") {
        const u = msg.params?.update ?? {};
        run.event(
          `update:${u.sessionUpdate}`,
          u.sessionUpdate === "agent_message_chunk" || u.sessionUpdate === "agent_thought_chunk" ? { n: u.content?.text?.length } : u,
        );
        onUpdate(u);
      } else if (msg.method && msg.id !== undefined) {
        run.event(`request:${msg.method}`, msg.method === "fs/write_text_file" ? { path: msg.params?.path, n: msg.params?.content?.length } : msg.params);
        onAgentRequest(msg);
      } else if (msg.id !== undefined && pending.has(msg.id)) {
        run.event("response", msg);
        pending.get(msg.id)!(msg);
        pending.delete(msg.id);
      } else run.event("other", msg);
    }
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  child.on("exit", (code) => finished(run.finish({ model: opts.model, exit: code, stderr: stderr.slice(-2000), updates })));

  (async () => {
    const init = await call("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
    });
    if (init.error) return finished(run.finish({ model: opts.model, error: init.error, stderr: stderr.slice(-2000) }));
    let session = await call("session/new", { cwd: run.project, mcpServers: [] });
    if (session.error) {
      await call("authenticate", { methodId: "gemini-api-key" });
      session = await call("session/new", { cwd: run.project, mcpServers: [] });
    }
    if (session.error) return finished(run.finish({ model: opts.model, error: session.error, stderr: stderr.slice(-2000) }));
    const sessionId = session.result.sessionId;
    if (agent.sessionModel) {
      const set = await call("session/set_model", { sessionId, modelId: agent.sessionModel });
      if (set.error) return finished(run.finish({ model: opts.model, error: set.error, models: session.result.models?.availableModels?.map((m: any) => m.modelId) }));
    }
    const result = await call("session/prompt", { sessionId, prompt: [{ type: "text", text: REQUESTS[run.request] }] });
    finished(
      run.finish({
        model: opts.model,
        textFiles: !!opts.textFiles,
        account: "gemini-api-key",
        agent: opts.agent,
        stopReason: result.result?.stopReason,
        ...cost(opts.agent, result.result?.usage, opts.model),
        error: result.error,
        firstThought,
        updates,
        usage,
      }),
    );
  })();

  const summary = await done;
  child.kill();
  return summary;
}
