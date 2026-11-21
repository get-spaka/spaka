// Recording what the models of Upstart's own harness answered, and playing it
// back in checks of the whole app, as replay.ts does for Claude: no key spent,
// and the same answers each time. Only the model is played back: its tool
// calls run for real, so the files, the blocks and the checks are the app's.
//
// A recording is a JSON Lines file, in the order the requests were made: a
// reply of the model, { reply }, or what a web search answered, { search },
// since a search is a request of its own (web-search.ts).
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { type AssistantMessage, createModels, fauxProvider, type Models } from "@earendil-works/pi-ai";
import type { SearchFound } from "./web-search";

export class PiRecorder {
  constructor(private readonly file: string) {
    mkdirSync(dirname(file), { recursive: true });
  }

  reply(message: AssistantMessage) {
    appendFileSync(this.file, `${JSON.stringify({ reply: message })}\n`);
  }

  search(query: string, found: SearchFound) {
    appendFileSync(this.file, `${JSON.stringify({ search: { query, ...found } })}\n`);
  }
}

type Line = { reply: AssistantMessage } | { search: { query: string } & SearchFound };

export type PiReplay = {
  /** pi-ai's collection, its replies played back. */
  models: Models;
  /** The web search, its answers played back. */
  search: (query: string) => Promise<SearchFound>;
};

/** What the played-back model was asked, request by request: for checks of what Upstart tells it. */
export const piReplayed: { model: string; tools: string[]; last: string }[] = [];

/**
 * A stand-in for pi-ai's collection that streams the recorded replies, one
 * per request: text and tool arguments arrive in pieces, at
 * `tokensPerSecond`, as a provider's would.
 */
export function piReplay(file: string, tokensPerSecond = 400): PiReplay {
  const lines = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Line);
  const replies = lines.flatMap((l) => ("reply" in l ? [l.reply] : []));
  const searches = lines.flatMap((l): SearchFound[] =>
    "search" in l
      ? [{ text: l.search.text, ...(l.search.suggestions ? { suggestions: l.search.suggestions } : {}) }]
      : [],
  );
  const faux = fauxProvider({ provider: "replay", models: [{ id: "replay", reasoning: true }], tokensPerSecond });
  const collection = createModels({ authContext: { env: async () => undefined, fileExists: async () => false } });
  collection.setProvider(faux.provider);
  let next = 0;
  const models = {
    streamSimple(model, context, options) {
      const tools = [
        ...(context.tools ?? []).map((t) => t.name),
        ...context.messages.flatMap((m) => (m.role === "system" ? (m.toolsAdded ?? []).map((t) => t.name) : [])),
      ];
      const last = [...context.messages].reverse().find((m) => m.role === "user");
      piReplayed.push({
        model: model.id,
        tools,
        last: textOf(last?.content),
      });
      const reply = replies[next++];
      faux.setResponses([
        reply
          ? { ...reply, timestamp: Date.now() }
          : {
              role: "assistant",
              content: [],
              api: model.api,
              provider: model.provider,
              model: model.id,
              usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: zeroCost() },
              stopReason: "error",
              errorMessage: "No more recorded replies.",
              timestamp: Date.now(),
            },
      ]);
      return collection.streamSimple(faux.getModel(), context, { ...options, apiKey: "replay" });
    },
  } as Pick<Models, "streamSimple">;
  let nextSearch = 0;
  return {
    models: models as Models,
    search: async () => {
      const found = searches[nextSearch++];
      if (found === undefined) throw new Error("No more recorded searches.");
      return found;
    },
  };
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((c: { type?: string; text?: string }) => (c.type === "text" ? (c.text ?? "") : "")).join("");
}

function zeroCost() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}
