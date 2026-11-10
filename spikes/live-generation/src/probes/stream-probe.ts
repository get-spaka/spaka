// Probe 1: what does the Agent SDK stream look like while a file is being written?
// Verifies the starting points of the spike rather than taking them on faith:
// stream_event / input_json_delta / partial_json, start-up delay, auth source,
// auto mode availability, the confinement settings being accepted.
//
//   node src/probes/stream-probe.ts [--model <id>] [--no-confinement]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { cleanEnv, confinement } from "../agent/env.ts";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const model = arg("--model");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = path.resolve(import.meta.dirname, "../../runs", `probe-stream-${stamp}`);
const projectDir = path.join(runDir, "project");
mkdirSync(projectDir, { recursive: true });

const t0 = performance.now();
const ms = () => Math.round(performance.now() - t0);
const log: unknown[] = [];
const note = (kind: string, data: Record<string, unknown> = {}) => {
  const entry = { t: ms(), kind, ...data };
  log.push(entry);
  return entry;
};

const q = query({
  prompt:
    "Write a file named hello.html in the current folder: a complete HTML page, about 60 lines, " +
    "presenting a fictional bakery (header, three product cards, footer). Use one Write call. " +
    "Do not read or list anything first. After writing, reply with the single word: done.",
  options: {
    ...(args.includes("--no-confinement") ? { cwd: projectDir, settingSources: [] } : confinement(projectDir)),
    env: cleanEnv(),
    includePartialMessages: true,
    tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
    systemPrompt: "You are a web page writing agent. Be brief. Never ask questions.",
    ...(model ? { model } : {}),
    persistSession: false,
    stderr: (data: string) => note("stderr", { data: data.slice(0, 2000) }),
    canUseTool: async (toolName, input, o) => {
      note("canUseTool", { toolName, input, decisionReason: o.decisionReason, blockedPath: o.blockedPath });
      return { behavior: "deny", message: "The Upstart spike never prompts: refused.", interrupt: false };
    },
  },
});

// Per content block: accumulate partial_json and time every delta.
const blocks = new Map<number, { type: string; name?: string; json: string; deltas: { t: number; n: number }[] }>();
let firstEvent: number | undefined;
let firstText: number | undefined;

for await (const m of q) {
  if (m.type === "stream_event") {
    const e = m.event as any;
    firstEvent ??= ms();
    if (e.type === "message_start") note("message_start", { model: e.message?.model, usage: e.message?.usage });
    else if (e.type === "content_block_start") {
      blocks.set(e.index, { type: e.content_block.type, name: e.content_block.name, json: "", deltas: [] });
      note("block_start", { index: e.index, type: e.content_block.type, name: e.content_block.name });
    } else if (e.type === "content_block_delta") {
      const b = blocks.get(e.index)!;
      if (e.delta.type === "input_json_delta") {
        b.json += e.delta.partial_json;
        b.deltas.push({ t: ms(), n: e.delta.partial_json.length });
        if (b.deltas.length <= 12) note("input_json_delta", { index: e.index, partial_json: e.delta.partial_json });
      } else if (e.delta.type === "text_delta") {
        firstText ??= ms();
        note("text_delta", { text: e.delta.text });
      } else if (e.delta.type === "thinking_delta") {
        note("thinking_delta", { n: e.delta.thinking?.length });
      } else note("delta_other", { type: e.delta.type });
    } else if (e.type === "content_block_stop") {
      const b = blocks.get(e.index)!;
      if (b.deltas.length) {
        const gaps = b.deltas.slice(1).map((d, i) => d.t - b.deltas[i].t);
        const dur = b.deltas.at(-1)!.t - b.deltas[0].t;
        note("block_stop", {
          index: e.index,
          type: b.type,
          name: b.name,
          deltas: b.deltas.length,
          chars: b.json.length,
          firstDeltaAt: b.deltas[0].t,
          lastDeltaAt: b.deltas.at(-1)!.t,
          charsPerSecond: dur ? Math.round((b.json.length / dur) * 1000) : null,
          meanGapMs: gaps.length ? Math.round(gaps.reduce((a, c) => a + c, 0) / gaps.length) : null,
          maxGapMs: gaps.length ? Math.max(...gaps) : null,
          meanChunkChars: Math.round(b.json.length / b.deltas.length),
          jsonHead: b.json.slice(0, 160),
        });
      } else note("block_stop", { index: e.index, type: b.type, name: b.name });
    } else if (e.type === "message_delta") note("message_delta", { stop_reason: e.delta?.stop_reason, usage: e.usage });
    else if (e.type !== "message_stop") note("event_other", { type: e.type });
  } else if (m.type === "system") {
    const s = m as any;
    if (s.subtype === "init")
      note("init", {
        model: s.model,
        permissionMode: s.permissionMode,
        apiKeySource: s.apiKeySource,
        claude_code_version: s.claude_code_version,
        tools: s.tools,
        mcp_servers: s.mcp_servers,
        cwd: s.cwd,
      });
    else note(`system:${s.subtype}`, { ...s, type: undefined, uuid: undefined, session_id: undefined });
  } else if (m.type === "assistant") {
    const a = m as any;
    note("assistant", {
      content: a.message.content.map((c: any) =>
        c.type === "tool_use" ? { type: c.type, name: c.name, inputKeys: Object.keys(c.input ?? {}) } : { type: c.type },
      ),
    });
  } else if (m.type === "user") {
    const u = m as any;
    const content = Array.isArray(u.message.content) ? u.message.content : [];
    note("user", {
      content: content.map((c: any) => ({
        type: c.type,
        is_error: c.is_error,
        text: typeof c.content === "string" ? c.content.slice(0, 300) : JSON.stringify(c.content)?.slice(0, 300),
      })),
    });
  } else if (m.type === "result") {
    const r = m as any;
    note("result", {
      subtype: r.subtype,
      is_error: r.is_error,
      duration_ms: r.duration_ms,
      duration_api_ms: r.duration_api_ms,
      num_turns: r.num_turns,
      result: typeof r.result === "string" ? r.result.slice(0, 300) : r.result,
      usage: r.usage,
      modelUsage: r.modelUsage,
      permission_denials: r.permission_denials,
      total_cost_usd: r.total_cost_usd,
    });
  } else note(`other:${(m as any).type}`, {});
}

note("end", { firstEvent, firstText });
writeFileSync(path.join(runDir, "probe.json"), JSON.stringify(log, null, 1));
for (const e of log as any[]) {
  if (e.kind === "text_delta" || e.kind === "thinking_delta") continue;
  console.log(JSON.stringify(e).slice(0, 700));
}
console.log("log:", path.join(runDir, "probe.json"));
