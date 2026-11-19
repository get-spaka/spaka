// Connectors with the real agent (ADR 0010). Opt-in like agent.e2e.ts:
// UPSTART_REAL_AGENT=1, with .cache/agent-config signed in. One short turn.
// The remote connector is a public documentation server, only connected to:
// no request is sent to it.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";

const real = process.env.UPSTART_REAL_AGENT === "1";
const configDir = join(import.meta.dirname, "../.cache/agent-config");
const dataDir = join(import.meta.dirname, "../.cache/connectors-check-data");
const server = join(import.meta.dirname, "fixtures/hours-connector.mjs");

describe.skipIf(!real)("connectors with the real agent", () => {
  let launched: LaunchedApp;
  const record = join(runsDir, "real-agent-connectors.jsonl");
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
      [channel, args] as const,
    );
  const until = async (read: () => Promise<unknown>, timeout: number) => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 300));
    }
  };
  const turn = async (text: string, timeout = 180_000) => {
    const before = await launched.window.getByTestId("agent-message").count();
    await invoke("conversation:send", text);
    await until(
      () => launched.window.locator('[data-testid="agent-message"]:not([data-status="working"])').nth(before).count(),
      timeout,
    );
    const { items } = await invoke("conversation:get");
    return items.at(-1);
  };
  const messages = () =>
    readFileSync(record, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).m);
  const status = async (name: string) =>
    ((await invoke("connectors:list")) as { name: string; state: string; status?: string; error?: string }[]).find(
      (c) => c.name === name,
    );

  beforeAll(async () => {
    mkdirSync(runsDir, { recursive: true });
    rmSync(record, { force: true });
    rmSync(dataDir, { recursive: true, force: true });
    launched = await launchApp({
      env: {
        UPSTART_AGENT_REPLAY: "",
        UPSTART_AGENT_CONFIG_DIR: configDir,
        UPSTART_AGENT_RECORD: record,
        UPSTART_DATA_DIR: dataDir,
      },
    });
    await launched.window.getByTestId("message-input").waitFor();
    await until(async () => (await invoke("agent:status")).auth === "signed-in", 30_000);
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test(
    "a remote connector connects; a received project's program, turned on, is called with its secret",
    async () => {
      await invoke("connectors:add", "app", {
        name: "deepwiki",
        kind: "remote",
        target: "https://mcp.deepwiki.com/mcp",
      });
      // A first message makes the project; the agent answers briefly.
      const first = await turn("Do not build anything yet. Reply with the single word: ready");
      expect(first.status).toBe("done");
      await until(async () => (await status("deepwiki"))?.status === "connected", 30_000);

      // The project arrives with a local connector: off until turned on, then its secret is set here.
      const project = await invoke("projects:current");
      mkdirSync(join(project.path, ".upstart"), { recursive: true });
      const node = join(dataDir, "bin/node");
      writeFileSync(
        join(project.path, ".upstart/connectors.json"),
        JSON.stringify({
          connectors: [{ name: "till", kind: "local", command: node, args: [server], env: ["TILL_TOKEN"] }],
        }),
      );
      await until(async () => (await status("till"))?.state === "needs-approval", 10_000);
      await invoke("connectors:approve", "till");
      await invoke("connectors:set-secrets", "project", "till", { TILL_TOKEN: "check-42" });
      await until(async () => (await status("till"))?.state === "on", 10_000);

      const item = await turn(
        "Use the till connector to get the bakery's opening hours, then answer with exactly what it returned, nothing else.",
      );
      await until(async () => (await status("till"))?.status === "connected", 30_000);
      const all = messages();
      const inits = all.filter((m) => m?.type === "system" && m.subtype === "init");
      const calls = all.flatMap((m) =>
        m?.type === "assistant" ? m.message.content.filter((c: { type: string }) => c.type === "tool_use") : [],
      );
      const denied = all.filter((m) => m?.type === "system" && m.subtype === "permission_denied");
      const text = item.parts
        .filter((p: { kind: string }) => p.kind === "text")
        .map((p: { text: string }) => p.text)
        .join("");
      process.stdout.write(
        [
          `[connectors] servers at last start: ${JSON.stringify(inits.at(-1)?.mcp_servers)}`,
          `[connectors] tools at last start: ${JSON.stringify(inits.at(-1)?.tools)}`,
          `[connectors] calls: ${JSON.stringify(calls.map((c: { name: string }) => c.name))}`,
          `[connectors] refused: ${JSON.stringify(denied.map((d) => d.tool_name))}`,
          `[connectors] answer: ${text}`,
          "",
        ].join("\n"),
      );
      expect(item.status).toBe("done");
      expect(calls.map((c: { name: string }) => c.name)).toContain("mcp__till__opening_hours");
      expect(text).toContain("check-42");
      expect(denied).toEqual([]);
    },
    300_000 * SLOW,
  );
});
