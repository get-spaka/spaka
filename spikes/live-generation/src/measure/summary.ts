// Turns the timed events of a run into the agent-side measurements. Throwaway spike code.
import type { AgentEvent } from "../agent/drive.ts";

type ToolTiming = {
  id: string;
  name: string;
  what: string;
  startMs: number;
  firstInputMs?: number;
  inputEndMs?: number;
  preMs?: number;
  postMs?: number;
  resultMs?: number;
  inputChars?: number;
  contentChars?: number;
  isError?: boolean;
  /** From the end of the model's tool call to the moment the tool starts: where a permission check would sit. */
  beforeToolMs?: number;
  /** The tool itself. */
  toolMs?: number;
  /** From the end of the tool call to its result reaching the conversation. */
  totalMs?: number;
  charsPerSecond?: number;
};

export function summarize(events: AgentEvent[]) {
  const tools = new Map<string, ToolTiming>();
  const order: ToolTiming[] = [];
  const requests: { n: number; startMs: number; firstTokenMs?: number; outputTokens?: number; stopReason?: string }[] = [];
  let init: any = null;
  let result: any = null;
  let firstTextMs: number | undefined;
  let firstFileCharMs: number | undefined;
  let thinkingChars = 0;
  let prose = "";
  const denied: unknown[] = [];
  const asked: unknown[] = [];
  const stderr: string[] = [];
  const acc = new Map<string, string>();

  for (const e of events) {
    switch (e.kind) {
      case "init":
        init = e;
        break;
      case "request-start":
        requests.push({ n: e.n, startMs: e.t });
        break;
      case "first-token": {
        const r = requests.find((x) => x.n === e.n);
        if (r) r.firstTokenMs = e.t;
        break;
      }
      case "usage": {
        const r = requests.find((x) => x.n === e.n);
        if (r) {
          r.outputTokens = (e.usage as any)?.output_tokens;
          r.stopReason = e.stopReason;
        }
        break;
      }
      case "text":
        firstTextMs ??= e.t;
        prose += e.text;
        break;
      case "thinking":
        thinkingChars += e.chars;
        break;
      case "tool-start": {
        const t: ToolTiming = { id: e.id, name: e.name, what: "", startMs: e.t };
        tools.set(e.id, t);
        order.push(t);
        acc.set(e.id, "");
        break;
      }
      case "tool-input": {
        const t = tools.get(e.id);
        if (!t) break;
        t.firstInputMs ??= e.t;
        const json = (acc.get(e.id) ?? "") + e.json;
        acc.set(e.id, json);
        if (firstFileCharMs === undefined && (e.name === "Write" || e.name === "Edit") && /"(content|new_string)"\s*:\s*"./.test(json)) firstFileCharMs = e.t;
        break;
      }
      case "tool-input-end": {
        const t = tools.get(e.id);
        if (!t) break;
        t.inputEndMs = e.t;
        t.inputChars = e.chars;
        const input = e.input as any;
        t.what = String(input.file_path ?? input.command ?? input.pattern ?? "").replace(/^.*\/project\//, "").slice(0, 160);
        const content = input.content ?? input.new_string;
        if (typeof content === "string") {
          t.contentChars = content.length;
          const dur = e.t - (t.firstInputMs ?? e.t);
          if (dur > 0) t.charsPerSecond = Math.round((content.length / dur) * 1000);
        }
        break;
      }
      case "tool-pre": {
        const t = tools.get(e.id);
        if (t) t.preMs = e.t;
        break;
      }
      case "tool-post": {
        const t = tools.get(e.id);
        if (t) t.postMs = e.t;
        break;
      }
      case "tool-result": {
        const t = tools.get(e.id);
        if (!t) break;
        t.resultMs = e.t;
        t.isError = e.isError;
        if (t.inputEndMs !== undefined) t.totalMs = e.t - t.inputEndMs;
        if (t.preMs !== undefined && t.inputEndMs !== undefined) t.beforeToolMs = t.preMs - t.inputEndMs;
        if (t.preMs !== undefined && t.postMs !== undefined) t.toolMs = t.postMs - t.preMs;
        break;
      }
      case "permission-denied":
        denied.push(e);
        break;
      case "can-use-tool":
        asked.push(e);
        break;
      case "stderr":
        stderr.push(e.data);
        break;
      case "result":
        result = e;
        break;
    }
  }
  const files = order.filter((t) => t.name === "Write" || t.name === "Edit");
  const usage = (result?.usage ?? {}) as any;
  return {
    model: init?.model,
    binary: init?.version,
    permissionMode: init?.permissionMode,
    apiKeySource: init?.apiKeySource,
    initMs: init?.t,
    firstTokenMs: requests[0]?.firstTokenMs,
    firstTextMs,
    firstFileCharMs,
    requests: requests.length,
    requestTimings: requests,
    turns: result?.turns,
    agentDoneMs: result?.t,
    apiMs: result?.apiMs,
    outputTokens: usage.output_tokens,
    inputTokens: usage.input_tokens,
    cacheCreationTokens: usage.cache_creation_input_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
    thinkingChars,
    costUsd: result?.costUsd,
    resultSubtype: result?.subtype,
    resultText: result?.text,
    prose: prose.slice(0, 1200),
    fileCharsPerSecond: files.length
      ? Math.round(files.reduce((a, f) => a + (f.contentChars ?? 0), 0) / Math.max(0.001, files.reduce((a, f) => a + ((f.inputEndMs ?? 0) - (f.firstInputMs ?? 0)), 0) / 1000))
      : undefined,
    tools: order,
    permissionDenied: denied,
    permissionAsked: asked,
    stderr: stderr.slice(0, 10),
  };
}
