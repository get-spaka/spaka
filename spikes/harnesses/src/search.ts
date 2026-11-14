// Google Search on the Gemini API, for the Pi harness's web search (Q276): one
// request with the search alone, then one with the search and function tools
// together. Prints what comes back (text, grounding sources), never the key.
//   node src/search.ts [--model gemini-4-hydrogen]
import { createRequire } from "node:module";
import { join } from "node:path";
import { keys, ROOT } from "./common.ts";

const req = createRequire(join(ROOT, "node_modules/@earendil-works/pi-ai/package.json"));
const { GoogleGenAI } = req("@google/genai");
const arg = (n: string, d?: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const model = arg("--model", "gemini-4-hydrogen")!;
const ai = new GoogleGenAI({ apiKey: keys().GEMINI_API_KEY });

const QUERY = "Quels sont les horaires d'ouverture du Jardin des Plantes de Nantes en novembre 2026 ?";
const fileProps = { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] };

async function probe(label: string, tools: object[], contents: string, server = false) {
  const t0 = Date.now();
  try {
    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: { thinkingConfig: { thinkingLevel: "LOW" }, tools, ...(server ? { toolConfig: { includeServerSideToolInvocations: true } } : {}) },
    });
    let text = "";
    const calls: string[] = [];
    let sources: { uri?: string; title?: string }[] = [];
    let queries: string[] = [];
    let first: number | null = null;
    for await (const chunk of stream) {
      const c = chunk.candidates?.[0];
      for (const p of c?.content?.parts ?? []) {
        if (p.text && !p.thought) {
          text += p.text;
          first ??= Date.now() - t0;
        }
        const kinds = Object.keys(p).filter((k) => !["text", "thought", "thoughtSignature"].includes(k));
        if (kinds.length && !p.functionCall) calls.push(`[${kinds.join(",")}] ${JSON.stringify(p).slice(0, 160)}`);
        if (p.functionCall) calls.push(`${p.functionCall.name}(${JSON.stringify(p.functionCall.args).slice(0, 80)})`);
      }
      const g = c?.groundingMetadata;
      if (g?.groundingChunks?.length) sources = g.groundingChunks.map((x: { web?: { uri?: string; title?: string } }) => x.web ?? {});
      if (g?.webSearchQueries?.length) queries = g.webSearchQueries;
    }
    console.log(`\n== ${label}: ${((Date.now() - t0) / 1000).toFixed(1)} s, first text at ${first ?? "-"} ms`);
    console.log(`queries: ${JSON.stringify(queries)}`);
    console.log(`sources (${sources.length}): ${sources.slice(0, 4).map((s) => `${s.title} <${(s.uri ?? "").slice(0, 70)}…>`).join(" | ")}`);
    console.log(`calls: ${calls.join("; ") || "-"}`);
    console.log(`text: ${text.slice(0, 500).replace(/\n/g, " ")}`);
  } catch (e) {
    console.log(`\n== ${label}: FAILED after ${((Date.now() - t0) / 1000).toFixed(1)} s: ${String((e as Error).message ?? e).slice(0, 400)}`);
  }
}

await probe("search alone", [{ googleSearch: {} }], QUERY);
await probe(
  "search + function tools",
  [
    { googleSearch: {} },
    { functionDeclarations: [{ name: "write_file", description: "Create or replace a file of the project.", parametersJsonSchema: fileProps }] },
  ],
  `${QUERY} Puis écris la réponse dans le fichier notes/horaires.md.`,
  true,
);
