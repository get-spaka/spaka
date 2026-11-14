import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Api, type AssistantMessage, createModels, type Model, type Models } from "@earendil-works/pi-ai";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { expect, test } from "vitest";
import { piModel } from "./models";
import { canSearch, providerSearch, searchResult, sourcesIn, withSearch } from "./web-search";

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

// With the maker's real Gemini key, when asked: UPSTART_REAL_PI=1 and GEMINI_API_KEY in
// spikes/harnesses/homes/keys.env (ignored by git), never printed.
const real = process.env.UPSTART_REAL_PI === "1";
test.skipIf(!real)(
  "Google Search answers with its sources, with a real Gemini key",
  async () => {
    const env = readFileSync(join(import.meta.dirname, "../../../../../../spikes/harnesses/homes/keys.env"), "utf8");
    const key = /^GEMINI_API_KEY=(.+)$/m.exec(env)?.[1]?.trim();
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
