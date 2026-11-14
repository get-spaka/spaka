// Does Gemini's OpenAI-compatible endpoint stream a tool call's arguments?
//   node src/openai-compat.ts [--model gemini-4-hydrogen] [--effort low]
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { INSTRUCTIONS, keys, REQUESTS, ROOT } from "./common.ts";

const arg = (n: string, d?: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const model = arg("--model", "gemini-4-hydrogen")!;
const effort = arg("--effort", "low");
const t0 = Date.now();
const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${keys().GEMINI_API_KEY}` },
  body: JSON.stringify({
    model,
    stream: true,
    reasoning_effort: effort,
    messages: [
      { role: "system", content: INSTRUCTIONS },
      { role: "user", content: REQUESTS.launch },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "write_file",
          description: "Create or replace a file of the project with its whole content.",
          parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
        },
      },
    ],
  }),
});
if (!res.ok) {
  console.error(res.status, (await res.text()).slice(0, 800));
  process.exit(1);
}
const calls = new Map<number, { name?: string; args: string; deltas: { t: number; n: number }[] }>();
let buf = "";
const dec = new TextDecoder();
for await (const chunk of res.body as any) {
  buf += dec.decode(chunk, { stream: true });
  let i: number;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line.startsWith("data:") || line === "data: [DONE]") continue;
    const t = (Date.now() - t0) / 1000;
    const j = JSON.parse(line.slice(5));
    for (const tc of j.choices?.[0]?.delta?.tool_calls ?? []) {
      const k = tc.index ?? calls.size;
      const c = calls.get(k) ?? { args: "", deltas: [] };
      if (tc.function?.name) c.name = tc.function.name;
      const a = tc.function?.arguments ?? "";
      c.args += a;
      c.deltas.push({ t, n: a.length });
      calls.set(k, c);
    }
  }
}
const steps = [...calls.entries()].map(([k, c]) => ({
  index: k,
  path: /"path"\s*:\s*"([^"]+)"/.exec(c.args)?.[1],
  chars: c.args.length,
  deltas: c.deltas.length,
  first: c.deltas[0]?.t,
  last: c.deltas.at(-1)?.t,
}));
const summary = { model, effort, total: (Date.now() - t0) / 1000, steps };
console.log(JSON.stringify(summary, null, 1));
writeFileSync(join(ROOT, "runs", `openai-compat-${model}-${effort}.json`), JSON.stringify(summary, null, 1));
