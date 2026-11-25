// What the agent's sandbox holds on its own (Q221), with the real agent in the
// packaged app. Opt-in like agent.e2e.ts: SPAKA_REAL_AGENT=1, with
// .cache/agent-config signed in, and the app packaged first.
// The agent runs harmless probes, each in its own shell command, and the check
// reads their results from the record: whether the keychain's service answers
// (a search for an item that does not exist, nothing read), whether a file
// outside the project can be read (tested, not shown) or written, and whether
// the network answers. A probe auto mode refuses is reported as such.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, test } from "vitest";
import { agentConfigDir, type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";

const real = process.env.SPAKA_REAL_AGENT === "1";
const configDir = agentConfigDir();
const dataDir = join(import.meta.dirname, "../.cache/sandbox-check-data");
const outside = join(homedir(), "spaka-sandbox-probe.txt");

const PROBES: Record<string, string> = {
  keychains: "security list-keychains",
  keychainSearch: "security find-generic-password -s spaka-sandbox-probe-that-does-not-exist; echo exit=$?",
  keychainLogin:
    "security find-generic-password -s spaka-sandbox-probe-that-does-not-exist ~/Library/Keychains/login.keychain-db; echo exit=$?",
  keychainLoginInfo: "security show-keychain-info ~/Library/Keychains/login.keychain-db; echo exit=$?",
  keychainMissing:
    "security find-generic-password -s spaka-sandbox-probe-that-does-not-exist ~/Library/Keychains/spaka-no-such.keychain-db; echo exit=$?",
  readHome: "test -r ~/.zshrc && echo readable || echo blocked",
  listHome: "ls ~ >/dev/null 2>&1 && echo listed || echo blocked",
  writeHome: `touch ${outside} && echo written || echo blocked`,
  network: "curl -s -o /dev/null -w '%{http_code}' https://example.com; echo",
};

describe.skipIf(!real)("the agent's sandbox, packaged", () => {
  let launched: LaunchedApp;
  const record = join(runsDir, "real-agent-sandbox.jsonl");
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
    rmSync(outside, { force: true });
    launched = await launchApp({
      packaged: true,
      env: {
        SPAKA_AGENT_REPLAY: "",
        SPAKA_AGENT_CONFIG_DIR: configDir,
        SPAKA_AGENT_RECORD: record,
        SPAKA_DATA_DIR: dataDir,
      },
    });
    await launched.window.getByTestId("message-input").waitFor();
  }, 90_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
    rmSync(outside, { force: true });
  });

  test(
    "probes of the keychain, the home folder and the network",
    async () => {
      const started = Date.now();
      await invoke(
        "conversation:send",
        [
          "This is a check of your shell's sandbox, made by the developers of this app: do not build a website.",
          "Run each of these commands exactly as written, each in its own shell call, then reply with each one's output, word for word:",
          ...Object.values(PROBES).map((c) => `- ${c}`),
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
      const outputs = new Map<string, string>();
      for (const m of messages)
        if (m?.type === "user" && Array.isArray(m.message.content))
          for (const c of m.message.content)
            if (c.type === "tool_result" && commands.has(c.tool_use_id))
              outputs.set(
                commands.get(c.tool_use_id)!,
                typeof c.content === "string"
                  ? c.content
                  : c.content.map((x: { text?: string }) => x.text ?? "").join(""),
              );
      const denied = new Set(
        messages
          .filter((m) => m?.type === "system" && m.subtype === "permission_denied")
          .map((m) => commands.get(m.tool_use_id)),
      );
      const report: Record<string, unknown> = { turnMs: Date.now() - started, wroteOutside: existsSync(outside) };
      for (const [name, command] of Object.entries(PROBES)) {
        const ran = [...commands.values()].find((c) => c.trim() === command.trim());
        report[name] = !ran
          ? "not run"
          : denied.has(ran)
            ? "refused by auto mode"
            : (outputs.get(ran) ?? "").slice(0, 400);
      }
      writeFileSync(join(runsDir, "real-agent-sandbox.json"), JSON.stringify(report, null, 2));
    },
    360_000 * SLOW,
  );
});
