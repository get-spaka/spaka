// Does Vertex AI stream a tool call's arguments (streamFunctionCallArguments,
// partialArgs), reached with the maker's key in Vertex's express mode?
//   node src/vertex.ts [--model gemini-4-hydrogen] [--thinking low] [--gemini-api]
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { INSTRUCTIONS, keys, REQUESTS, ROOT } from "./common.ts";

const req = createRequire(join(ROOT, "node_modules/@earendil-works/pi-ai/package.json"));
const { GoogleGenAI } = req("@google/genai");
const arg = (n: string, d?: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const model = arg("--model", "gemini-4-hydrogen")!;
const thinking = arg("--thinking", "low")!;
const vertex = !process.argv.includes("--gemini-api");
// On Vertex: the express mode's key when there is one, else Application Default Credentials
// (`gcloud auth application-default login`), with the project and region given by
// --project / --location, VERTEX_PROJECT / VERTEX_LOCATION in keys.env, or gcloud's project.
const project = arg("--project", keys().VERTEX_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT);
const location = arg("--location", keys().VERTEX_LOCATION ?? "global")!;
const ai = new GoogleGenAI(
  !vertex
    ? { apiKey: keys().GEMINI_API_KEY }
    : keys().VERTEX_API_KEY
      ? { vertexai: true, apiKey: keys().VERTEX_API_KEY }
      : { vertexai: true, project: project ?? gcloudProject(), location },
);
function gcloudProject() {
  return req("node:child_process").execFileSync("gcloud", ["config", "get-value", "project"], { encoding: "utf8" }).trim();
}
const t0 = Date.now();
const parts: { t: number; name?: string; partial?: number; args?: number; willContinue?: boolean; text?: number }[] = [];
try {
  const stream = await ai.models.generateContentStream({
    model,
    contents: REQUESTS.launch,
    config: {
      systemInstruction: INSTRUCTIONS,
      thinkingConfig: { thinkingLevel: thinking.toUpperCase() },
      tools: [
        {
          functionDeclarations: [
            {
              name: "write_file",
              description: "Create or replace a file of the project with its whole content.",
              parametersJsonSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
            },
          ],
        },
      ],
      toolConfig: { functionCallingConfig: { streamFunctionCallArguments: true } },
    },
  });
  for await (const chunk of stream) {
    const t = (Date.now() - t0) / 1000;
    for (const p of chunk.candidates?.[0]?.content?.parts ?? []) {
      if (p.functionCall)
        parts.push({
          t,
          name: p.functionCall.name,
          partial: JSON.stringify(p.functionCall.partialArgs ?? []).length,
          args: p.functionCall.args ? JSON.stringify(p.functionCall.args).length : 0,
          willContinue: p.functionCall.willContinue,
        });
      else if (p.text) parts.push({ t, text: p.text.length });
    }
  }
} catch (e: any) {
  console.error("error:", String(e?.message ?? e).slice(0, 600));
  process.exit(1);
}
const calls = parts.filter((p) => p.name !== undefined || p.partial);
console.log(JSON.stringify({ model, thinking, total: (Date.now() - t0) / 1000, functionCallParts: calls.length, first: calls.slice(0, 5), last: calls.slice(-3) }, null, 1));
writeFileSync(join(ROOT, "runs", `${vertex ? "vertex" : "gemini-api-partial"}-${model}-${thinking}.json`), JSON.stringify(parts, null, 1));
