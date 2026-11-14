// Does Gemini stream a tool call's arguments through the Interactions API, on an
// AI Studio key? The generateContent API sends a call whole (partialArgs is
// Vertex only); the Interactions API declares `arguments_delta` steps.
// One model turn of the launch request with a write_file tool, nothing run:
// each event's time and size goes to runs/interactions-<label>.json.
//
//   node src/interactions.ts [--model gemini-4-hydrogen] [--thinking low] [--label x]
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { INSTRUCTIONS, keys, REQUESTS, ROOT } from "./common.ts";

const req = createRequire(join(ROOT, "node_modules/@earendil-works/pi-ai/package.json"));
const { GoogleGenAI } = req("@google/genai");
const arg = (n: string, d?: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const model = arg("--model", "gemini-4-hydrogen")!;
const thinking = arg("--thinking", "low");
const label = arg("--label", `${model}-${thinking}`);

const ai = new GoogleGenAI({ apiKey: keys().GEMINI_API_KEY });
const tool = {
  type: "function",
  name: "write_file",
  description: "Create or replace a file of the project with its whole content.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Path relative to the project" }, content: { type: "string" } },
    required: ["path", "content"],
  },
};
const t0 = Date.now();
const events: { t: number; type: string; index?: number; kind?: string; n?: number; name?: string }[] = [];
const args = new Map<number, string>();
const stream = await ai.interactions.create({
  model,
  input: REQUESTS.launch,
  system_instruction: INSTRUCTIONS,
  tools: [tool],
  ...(thinking ? { generation_config: { thinking_level: thinking } } : {}),
  stream: true,
});
for await (const e of stream as AsyncIterable<any>) {
  const t = (Date.now() - t0) / 1000;
  if (e.event_type === "step.delta") {
    const d = e.delta ?? {};
    const text = d.arguments ?? d.text ?? "";
    if (d.type === "arguments_delta") args.set(e.index, (args.get(e.index) ?? "") + text);
    events.push({ t, type: e.event_type, index: e.index, kind: d.type, n: text.length });
  } else if (e.event_type === "step.start") {
    events.push({ t, type: e.event_type, index: e.index, kind: e.step?.type, name: e.step?.name });
  } else events.push({ t, type: e.event_type, index: e.index });
  if (e.event_type === "error") console.error(JSON.stringify(e).slice(0, 500));
}
const deltas = events.filter((e) => e.kind === "arguments_delta");
const byStep = [...args.entries()].map(([i, a]) => {
  const ds = deltas.filter((d) => d.index === i);
  let path = "";
  try {
    path = JSON.parse(a).path;
  } catch {
    path = /"path"\s*:\s*"([^"]+)"/.exec(a)?.[1] ?? "?";
  }
  return { index: i, path, chars: a.length, deltas: ds.length, first: ds[0]?.t, last: ds.at(-1)?.t };
});
const summary = { model, thinking, total: (Date.now() - t0) / 1000, events: events.length, steps: byStep };
console.log(JSON.stringify(summary, null, 2));
writeFileSync(join(ROOT, "runs", `interactions-${label}.json`), JSON.stringify({ summary, events }, null, 1));
