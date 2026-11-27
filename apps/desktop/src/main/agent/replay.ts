// Recording the agent's stream once, and playing it back in checks of the
// whole app, so that they do not spend the maker's subscription and do not
// depend on what the model writes that day.
//
// A recording is a JSON Lines file: one line per message of the agent's
// stream, `{ t, m }`, where `t` is the time since the maker's message in
// milliseconds. Each turn ends with the stream's `result` message.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import type { ModelInfo, Query, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { CARD_TOOLS } from "./questions";
import { ADD_PACKAGE_TOOL, LOOK_TOOL, PAGES_TOOL, REMOVE_PACKAGE_TOOL, SPAKA_SERVER } from "./spaka-tools";

type Line = { t: number; m: Record<string, unknown> & { type: string } };

export class Recorder {
  private turnStart = Date.now();

  constructor(private readonly file: string) {
    mkdirSync(dirname(file), { recursive: true });
  }

  turn() {
    this.turnStart = Date.now();
  }

  message(m: unknown) {
    appendFileSync(this.file, `${JSON.stringify({ t: Date.now() - this.turnStart, m })}\n`);
  }
}

const MODELS: ModelInfo[] = [
  {
    value: "sonnet",
    resolvedModel: "claude-sonnet-5-5",
    displayName: "Sonnet",
    description: "",
    supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
  },
  {
    value: "opus",
    resolvedModel: "claude-opus-5-5",
    displayName: "Opus",
    description: "",
    supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
  },
  {
    value: "haiku",
    resolvedModel: "claude-haiku-5-5",
    displayName: "Haiku",
    description: "",
    supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
  },
];

/**
 * A stand-in for the SDK's `query()` that plays a recording back: each message
 * the maker sends gets the next recorded turn, at its recorded pace divided by
 * `speed`. The files the agent wrote are written again, in the project being
 * checked, so that the preview sees them as it would.
 */
/** What the played-back agent received, message by message: for checks of what Spaka tells it. */
export const replayed: string[] = [];

export function replayQuery(file: string, speed = 1) {
  const turns = readTurns(file);
  let next = 0;
  return (params: { prompt: AsyncIterable<SDKUserMessage>; options: Record<string, unknown> }): Query => {
    const cwd = String(params.options.cwd);
    const calls: Record<string, unknown>[] = [];
    /** The answers of the looks run for real, by their tool call. */
    const looked = new Map<string, string>();
    let interrupted = false;
    let closed = false;
    let wake: (() => void) | undefined;
    /** Ends the wait for a question's answer, as the binary does on an interruption. */
    let stopAsking: (() => void) | undefined;
    const ask = params.options.canUseTool as
      | ((name: string, input: Record<string, unknown>, options: { signal: AbortSignal }) => Promise<unknown>)
      | undefined;
    // The card of pages is one of Spaka's tools, which the binary runs without asking: run here.
    const runTool = (params.options.mcpServers as Record<string, { runTool?: RunTool }> | undefined)?.[SPAKA_SERVER]
      ?.runTool;

    async function* messages() {
      for await (const input of params.prompt) {
        const content = input.message.content;
        replayed.push(typeof content === "string" ? content : JSON.stringify(content));
        const turn = turns[next++];
        interrupted = false;
        if (!turn) {
          yield {
            type: "result",
            subtype: "error_during_execution",
            is_error: true,
            result: "No more recorded turns.",
          };
          continue;
        }
        let start = Date.now();
        const from = recordedCwd(turns);
        for (const [i, line] of turn.entries()) {
          const wait = line.t / speed - (Date.now() - start);
          if (wait > 0)
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, wait);
              wake = () => {
                clearTimeout(timer);
                resolve();
              };
            });
          wake = undefined;
          if (closed) return;
          if (interrupted) {
            yield { type: "result", subtype: "error_during_execution", is_error: true, result: "" };
            break;
          }
          const m = from ? (relocated(line.m, from, cwd) as Line["m"]) : line.m;
          applyWrites(m);
          // A look runs for real, and its answer replaces the recorded one: the page is this check's.
          const look = toolCall(m, LOOK_TOOL);
          if (look && runTool) {
            const content = await runTool(look.name, look.input);
            const text = content.flatMap((c) => (c.text !== undefined ? [c.text] : [])).join("\n");
            looked.set(look.id, text);
            replayed.push(`[${look.name}] ${text}`);
            start = Date.now() - (turn[i + 1]?.t ?? line.t) / speed;
          }
          yield answered(m, looked);
          // A package added or removed runs for real too, after the call is shown: it may ask the maker (Q536).
          const packaged = toolCall(m, ADD_PACKAGE_TOOL) ?? toolCall(m, REMOVE_PACKAGE_TOOL);
          if (packaged && runTool) {
            const controller = new AbortController();
            stopAsking = () => controller.abort();
            const content = await runTool(packaged.name, packaged.input, controller.signal);
            stopAsking = undefined;
            const text = content.flatMap((c) => (c.text !== undefined ? [c.text] : [])).join("\n");
            looked.set(packaged.id, text);
            replayed.push(`[${packaged.name}] ${text}`);
            start = Date.now() - (turn[i + 1]?.t ?? line.t) / speed;
          }
          // A question or a plan asks the app, as the binary does, and the
          // recording goes on once it is answered (Q283, Q286); the maker's
          // time to answer in the recording is not waited again.
          const asked = cardCall(m);
          if (asked?.name === PAGES_TOOL && runTool) {
            const controller = new AbortController();
            stopAsking = () => controller.abort();
            const content = await runTool(asked.name, asked.input, controller.signal);
            stopAsking = undefined;
            replayed.push(`[${asked.name}] ${content.map((c) => ("text" in c ? c.text : "")).join("\n")}`);
            start = Date.now() - (turn[i + 1]?.t ?? line.t) / speed;
          } else if (asked && ask) {
            const controller = new AbortController();
            stopAsking = () => controller.abort();
            const answer = await ask(asked.name, asked.input, { signal: controller.signal });
            stopAsking = undefined;
            // What the agent reads: the app's answer, and what its hooks add to it, as the binary would.
            replayed.push(`[${asked.name}] ${JSON.stringify(answer)}`);
            if ((answer as { behavior?: string })?.behavior === "allow")
              for (const added of await afterTool(params.options.hooks, asked.name, asked.input))
                replayed.push(`[PostToolUse] ${added}`);
            start = Date.now() - (turn[i + 1]?.t ?? line.t) / speed;
          }
        }
      }
    }

    const generator = messages() as unknown as Query;
    return Object.assign(generator, {
      interrupt: async () => {
        interrupted = true;
        wake?.();
        stopAsking?.();
        calls.push({ interrupt: true });
        return undefined;
      },
      setModel: async (model?: string) => void calls.push({ model }),
      applyFlagSettings: async (settings: Record<string, unknown>) => void calls.push(settings),
      setPermissionMode: async (mode: string) => void calls.push({ permissionMode: mode }),
      supportedModels: async () => MODELS,
      accountInfo: async () => ({ tokenSource: "replay" }),
      close: () => {
        closed = true;
        wake?.();
        stopAsking?.();
      },
      calls,
    });
  };
}

type RunTool = (name: string, input: unknown, signal?: AbortSignal) => Promise<{ type: string; text?: string }[]>;

type Hook = (
  input: Record<string, unknown>,
  toolUseId: string | undefined,
  options: { signal: AbortSignal },
) => unknown;

/** What the app's PostToolUse hooks add for a tool call: the context the binary would give the agent. */
async function afterTool(hooks: unknown, name: string, input: Record<string, unknown>): Promise<string[]> {
  const entries = ((hooks as Record<string, unknown> | undefined)?.PostToolUse ?? []) as {
    matcher?: string;
    hooks: Hook[];
  }[];
  const added: string[] = [];
  for (const entry of entries) {
    if (entry.matcher && !new RegExp(`^(?:${entry.matcher})$`).test(name)) continue;
    for (const hook of entry.hooks) {
      const output = (await hook({ hook_event_name: "PostToolUse", tool_name: name, tool_input: input }, undefined, {
        signal: new AbortController().signal,
      })) as { hookSpecificOutput?: { additionalContext?: string } } | undefined;
      const context = output?.hookSpecificOutput?.additionalContext;
      if (context) added.push(context);
    }
  }
  return added;
}

/** A recorded question or plan of the agent's, which asks the app before the recording goes on. */
function cardCall(m: Line["m"]): { name: string; input: Record<string, unknown> } | undefined {
  if (m.type !== "assistant") return undefined;
  const content = (m.message as { content?: unknown })?.content;
  if (!Array.isArray(content)) return undefined;
  const block = content.find((b) => b?.type === "tool_use" && CARD_TOOLS.has(b.name));
  return block ? { name: block.name, input: block.input as Record<string, unknown> } : undefined;
}

/** A recorded call of the tool `name`. */
function toolCall(
  m: Line["m"],
  name: string,
): { id: string; name: string; input: Record<string, unknown> } | undefined {
  if (m.type !== "assistant") return undefined;
  const content = (m.message as { content?: unknown })?.content;
  if (!Array.isArray(content)) return undefined;
  const block = content.find((b) => b?.type === "tool_use" && b.name === name);
  return block ? { id: String(block.id), name, input: block.input as Record<string, unknown> } : undefined;
}

/** A recorded tool result, with the answer of a tool run for real in its place. */
function answered(m: Line["m"], answers: Map<string, string>): Line["m"] {
  if (m.type !== "user" || !answers.size) return m;
  const content = (m.message as { content?: unknown })?.content;
  if (!Array.isArray(content)) return m;
  return {
    ...m,
    message: {
      ...(m.message as object),
      content: content.map((b) =>
        b?.type === "tool_result" && answers.has(b.tool_use_id)
          ? { ...b, content: [{ type: "text", text: answers.get(b.tool_use_id) }] }
          : b,
      ),
    },
  };
}

function readTurns(file: string): Line[][] {
  const turns: Line[][] = [[]];
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    if (!raw.trim()) continue;
    const line = JSON.parse(raw) as Line;
    turns.at(-1)!.push(line);
    if (line.m.type === "result") turns.push([]);
  }
  return turns.filter((t) => t.length);
}

/** The project folder of the recording, from its first `init` message. */
/**
 * A recorded message with the recording's folder replaced by this check's in
 * every text: on the values themselves, and, in a streamed tool input
 * (`partial_json`, JSON text), escaped as JSON, as a Windows folder's
 * backslashes need.
 */
export function relocated(value: unknown, from: string, to: string, key?: string): unknown {
  if (typeof value === "string")
    return value.split(from).join(key === "partial_json" ? JSON.stringify(to).slice(1, -1) : to);
  if (Array.isArray(value)) return value.map((v) => relocated(v, from, to));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, relocated(v, from, to, k)]));
  return value;
}

function recordedCwd(turns: Line[][]): string | undefined {
  for (const turn of turns)
    for (const { m } of turn)
      if (m.type === "system" && m.subtype === "init" && typeof m.cwd === "string") return m.cwd;
  return undefined;
}

/** Does again on disk what a recorded Write or Edit did. */
function applyWrites(m: Line["m"]) {
  if (m.type !== "assistant") return;
  const content = (m.message as { content?: unknown })?.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block?.type !== "tool_use") continue;
    const input = block.input as Record<string, unknown>;
    const path = input?.file_path;
    if (typeof path !== "string" || !isAbsolute(path)) continue;
    try {
      if (block.name === "Write" && typeof input.content === "string") {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, input.content);
      } else if (
        block.name === "Edit" &&
        typeof input.old_string === "string" &&
        typeof input.new_string === "string"
      ) {
        const text = readFileSync(path, "utf8");
        writeFileSync(
          path,
          input.replace_all
            ? text.split(input.old_string).join(input.new_string)
            : text.replace(input.old_string, () => input.new_string as string),
        );
      }
    } catch {
      // A recorded edit that no longer applies is skipped, as the agent's would fail.
    }
  }
}
