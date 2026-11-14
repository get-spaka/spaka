// A live preview through tools alone, on the Gemini API: the model writes a long
// file in several calls (write_file, then append_file), which reach the app one
// by one as each is complete. One model turn of the launch request, nothing run.
//   node src/chunked.ts [--model gemini-4-hydrogen] [--thinking low] [--lines 40] [--label x]
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { INSTRUCTIONS, keys, REQUESTS, ROOT } from "./common.ts";

const req = createRequire(join(ROOT, "node_modules/@earendil-works/pi-ai/package.json"));
const { GoogleGenAI } = req("@google/genai");
const arg = (n: string, d?: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const model = arg("--model", "gemini-4-hydrogen")!;
const thinking = arg("--thinking", "low")!;
const lines = Number(arg("--lines", "40"));
const label = arg("--label", `${model}-${thinking}-${lines}`)!;
const CHUNKED = `

# Writing long files

Write a file of more than ${lines} lines in several calls, in reading order: write_file with its first ${lines} lines or so, then append_file with each following ${lines} lines or so, until the file is complete. Make all these calls in the same response, one after another, without waiting for their results. Cut between two elements, never inside a tag or a Liquid tag.`;
const instructions = INSTRUCTIONS.replace(
  "Write each new file with a single call of your file-writing tool, top to bottom in reading order.",
  "Write each new file top to bottom in reading order (see Writing long files).",
) + CHUNKED;
const fileProps = { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] };
const ai = new GoogleGenAI({ apiKey: keys().GEMINI_API_KEY });
const t0 = Date.now();
const calls: { t: number; name: string; path: string; chars: number; lines: number }[] = [];
let firstText: number | null = null;
const stream = await ai.models.generateContentStream({
  model,
  contents: REQUESTS.launch,
  config: {
    systemInstruction: instructions,
    thinkingConfig: { thinkingLevel: thinking.toUpperCase() },
    tools: [
      {
        functionDeclarations: [
          { name: "write_file", description: "Create or replace a file of the project with the given content.", parametersJsonSchema: fileProps },
          { name: "append_file", description: "Add content at the end of a file of the project, on a new line.", parametersJsonSchema: fileProps },
        ],
      },
    ],
  },
});
const files = new Map<string, string>();
for await (const chunk of stream) {
  const t = (Date.now() - t0) / 1000;
  for (const p of chunk.candidates?.[0]?.content?.parts ?? []) {
    if (p.functionCall) {
      const a = p.functionCall.args ?? {};
      const c = String(a.content ?? "");
      calls.push({ t, name: p.functionCall.name, path: a.path, chars: c.length, lines: c.split("\n").length });
      files.set(a.path, p.functionCall.name === "append_file" ? `${files.get(a.path) ?? ""}\n${c}` : c);
    } else if (p.text && !p.thought && firstText === null) firstText = t;
  }
}
const home = calls.filter((c) => c.path === "pages/index.liquid");
const summary = {
  model,
  thinking,
  lines,
  total: (Date.now() - t0) / 1000,
  calls: calls.length,
  home: { calls: home.length, first: home[0]?.t, complete: home.at(-1)?.t, chars: files.get("pages/index.liquid")?.length, gaps: home.slice(1).map((c, i) => +(c.t - home[i]!.t).toFixed(2)) },
};
console.log(JSON.stringify(summary, null, 1));
const out = join(ROOT, "runs", `chunked-${label}`);
writeFileSync(`${out}.json`, JSON.stringify({ summary, calls }, null, 1));
writeFileSync(`${out}-home.liquid`, files.get("pages/index.liquid") ?? "");
