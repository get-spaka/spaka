// One run of a harness on one of spike 1's requests:
//   node src/run.ts codex|pi|opencode|gemini|antigravity [--request launch] [--model <id>] [--label <text>]
//   node src/run.ts pi --text-files --model …   (files written in the reply's text, not by a tool)
//   node src/run.ts pi --thinking low --model …   (Pi's thinking level: off, minimal, low, medium, high…)
//   node src/run.ts codex --provider openrouter --model openai/gpt-6.1-sol   (an API key instead of ChatGPT)
import { runCodex } from "./codex.ts";
import { keys, type RequestName, startRun } from "./common.ts";
import { runAcp } from "./acp.ts";
import { runOpencode } from "./opencode.ts";
import { runPi } from "./pi.ts";

const [harness, ...rest] = process.argv.slice(2);
const opt = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const request = (opt("--request") ?? "launch") as RequestName;
const model = opt("--model");
const run = startRun(harness!, request, opt("--label") ?? "");
const timeout = setTimeout(() => {
  console.log(JSON.stringify(run.finish({ timeout: true }), null, 2));
  process.exit(1);
}, 600_000);
const runners: Record<string, () => Promise<Record<string, unknown>>> = {
  codex: () => runCodex(run, { model, provider: opt("--provider") as "openrouter" | undefined, env: keys() }),
  pi: () => runPi(run, { model, env: keys(), textFiles: rest.includes("--text-files"), thinking: opt("--thinking") }),
  opencode: () => runOpencode(run, { model, env: keys() }),
  // Google's agents over ACP, on the Gemini API key only (GEMINI_API_KEY in keys.env).
  gemini: () => runAcp(run, { agent: "gemini", model, env: { GEMINI_API_KEY: keys().GEMINI_API_KEY ?? "" }, textFiles: rest.includes("--text-files") }),
  antigravity: () =>
    runAcp(run, { agent: "antigravity", model, env: { GEMINI_API_KEY: keys().GEMINI_API_KEY ?? "" }, textFiles: rest.includes("--text-files") }),
};
if (!runners[harness!]) throw new Error(`unknown harness ${harness}`);
const summary = await runners[harness!]!();
clearTimeout(timeout);
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
