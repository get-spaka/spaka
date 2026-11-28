// A shell command the binary cannot read statically, a `for` loop over files,
// is granted like any command the sandbox confines (Q221), with the real agent.
// Opt-in like agent.e2e.ts: SPAKA_REAL_AGENT=1, with .cache/agent-config signed in.
// In Matt's CV site such a loop was refused twice: the binary sent it to
// canUseTool without the PermissionRequest hook seeing it.
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { agentConfigDir, type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";

const real = process.env.SPAKA_REAL_AGENT === "1";
const dataDir = join(import.meta.dirname, "../.cache/shell-check-data");
const WRITE = "mkdir -p probe && printf one > probe/a.txt && printf two > probe/b.txt";
const LOOP = 'for f in probe/*; do echo "== $f"; cat "$f"; echo; done';

describe.skipIf(!real)("the agent's shell, a loop over files", () => {
  let launched: LaunchedApp;
  const record = join(runsDir, "real-agent-shell.jsonl");
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).spaka.invoke(channel, ...args),
      [channel, args] as const,
    );

  beforeAll(async () => {
    mkdirSync(runsDir, { recursive: true });
    rmSync(record, { force: true });
    rmSync(dataDir, { recursive: true, force: true });
    launched = await launchApp({
      env: {
        SPAKA_AGENT_REPLAY: "",
        SPAKA_AGENT_CONFIG_DIR: agentConfigDir(),
        SPAKA_AGENT_RECORD: record,
        SPAKA_DATA_DIR: dataDir,
      },
    });
    await launched.window.getByTestId("message-input").waitFor();
  }, 90_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test(
    "the loop is granted and reads both files",
    async () => {
      const started = Date.now();
      await invoke(
        "conversation:send",
        [
          "This is a check of your shell, made by the developers of this app: do not build a website and ask nothing.",
          "Run these two commands exactly as written, each in its own shell call, then reply with the second one's output, word for word:",
          `- ${WRITE}`,
          `- ${LOOP}`,
        ].join("\n"),
      );
      for (;;) {
        const { items } = await invoke("conversation:get");
        const last = items.at(-1);
        if (last?.kind === "agent" && last.status !== "working") break;
        if (Date.now() - started > 300_000) throw new Error("the agent did not finish in 5 minutes");
        await new Promise((r) => setTimeout(r, 500));
      }
      const messages = readFileSync(record, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line).m);
      const commands = new Map<string, string>();
      for (const m of messages)
        if (m?.type === "assistant")
          for (const c of m.message.content)
            if (c.type === "tool_use" && c.name === "Bash") commands.set(c.id, c.input.command);
      const outputs: { command: string; output: string; error: boolean }[] = [];
      for (const m of messages)
        if (m?.type === "user" && Array.isArray(m.message.content))
          for (const c of m.message.content)
            if (c.type === "tool_result" && commands.has(c.tool_use_id))
              outputs.push({
                command: commands.get(c.tool_use_id)!,
                output:
                  typeof c.content === "string"
                    ? c.content
                    : c.content.map((x: { text?: string }) => x.text ?? "").join(""),
                error: !!c.is_error,
              });
      const loop = outputs.find((o) => o.command.trim() === LOOP);
      expect(loop, JSON.stringify(outputs, null, 2)).toBeDefined();
      expect(loop).toMatchObject({ error: false });
      expect(loop!.output).toContain("== probe/a.txt");
      expect(loop!.output).toContain("two");
    },
    360_000 * SLOW,
  );
});
