// Turns the agent's message stream (Claude Agent SDK) into a flat list of
// events the app acts on: text as it arrives, each tool call with its input
// while that input is still streaming (ADR 0009), results, refusals, the end
// of a turn. Pure: no I/O, so it is tested on recorded streams.
import { parsePartialInput } from "./partial-input";

export type AgentEvent =
  | {
      kind: "init";
      sessionId: string;
      model: string;
      version: string;
      apiKeySource: string;
      tools: string[];
      skills: string[];
      plugins: { name: string; path: string }[];
      mcpServers: { name: string; status: string }[];
    }
  | { kind: "request-start" }
  | { kind: "text"; text: string }
  | { kind: "thinking" }
  | { kind: "tool-start"; id: string; name: string }
  /** `json` is everything received so far for this call; `fields` its string fields, decoded. */
  | {
      kind: "tool-input";
      id: string;
      name: string;
      json: string;
      fields: Record<string, string>;
      done: Record<string, boolean>;
    }
  | { kind: "tool-input-end"; id: string; name: string; input: Record<string, unknown> }
  | { kind: "tool-result"; id: string; name: string; isError: boolean; text: string }
  | { kind: "permission-denied"; id: string; name: string; message: string }
  | { kind: "result"; subtype: string; isError: boolean; text: string; durationMs: number; costUsd?: number }
  | { kind: "auth"; message: string };

type Block = { id: string; name: string; json: string };

// The SDK's message types are wide; the reader looks only at the fields it needs.
// biome-ignore lint/suspicious/noExplicitAny: messages from the SDK, read defensively
type Message = any;

export class StreamReader {
  private readonly blocks = new Map<number, Block>();
  private readonly names = new Map<string, string>();

  constructor(private readonly emit: (event: AgentEvent) => void) {}

  read(m: Message) {
    if (m?.type === "stream_event") return this.streamEvent(m);
    if (m?.type === "system") return this.system(m);
    if (m?.type === "user") return this.toolResults(m);
    if (m?.type === "result") {
      this.blocks.clear();
      return this.emit({
        kind: "result",
        subtype: String(m.subtype),
        isError: !!m.is_error,
        text: typeof m.result === "string" ? m.result : "",
        durationMs: Number(m.duration_ms ?? 0),
        costUsd: typeof m.total_cost_usd === "number" ? m.total_cost_usd : undefined,
      });
    }
    if (m?.type === "auth_status" && m.error) return this.emit({ kind: "auth", message: String(m.error) });
    if (m?.type === "assistant" && m.error === "authentication_failed")
      return this.emit({ kind: "auth", message: "authentication_failed" });
  }

  private streamEvent(m: Message) {
    // A sub-agent's own stream is not the maker's to watch.
    if (m.parent_tool_use_id) return;
    const e = m.event;
    if (e.type === "message_start") return this.emit({ kind: "request-start" });
    if (e.type === "content_block_start" && e.content_block?.type === "tool_use") {
      const { id, name } = e.content_block;
      this.names.set(id, name);
      this.blocks.set(e.index, { id, name, json: "" });
      return this.emit({ kind: "tool-start", id, name });
    }
    if (e.type === "content_block_delta") {
      const d = e.delta;
      if (d?.type === "text_delta" && d.text) return this.emit({ kind: "text", text: d.text });
      if (d?.type === "thinking_delta") return this.emit({ kind: "thinking" });
      if (d?.type === "input_json_delta" && d.partial_json) {
        const block = this.blocks.get(e.index);
        if (!block) return;
        block.json += d.partial_json;
        const { fields, done } = parsePartialInput(block.json);
        return this.emit({ kind: "tool-input", id: block.id, name: block.name, json: block.json, fields, done });
      }
      return;
    }
    if (e.type === "content_block_stop") {
      const block = this.blocks.get(e.index);
      if (!block) return;
      this.blocks.delete(e.index);
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(block.json || "{}");
      } catch {
        input = parsePartialInput(block.json).fields;
      }
      this.emit({ kind: "tool-input-end", id: block.id, name: block.name, input });
    }
  }

  private system(m: Message) {
    if (m.subtype === "init")
      return this.emit({
        kind: "init",
        sessionId: String(m.session_id),
        model: String(m.model),
        version: String(m.claude_code_version ?? ""),
        apiKeySource: String(m.apiKeySource ?? ""),
        tools: Array.isArray(m.tools) ? m.tools : [],
        skills: Array.isArray(m.skills) ? m.skills : [],
        plugins: Array.isArray(m.plugins) ? m.plugins : [],
        mcpServers: Array.isArray(m.mcp_servers) ? m.mcp_servers : [],
      });
    if (m.subtype === "permission_denied")
      this.emit({
        kind: "permission-denied",
        id: String(m.tool_use_id),
        name: String(m.tool_name),
        message: String(m.message ?? ""),
      });
  }

  private toolResults(m: Message) {
    const content = m.message?.content;
    if (!Array.isArray(content)) return;
    for (const c of content) {
      if (c?.type !== "tool_result") continue;
      const text =
        typeof c.content === "string"
          ? c.content
          : Array.isArray(c.content)
            ? c.content.map((x: { text?: string }) => x.text ?? "").join("")
            : "";
      this.emit({
        kind: "tool-result",
        id: String(c.tool_use_id),
        name: this.names.get(c.tool_use_id) ?? "?",
        isError: !!c.is_error,
        text: text.slice(0, 4000),
      });
    }
  }
}
