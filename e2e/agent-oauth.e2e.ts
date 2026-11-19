// Signing in to a remote connector (Q89, Q106), with the real agent. Opt-in
// twice, since it opens the maker's browser and asks them to sign in:
// UPSTART_REAL_AGENT=1 and UPSTART_OAUTH_TRIAL=1, with .cache/agent-config
// signed in. The app stays hidden; the test opens the sign-in page itself.
// The official program keeps the token; nothing of it may land in the
// project or in Upstart's own data.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";

const trial = process.env.UPSTART_REAL_AGENT === "1" && process.env.UPSTART_OAUTH_TRIAL === "1";
const configDir = join(import.meta.dirname, "../.cache/agent-config");
const dataDir = join(import.meta.dirname, "../.cache/oauth-check-data");
const NAME = "notion";
const TARGET = "https://mcp.notion.com/mcp";

/** Every file under a folder, as paths. */
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : d.isFile() ? [join(dir, d.name)] : [],
  );

describe.skipIf(!trial)("signing in to a connector with the real agent", () => {
  let launched: LaunchedApp;
  const record = join(runsDir, "real-agent-oauth.jsonl");
  const report: Record<string, unknown> = {};
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
      await new Promise((r) => setTimeout(r, 500));
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
  const status = async () =>
    ((await invoke("connectors:list")) as { name: string; state: string; status?: string; error?: string }[]).find(
      (c) => c.name === NAME,
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
    writeFileSync(join(runsDir, "real-agent-oauth.json"), JSON.stringify(report, null, 2));
    await launched?.close();
  });

  test(
    "the connector asks to sign in; once signed in in the browser, its tools are the agent's",
    async () => {
      await invoke("connectors:add", "app", { name: NAME, kind: "remote", target: TARGET });
      const first = await turn("Do not build anything yet. Reply with the single word: ready");
      expect(first.status).toBe("done");
      await until(async () => (await status())?.status === "needs-auth", 60_000);
      report.before = await status();

      // The button's channel: the kit answers the sign-in page; the test opens it in the browser.
      const started = Date.now();
      const { url } = (await invoke("connectors:sign-in", NAME)) as { url?: string };
      expect(url).toMatch(/^https:\/\//);
      report.signInHost = new URL(url!).host;
      execFileSync("open", [url!]);
      process.stdout.write(`[oauth] sign-in page opened at ${report.signInHost}; waiting up to 5 minutes\n`);
      await until(async () => (await status())?.status === "connected", 300_000);
      report.signedInMs = Date.now() - started;
      report.after = await status();

      // The agent has the connector's tools now.
      const item = await turn(
        `Without calling any tool, list the names of the tools you have whose names start with mcp__${NAME}__, one per line, nothing else.`,
      );
      const text = item.parts
        .filter((p: { kind: string }) => p.kind === "text")
        .map((p: { text: string }) => p.text)
        .join("");
      report.tools = text.split("\n").filter((l: string) => l.includes(`mcp__${NAME}__`));
      expect((report.tools as string[]).length).toBeGreaterThan(0);

      // Nothing of the token in the project or in Upstart's own data.
      const project = (await invoke("projects:current")).path as string;
      const leaks = [...files(project), ...files(dataDir)].filter((f) => {
        if (statSync(f).size > 2_000_000) return false;
        const text = readFileSync(f, "utf8");
        return /access_token|refresh_token|mcpOAuth/.test(text);
      });
      report.leaks = leaks;
      expect(leaks).toEqual([]);
    },
    480_000 * SLOW,
  );
});
