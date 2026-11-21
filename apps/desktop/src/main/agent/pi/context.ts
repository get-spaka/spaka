// What the harness sends its model as a conversation grows, after what the
// official binary does (Q434, Q435): a picture is sent until the model has
// answered it, then a line stands in for it; near the model's limit, the
// oldest turns are summarized by the model itself. The conversation the maker
// sees stays whole. And a passing error is tried again, a reply cut by its
// length goes on.
import type { AgentMessage } from "@earendil-works/pi-agent-core";

/** What stands in for a picture the model has already answered. */
export const PICTURE_SEEN = "[A picture you have already seen; look again for the page as it is now.]";

/** Above this share of the model's window, the oldest turns are summarized. */
export const COMPACT_AT = 0.75;
/** The share of the window the turns kept whole may take. */
const KEEP_SHARE = 0.4;
/** What a picture counts for, in tokens, whatever its size in base64. */
const PICTURE_TOKENS = 1600;

type Part = { type: string; text?: string; data?: string; mimeType?: string };

/** Each picture of a tool's result the model has answered since replaced by a line; the rest as they are. */
export function withoutSeenPictures(messages: AgentMessage[]): AgentMessage[] {
  let lastReply = -1;
  messages.forEach((m, i) => {
    if (m.role === "assistant") lastReply = i;
  });
  return messages.map((m, i) => {
    if (i > lastReply || (m.role !== "toolResult" && m.role !== "user")) return m;
    const content = (m as { content: unknown }).content;
    if (!Array.isArray(content) || !content.some((c: Part) => c.type === "image")) return m;
    return {
      ...m,
      content: (content as Part[]).map((c) => (c.type === "image" ? { type: "text", text: PICTURE_SEEN } : c)),
    } as AgentMessage;
  });
}

/** Roughly how many tokens the messages take: a fourth of their text, a fixed count a picture. */
export function tokensOf(messages: AgentMessage[]): number {
  let chars = 0;
  let pictures = 0;
  for (const m of messages) {
    const content = (m as { content?: unknown }).content;
    if (typeof content === "string") chars += content.length;
    else if (Array.isArray(content))
      for (const c of content as Part[] & { arguments?: unknown }[]) {
        if (c.type === "image") pictures++;
        else chars += JSON.stringify(c).length;
      }
  }
  return Math.ceil(chars / 4) + pictures * PICTURE_TOKENS;
}

/**
 * Where the turns kept whole begin when the messages near the model's window:
 * at a message of the maker's, the latest turns fitting in KEEP_SHARE of it.
 * None when there is room, or no earlier turn to summarize.
 */
export function compactionCut(messages: AgentMessage[], window: number): number | undefined {
  if (!window || tokensOf(messages) <= window * COMPACT_AT) return undefined;
  const first = messages.findIndex((m) => m.role === "user");
  const starts = messages.flatMap((m, i) => (m.role === "user" && i > first ? [i] : []));
  // The earliest start whose turns fit; the latest turn at least, whatever its size.
  for (const i of starts) if (tokensOf(messages.slice(i)) <= window * KEEP_SHARE) return i;
  return starts.at(-1);
}

/** The instructions the model summarizes its earlier turns with. */
export const SUMMARY_INSTRUCTIONS =
  "You summarize the earlier part of your own work on a maker's website, for yourself to carry on from. " +
  "Write in English, in short lines: what the maker asked for and decided (their words where they matter), what you built and changed, " +
  "the files you created or changed and what each holds now, what was left to do or promised, and any preference of the maker's. " +
  "Leave out what no longer matters. No preamble.";

/** The earlier turns as a transcript to summarize: the words, and each tool call by its name and file. */
export function transcriptOf(messages: AgentMessage[]): string {
  const lines: string[] = [];
  const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n)}…` : text);
  for (const m of messages) {
    const content = (m as { content?: unknown }).content;
    const parts: Part[] = typeof content === "string" ? [{ type: "text", text: content }] : ((content as Part[]) ?? []);
    if (m.role === "user")
      lines.push(`Maker: ${clip(parts.flatMap((p) => (p.type === "text" ? [p.text ?? ""] : [])).join(" "), 3000)}`);
    else if (m.role === "assistant")
      for (const p of parts as (Part & { name?: string; arguments?: Record<string, unknown> })[]) {
        if (p.type === "text" && p.text?.trim()) lines.push(`You: ${clip(p.text.trim(), 3000)}`);
        if (p.type === "toolCall") {
          const where = p.arguments?.file_path ?? p.arguments?.page ?? p.arguments?.route ?? p.arguments?.url ?? "";
          lines.push(`You called ${p.name}${where ? ` on ${where}` : ""}.`);
        }
      }
    else if (m.role === "toolResult" && (m as { isError?: boolean }).isError)
      lines.push(
        `  It failed: ${clip(parts.flatMap((p) => (p.type === "text" ? [p.text ?? ""] : [])).join(" "), 300)}`,
      );
  }
  return lines.join("\n");
}

/** The turns kept whole, the summary of the earlier ones put before the first of them. */
export function withSummary(kept: AgentMessage[], summary: string): AgentMessage[] {
  const [first, ...rest] = kept;
  if (first?.role !== "user") return kept;
  const lead = `[What happened earlier in this conversation, summarized:]\n${summary.trim()}\n\n[The maker's message:]\n`;
  const content = first.content;
  const merged =
    typeof content === "string"
      ? lead + content
      : [{ type: "text" as const, text: lead }, ...(content as Exclude<typeof content, string>)];
  return [{ ...first, content: merged } as AgentMessage, ...rest];
}

/** An error worth trying again: the provider busy or failing for a moment, or the network. */
export function passingError(message: string | undefined): boolean {
  return !!message && PASSING.test(message);
}
const PASSING =
  /\b(429|500|502|503|504|529)\b|rate.?limit|too many requests|overloaded|unavailable|temporar|timed? ?out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed|network/i;

/** The waits before each new try. */
export const RETRY_WAITS_MS = [2_000, 8_000, 20_000];

/**
 * What the model is told when its reply was cut by its length in its text: a
 * call cut so is answered by pi-agent-core itself, asking for it again.
 */
export const GO_ON = "Your last reply was cut off by the output limit. Go on exactly where you stopped.";
