import { type Api, type AssistantMessage, createModels, type Model, type Models } from "@earendil-works/pi-ai";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { expect, test } from "vitest";
import { devKey } from "../../dev-keys";
import { piModel } from "./models";
import {
  canSearch,
  isGoogleSearch,
  providerSearch,
  searchResult,
  sourcesIn,
  suggestionsIn,
  withSearch,
} from "./web-search";

const hydrogen = piModel("gemini", "gemini-4-hydrogen")!;
const terra = piModel("openai", "gpt-6.1-terra")!;

test("the request gets the provider's own search as its only tool", () => {
  expect(canSearch(hydrogen)).toBe(true);
  expect(canSearch(terra)).toBe(true);
  expect(
    withSearch("google-generative-ai", {
      model: "gemini-4-hydrogen",
      config: { systemInstruction: "x", toolConfig: { functionCallingConfig: { mode: "AUTO" } } },
    }),
  ).toEqual({ model: "gemini-4-hydrogen", config: { systemInstruction: "x", tools: [{ googleSearch: {} }] } });
  expect(
    withSearch("openai-responses", {
      model: "gpt-6.1-terra",
      include: ["reasoning.encrypted_content"],
      tool_choice: "auto",
    }),
  ).toEqual({
    model: "gpt-6.1-terra",
    tools: [{ type: "web_search" }],
    include: ["reasoning.encrypted_content", "web_search_call.action.sources"],
  });
});

test("the sources come from Google's grounding and from OpenAI's citations and searches", () => {
  expect(
    sourcesIn("google-generative-ai", {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/a", title: "nantes.fr" } },
              { retrievedContext: {} },
            ],
          },
        },
      ],
    }),
  ).toEqual([{ title: "nantes.fr", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/a" }]);
  expect(
    sourcesIn("openai-responses", {
      type: "response.output_item.done",
      item: {
        type: "message",
        content: [
          { type: "output_text", annotations: [{ type: "url_citation", url: "https://www.nantes.fr/jardin" }] },
        ],
      },
    }),
  ).toEqual([{ title: "www.nantes.fr", url: "https://www.nantes.fr/jardin" }]);
  expect(
    sourcesIn("openai-responses", {
      type: "response.output_item.done",
      item: { type: "web_search_call", action: { sources: [{ url: "https://jardins.fr", title: "Jardins" }] } },
    }),
  ).toEqual([{ title: "Jardins", url: "https://jardins.fr" }]);
  expect(sourcesIn("openai-responses", { type: "response.output_text.delta" })).toEqual([]);
});

test("a search is a request of its own: its answer, its sources once each, its cost", async () => {
  const seen: { payload?: unknown; apiKey?: string; prompt?: string } = {};
  const models = {
    async completeSimple(model: Model<Api>, context, options) {
      seen.payload = await options?.onPayload?.({ model: model.id, config: {} }, model);
      seen.apiKey = options?.apiKey;
      seen.prompt = context.systemPrompt;
      const chunk = {
        candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: "https://a.fr", title: "a.fr" } }] } }],
      };
      await options?.onProviderStreamEvent?.(chunk, model);
      await options?.onProviderStreamEvent?.(chunk, model);
      return {
        role: "assistant",
        content: [{ type: "text", text: "Ouvert de 8 h 30 à 18 h." }],
        stopReason: "stop",
        usage: { cost: { total: 0.002 } },
      } as AssistantMessage;
    },
  } as Pick<Models, "completeSimple"> as Models;
  const found = await providerSearch({ models, model: hydrogen, apiKey: "k", query: "horaires" });
  expect(seen.payload).toEqual({ model: "gemini-4-hydrogen", config: { tools: [{ googleSearch: {} }] } });
  expect(seen.apiKey).toBe("k");
  expect(seen.prompt).toMatch(/Search the web/);
  expect(found).toEqual({
    text: "Ouvert de 8 h 30 à 18 h.",
    sources: [{ title: "a.fr", url: "https://a.fr" }],
    cost: 0.002,
  });
  expect(searchResult(found)).toBe("Ouvert de 8 h 30 à 18 h.\n\nSources:\n- a.fr: https://a.fr");
});

test("a refused search fails the tool call, which the agent reads", async () => {
  const models = {
    async completeSimple() {
      return {
        role: "assistant",
        content: [],
        stopReason: "error",
        errorMessage: "403 web_search not allowed",
      } as unknown as AssistantMessage;
    },
  } as unknown as Models;
  await expect(providerSearch({ models, model: terra, query: "x" })).rejects.toThrow(/web_search not allowed/);
});

// With the maker's real Gemini key, when asked: SPAKA_REAL_PI=1 and GEMINI_API_KEY set in
// the terminal or in the repository's .env (Q438), never printed.
const real = process.env.SPAKA_REAL_PI === "1";
test.skipIf(!real)(
  "Google Search answers with its sources, with a real Gemini key",
  async () => {
    const key = devKey("GEMINI_API_KEY");
    if (!key)
      throw new Error(
        "Set GEMINI_API_KEY in the terminal or in the repository's .env to run this check with a real Gemini.",
      );
    const models = createModels({ authContext: { env: async () => undefined, fileExists: async () => false } });
    models.setProvider(googleProvider());
    const started = Date.now();
    const found = await providerSearch({
      models,
      model: hydrogen,
      apiKey: key,
      query: "Horaires d'ouverture du Jardin des Plantes de Nantes en novembre",
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const said = found.text.slice(0, 200).replace(/\n/g, " ");
    process.stdout.write(`[search] ${seconds} s, ${found.sources.length} sources, cost ${found.cost}: ${said}\n`);
    expect(found.text).toMatch(/\d/);
    expect(found.sources.length).toBeGreaterThan(0);
  },
  60_000,
);

test("Google's Search Suggestions are kept for the maker, the last of the stream; OpenAI has none (Q424)", async () => {
  const chip = '<div class="container"><a class="chip" href="https://www.google.com/search?q=jardin">jardin</a></div>';
  const event = (html: string) => ({
    candidates: [{ groundingMetadata: { searchEntryPoint: { renderedContent: html }, groundingChunks: [] } }],
  });
  expect(suggestionsIn("google-generative-ai", event(chip))).toBe(chip);
  expect(suggestionsIn("google-vertex", event(chip))).toBe(chip);
  expect(suggestionsIn("google-generative-ai", event("  "))).toBeUndefined();
  expect(suggestionsIn("openai-responses", event(chip))).toBeUndefined();
  const models = {
    async completeSimple(model: Model<Api>, _context, options) {
      await options?.onProviderStreamEvent?.(event(chip), model);
      await options?.onProviderStreamEvent?.({ candidates: [{}] }, model);
      return {
        role: "assistant",
        content: [{ type: "text", text: "Ouvert." }],
        stopReason: "stop",
      } as AssistantMessage;
    },
  } as Pick<Models, "completeSimple"> as Models;
  const found = await providerSearch({ models, model: hydrogen, query: "jardin" });
  expect(found.suggestions).toBe(chip);
  // What the agent reads is unchanged: the suggestions are the maker's.
  expect(searchResult(found)).toBe("Ouvert.");
});

test("only a Google search's address opens outside the app", () => {
  expect(isGoogleSearch("https://www.google.com/search?q=jardin")).toBe(true);
  expect(isGoogleSearch("https://www.google.fr/search?q=jardin")).toBe(true);
  expect(isGoogleSearch("https://www.google.co.uk/search?q=garden")).toBe(true);
  expect(isGoogleSearch("http://www.google.com/search?q=x")).toBe(false);
  expect(isGoogleSearch("https://www.google.com.evil.example/search")).toBe(false);
  expect(isGoogleSearch("https://evil.example/search")).toBe(false);
  expect(isGoogleSearch("https://www.google.com/url?q=https://evil.example")).toBe(false);
  expect(isGoogleSearch("javascript:alert(1)")).toBe(false);
});
