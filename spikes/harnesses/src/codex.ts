// Codex through its app-server (JSON-RPC over stdio), with the flag that streams
// apply_patch while the model writes it (item/fileChange/patchUpdated).
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { join, relative } from "node:path";
import { BIN, homeOf, INSTRUCTIONS, REQUESTS, type Run } from "./common.ts";

/** A model through OpenRouter's Responses API, with its key, instead of the ChatGPT sign-in. */
const OPENROUTER = [
  'model_provider="openrouter"',
  'model_providers.openrouter.name="OpenRouter"',
  'model_providers.openrouter.base_url="https://openrouter.ai/api/v1"',
  'model_providers.openrouter.env_key="OPENROUTER_API_KEY"',
  'model_providers.openrouter.wire_api="responses"',
].flatMap((c) => ["-c", c]);

export async function runCodex(
  run: Run,
  opts: { model?: string; provider?: "openrouter"; env?: Record<string, string> },
): Promise<Record<string, unknown>> {
  const child = spawn(
    join(BIN, "codex"),
    [
      "app-server",
      "--enable",
      "apply_patch_streaming_events",
      "-c",
      "suppress_unstable_features_warning=true",
      ...(opts.provider === "openrouter" ? OPENROUTER : []),
      // Further flags for a trial, e.g. CODEX_ARGS="--disable code_mode_host".
      ...(process.env.CODEX_ARGS?.split(" ").filter(Boolean) ?? []),
    ],
    {
      cwd: run.project,
      env: { ...process.env, ...opts.env, PWD: run.project, CODEX_HOME: homeOf("codex") },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let next = 1;
  const waiting = new Map<number, (r: { result?: unknown; error?: unknown }) => void>();
  const send = (msg: object) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
  const request = (method: string, params: unknown) =>
    new Promise<{ result?: any; error?: any }>((done) => {
      const id = next++;
      waiting.set(id, done);
      send({ id, method, params });
    });

  let finished: (summary: Record<string, unknown>) => void;
  const done = new Promise<Record<string, unknown>>((r) => (finished = r));
  let model = "";
  let usage: unknown;
  let patchUpdates = 0;
  const lastDiff = new Map<string, number>();

  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && msg.method === undefined) {
        waiting.get(msg.id)?.(msg);
        waiting.delete(msg.id);
        continue;
      }
      run.event(msg.method, msg.params);
      if (msg.id !== undefined) {
        // A request from the server (an approval): declined, never shown to the maker.
        send({ id: msg.id, result: { decision: "decline" } });
        continue;
      }
      const p = msg.params ?? {};
      if (msg.method === "item/fileChange/patchUpdated") {
        patchUpdates++;
        for (const c of p.changes ?? []) {
          const file = relative(run.project, c.path.startsWith("/") ? c.path : join(run.project, c.path));
          // Only what is new since the last update counts as movement.
          if ((lastDiff.get(file) ?? 0) !== c.diff.length) run.content(file, c.diff.length, true);
          lastDiff.set(file, c.diff.length);
        }
      } else if (msg.method === "item/completed" && p.item?.type === "fileChange") {
        for (const c of p.item.changes ?? [])
          run.content(relative(run.project, c.path.startsWith("/") ? c.path : join(run.project, c.path)), c.diff?.length ?? 0, false);
      } else if (msg.method === "thread/tokenUsage/updated") {
        usage = p.tokenUsage ?? p;
      } else if (msg.method === "turn/completed") {
        finished(run.finish({ model, usage, patchUpdates, turn: p.turn?.status }));
      }
    }
  });
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d.toString();
    appendFileSync(join(run.dir, "stderr.log"), d);
  });
  child.on("exit", (code) => finished(run.finish({ model, exit: code, stderr: stderr.slice(-2000) })));

  // item/fileChange/patchUpdated is experimental: sent only to a client that opts in.
  const init = await request("initialize", {
    clientInfo: { name: "upstart_spike", title: "Upstart spike", version: "0.0.0" },
    capabilities: { experimentalApi: true, requestAttestation: false },
  });
  if (init.error) throw new Error(JSON.stringify(init.error));
  send({ method: "initialized" });
  const thread = await request("thread/start", {
    cwd: run.project,
    model: opts.model ?? null,
    sandbox: "workspace-write",
    approvalPolicy: "never",
    // Codex's model writes files with shell heredocs when left to choose, which
    // stream nothing: only apply_patch reaches the preview while it is written.
    developerInstructions: `${INSTRUCTIONS}\n\nCreate and change files only with apply_patch, one file per patch. Never write a file with a shell command (cat, tee, printf, echo).`,
    ephemeral: true,
    // The flag again, for the thread: the server's own --enable is not enough on its own.
    config: { "features.apply_patch_streaming_events": true },
  });
  if (thread.error) throw new Error(JSON.stringify(thread.error));
  model = thread.result?.model ?? thread.result?.thread?.model ?? "";
  run.event("thread", thread.result);
  const turn = await request("turn/start", {
    threadId: thread.result.thread.id,
    input: [{ type: "text", text: REQUESTS[run.request], text_elements: [] }],
  });
  if (turn.error) throw new Error(JSON.stringify(turn.error));
  const summary = await done;
  child.kill();
  return summary;
}
