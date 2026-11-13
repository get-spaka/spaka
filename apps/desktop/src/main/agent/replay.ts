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
/** What the played-back agent received, message by message: for checks of what Upstart tells it. */
export const replayed: string[] = [];

export function replayQuery(file: string, speed = 1) {
  const turns = readTurns(file);
  let next = 0;
  return (params: { prompt: AsyncIterable<SDKUserMessage>; options: Record<string, unknown> }): Query => {
    const cwd = String(params.options.cwd);
    const calls: Record<string, unknown>[] = [];
    let interrupted = false;
    let closed = false;
    let wake: (() => void) | undefined;

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
        const start = Date.now();
        const from = recordedCwd(turns);
        for (const line of turn) {
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
          const m = from ? (JSON.parse(JSON.stringify(line.m).split(from).join(cwd)) as Line["m"]) : line.m;
          applyWrites(m);
          yield m;
        }
      }
    }

    const generator = messages() as unknown as Query;
    return Object.assign(generator, {
      interrupt: async () => {
        interrupted = true;
        wake?.();
        calls.push({ interrupt: true });
        return undefined;
      },
      setModel: async (model?: string) => void calls.push({ model }),
      applyFlagSettings: async (settings: Record<string, unknown>) => void calls.push(settings),
      supportedModels: async () => MODELS,
      accountInfo: async () => ({ tokenSource: "replay" }),
      close: () => {
        closed = true;
        wake?.();
      },
      calls,
    });
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
