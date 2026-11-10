// Drives Claude through the Claude Agent SDK and turns its message stream into
// a flat list of timed events. The same events can be replayed later without
// calling the agent again (see replay.ts). Throwaway spike code.
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { cleanEnv, confinement, type ConfinementVariant } from "./env.ts";
import { parsePartialInput } from "./partial-input.ts";

export type AgentEvent = { t: number } & (
  | { kind: "init"; model: string; permissionMode: string; apiKeySource: string; version: string; tools: string[] }
  | { kind: "request-start"; n: number }
  | { kind: "first-token"; n: number }
  | { kind: "text"; text: string }
  | { kind: "thinking"; chars: number }
  | { kind: "tool-start"; id: string; name: string }
  | { kind: "tool-input"; id: string; name: string; json: string }
  | { kind: "tool-input-end"; id: string; name: string; input: Record<string, unknown>; chars: number; deltas: number; firstDeltaT: number }
  | { kind: "tool-pre"; id: string; name: string }
  | { kind: "tool-post"; id: string; name: string }
  | { kind: "tool-result"; id: string; name: string; isError: boolean; text: string }
  | { kind: "permission-denied"; id: string; name: string; reasonType?: string; reason?: string; message: string }
  | { kind: "can-use-tool"; name: string; input: unknown; reasonType?: string; reason?: string }
  | { kind: "usage"; n: number; usage: unknown; stopReason?: string }
  | { kind: "system"; subtype: string; data: unknown }
  | { kind: "stderr"; data: string }
  | { kind: "error"; message: string }
  | { kind: "result"; subtype: string; isError: boolean; durationMs: number; apiMs: number; turns: number; text: string; usage: unknown; modelUsage: unknown; denials: unknown; costUsd?: number }
);

export type DriveOptions = {
  prompt: string;
  projectDir: string;
  systemPrompt: string;
  model: string;
  /** Epoch ms of the moment the maker's request is sent: every event time is relative to it. */
  t0: number;
  variant?: ConfinementVariant;
  tools?: string[];
  onEvent: (e: AgentEvent) => void;
  /** How the app answers when the binary asks for a permission after all. */
  onAsk?: "deny" | "deny-and-end-turn";
  keepApiKey?: boolean;
  /** "off" disables extended thinking; "adaptive" is the binary's default. */
  thinking?: "off" | "adaptive";
  extra?: Partial<Options>;
};

export async function drive(o: DriveOptions): Promise<void> {
  const now = () => Date.now() - o.t0;
  const emit = (e: Record<string, unknown>) => o.onEvent({ t: now(), ...e } as AgentEvent);
  const names = new Map<string, string>(); // tool_use id -> tool name
  const blocks = new Map<number, { id: string; name: string; json: string; deltas: number; firstDeltaT: number }>();
  let requests = 0;
  let sawToken = false;

  const q = query({
    prompt: o.prompt,
    options: {
      ...confinement(o.projectDir, o.variant),
      env: { ...cleanEnv({ keepApiKey: o.keepApiKey }), ...(o.variant?.env ?? {}) },
      model: o.model,
      systemPrompt: o.systemPrompt,
      tools: o.tools ?? ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
      includePartialMessages: true,
      persistSession: false,
      ...(o.thinking === "off" ? { thinking: { type: "disabled" as const } } : {}),
      stderr: (data: string) => emit({ kind: "stderr", data: data.slice(0, 1500) }),
      // ADR 0007: the app never prompts. If the binary asks anyway, refuse.
      canUseTool: async (name, input, ctx) => {
        emit({ kind: "can-use-tool", name, input, reasonType: (ctx as any).decisionReasonType, reason: ctx.decisionReason });
        return {
          behavior: "deny",
          message: "Upstart does not ask the maker for permissions. This action is refused: find another way or say what you could not do.",
          interrupt: o.onAsk === "deny-and-end-turn",
        };
      },
      hooks: {
        PreToolUse: [{ hooks: [async (input: any) => (emit({ kind: "tool-pre", id: input.tool_use_id, name: input.tool_name }), {})] }],
        PostToolUse: [{ hooks: [async (input: any) => (emit({ kind: "tool-post", id: input.tool_use_id, name: input.tool_name }), {})] }],
      },
      ...o.extra,
    },
  });

  try {
   for await (const m of q) {
    if (m.type === "stream_event") {
      const e = m.event as any;
      if ((m as any).parent_tool_use_id) continue;
      if (e.type === "message_start") {
        requests++;
        sawToken = false;
        emit({ kind: "request-start", n: requests });
      } else if (e.type === "content_block_start") {
        if (!sawToken) {
          sawToken = true;
          emit({ kind: "first-token", n: requests });
        }
        if (e.content_block.type === "tool_use") {
          const { id, name } = e.content_block;
          names.set(id, name);
          blocks.set(e.index, { id, name, json: "", deltas: 0, firstDeltaT: 0 });
          emit({ kind: "tool-start", id, name });
        }
      } else if (e.type === "content_block_delta") {
        const d = e.delta;
        if (d.type === "text_delta") emit({ kind: "text", text: d.text });
        else if (d.type === "thinking_delta") emit({ kind: "thinking", chars: d.thinking?.length ?? 0 });
        else if (d.type === "input_json_delta") {
          const b = blocks.get(e.index);
          if (!b || !d.partial_json) continue;
          b.json += d.partial_json;
          b.deltas++;
          b.firstDeltaT ||= now();
          emit({ kind: "tool-input", id: b.id, name: b.name, json: d.partial_json });
        }
      } else if (e.type === "content_block_stop") {
        const b = blocks.get(e.index);
        if (b) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(b.json || "{}");
          } catch {
            input = parsePartialInput(b.json).fields;
          }
          emit({ kind: "tool-input-end", id: b.id, name: b.name, input, chars: b.json.length, deltas: b.deltas, firstDeltaT: b.firstDeltaT });
          blocks.delete(e.index);
        }
      } else if (e.type === "message_delta") emit({ kind: "usage", n: requests, usage: e.usage, stopReason: e.delta?.stop_reason });
    } else if (m.type === "system") {
      const s = m as any;
      if (s.subtype === "init")
        emit({ kind: "init", model: s.model, permissionMode: s.permissionMode, apiKeySource: s.apiKeySource, version: s.claude_code_version, tools: s.tools });
      else if (s.subtype === "permission_denied")
        emit({ kind: "permission-denied", id: s.tool_use_id, name: s.tool_name, reasonType: s.decision_reason_type, reason: s.decision_reason, message: s.message });
      else if (s.subtype !== "status") emit({ kind: "system", subtype: s.subtype, data: { ...s, uuid: undefined, session_id: undefined, type: undefined } });
    } else if (m.type === "user") {
      const content = (m as any).message?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c.type !== "tool_result") continue;
        const text = typeof c.content === "string" ? c.content : (c.content ?? []).map((x: any) => x.text ?? "").join("");
        emit({ kind: "tool-result", id: c.tool_use_id, name: names.get(c.tool_use_id) ?? "?", isError: !!c.is_error, text: text.slice(0, 2000) });
      }
    } else if (m.type === "result") {
      const r = m as any;
      emit({
        kind: "result",
        subtype: r.subtype,
        isError: !!r.is_error,
        durationMs: r.duration_ms,
        apiMs: r.duration_api_ms,
        turns: r.num_turns,
        text: typeof r.result === "string" ? r.result : "",
        usage: r.usage,
        modelUsage: r.modelUsage,
        denials: r.permission_denials,
        costUsd: r.total_cost_usd,
      });
    }
   }
  } catch (e) {
    // The SDK throws when the session ends abnormally (for instance after an interrupt).
    emit({ kind: "error", message: String((e as Error)?.message ?? e).slice(0, 1500) });
  }
}
