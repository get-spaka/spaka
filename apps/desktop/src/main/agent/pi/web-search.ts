// The web search of Upstart's own harness (Q276): the provider's own search,
// OpenAI's web_search or Google Search, so no other key is needed and the
// queries stay with the maker's provider. It runs as a request of its own,
// made by the WebSearch tool: Google Search beside function tools needs
// server-side tool parts in the conversation, which pi-ai does not keep, and
// OpenAI's would leave reasoning items without the call they led to.
import type { Api, AssistantMessage, ClientIdentity, Model, Models } from "@earendil-works/pi-ai";
import { clampThinkingLevel } from "@earendil-works/pi-ai";

export type Source = { title: string; url: string };
export type SearchAnswer = { text: string; sources: Source[]; cost: number; suggestions?: string };
/** What a search hands the agent, and what the maker is shown beside it. */
export type SearchFound = { text: string; suggestions?: string };

const INSTRUCTIONS =
  "Search the web for what is asked, then answer with the facts found, briefly, in the language of the question. Keep names, addresses, prices, dates and opening hours exactly as the sources give them. When nothing reliable is found, say so.";

const GOOGLE_APIS = new Set(["google-generative-ai", "google-vertex"]);
const OPENAI_APIS = new Set(["openai-responses", "openai-codex-responses", "azure-openai-responses"]);

/** Whether the model's provider has a search of its own. */
export function canSearch(model: Model<Api>): boolean {
  return GOOGLE_APIS.has(model.api) || OPENAI_APIS.has(model.api);
}

// biome-ignore lint/suspicious/noExplicitAny: the provider's request, as pi-ai built it
type Payload = Record<string, any>;

/** The request with the provider's search as its only tool. */
export function withSearch(api: string, payload: Payload): Payload {
  if (GOOGLE_APIS.has(api)) {
    const { toolConfig: _, ...config } = payload.config ?? {};
    return { ...payload, config: { ...config, tools: [{ googleSearch: {} }] } };
  }
  if (OPENAI_APIS.has(api)) {
    const include = new Set<string>([...(payload.include ?? []), "web_search_call.action.sources"]);
    const { tool_choice: _, ...rest } = payload;
    return { ...rest, tools: [{ type: "web_search" }], include: [...include] };
  }
  return payload;
}

/** The sources one event of the provider's stream names. */
export function sourcesIn(api: string, event: unknown): Source[] {
  // biome-ignore lint/suspicious/noExplicitAny: the provider's own events
  const e = event as any;
  if (GOOGLE_APIS.has(api)) {
    const chunks = e?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    return chunks.flatMap((c: { web?: { uri?: string; title?: string } }) =>
      c.web?.uri ? [{ title: c.web.title || host(c.web.uri), url: c.web.uri }] : [],
    );
  }
  if (OPENAI_APIS.has(api) && e?.type === "response.output_item.done") {
    const item = e.item;
    if (item?.type === "message")
      return (item.content ?? []).flatMap((c: { annotations?: { type: string; url?: string; title?: string }[] }) =>
        (c.annotations ?? []).flatMap((a) =>
          a.type === "url_citation" && a.url ? [{ title: a.title || host(a.url), url: a.url }] : [],
        ),
      );
    if (item?.type === "web_search_call")
      return (item.action?.sources ?? []).flatMap((s: { url?: string; title?: string }) =>
        s.url ? [{ title: s.title || host(s.url), url: s.url }] : [],
      );
  }
  return [];
}

/**
 * Google's Search Suggestions for one event of its stream: the HTML of
 * groundingMetadata.searchEntryPoint, which Google's terms ask to show the
 * person who searched, beside what was found (Q424).
 */
export function suggestionsIn(api: string, event: unknown): string | undefined {
  if (!GOOGLE_APIS.has(api)) return undefined;
  // biome-ignore lint/suspicious/noExplicitAny: the provider's own events
  const html = (event as any)?.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent;
  return typeof html === "string" && html.trim() ? html : undefined;
}

/** Searches the web with the model's provider and answers with what it found and where. */
export async function providerSearch(o: {
  models: Models;
  model: Model<Api>;
  apiKey?: string;
  identity?: ClientIdentity;
  query: string;
  signal?: AbortSignal;
}): Promise<SearchAnswer> {
  const { model } = o;
  if (!canSearch(model)) throw new Error("This model's provider has no web search.");
  const found = new Map<string, Source>();
  let suggestions: string | undefined;
  const level = clampThinkingLevel(model, "low");
  const message: AssistantMessage = await o.models.completeSimple(
    model,
    { systemPrompt: INSTRUCTIONS, messages: [{ role: "user", content: o.query, timestamp: Date.now() }] },
    {
      apiKey: o.apiKey,
      identity: o.identity,
      signal: o.signal,
      ...(level !== "off" ? { reasoning: level } : {}),
      onPayload: (payload) => withSearch(model.api, payload as Payload),
      onProviderStreamEvent: (event) => {
        for (const s of sourcesIn(model.api, event)) if (!found.has(s.url)) found.set(s.url, s);
        suggestions = suggestionsIn(model.api, event) ?? suggestions;
      },
    },
  );
  if (message.stopReason === "error" || message.stopReason === "aborted")
    throw new Error(message.errorMessage || "The search failed.");
  const text = message.content
    .flatMap((c) => (c.type === "text" ? [c.text] : []))
    .join("")
    .trim();
  return {
    text,
    sources: [...found.values()],
    cost: message.usage?.cost?.total ?? 0,
    ...(suggestions ? { suggestions } : {}),
  };
}

/** What the agent reads: the answer, then its sources. */
export function searchResult(answer: SearchAnswer): string {
  const text = answer.text || "The search found nothing.";
  if (!answer.sources.length) return text;
  return `${text}\n\nSources:\n${answer.sources
    .slice(0, 10)
    .map((s) => `- ${s.title}: ${s.url}`)
    .join("\n")}`;
}

/** A Google search's address, as a Search Suggestions chip links to (Q424). */
export function isGoogleSearch(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      /^(www\.)?google\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(u.hostname) &&
      u.pathname === "/search"
    );
  } catch {
    return false;
  }
}

function host(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
