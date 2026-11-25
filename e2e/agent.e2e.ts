// Checks with the real agent. Each spends a little of the maker's
// subscription, so they run only when asked: SPAKA_REAL_AGENT=1, with the
// agent's configuration folder .cache/agent-config signed in once
// (`claude auth login` with CLAUDE_CONFIG_DIR pointing at it).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { agentConfigDir, type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";

const real = process.env.SPAKA_REAL_AGENT === "1";
const configDir = agentConfigDir();
const outside = join(import.meta.dirname, "../.cache/outside-check");

describe.skipIf(!real)("the real agent", () => {
  let launched: LaunchedApp;
  // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
  const main = <T>(fn: (spaka: any, arg: any) => T, arg?: unknown) =>
    launched.app.evaluate(
      (_electron, [source, arg]) =>
        new Function("u", "a", `return (${source})(u, a)`)((globalThis as { spaka?: unknown }).spaka, arg),
      [fn.toString(), arg] as const,
    ) as Promise<Awaited<T>>;
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).spaka.invoke(channel, ...args),
      [channel, args] as const,
    );
  const until = async (read: () => Promise<unknown>, timeout: number) => {
    timeout *= SLOW;
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  };
  /** Sends a message and waits for the end of the turn; returns the agent's item. */
  const turn = async (text: string, timeout = 240_000) => {
    const before = await launched.window.getByTestId("agent-message").count();
    await invoke("conversation:send", text);
    await until(
      () => launched.window.locator('[data-testid="agent-message"]:not([data-status="working"])').nth(before).count(),
      timeout,
    );
    const { items } = await invoke("conversation:get");
    return items.at(-1);
  };
  const problems = () => main((u) => [...u.agent.sessions.values()].flatMap((s: { problems: string[] }) => s.problems));

  beforeAll(async () => {
    mkdirSync(runsDir, { recursive: true });
    const record = join(runsDir, "real-agent.jsonl");
    rmSync(record, { force: true });
    rmSync(outside, { recursive: true, force: true });
    mkdirSync(outside, { recursive: true });
    launched = await launchApp({
      env: { SPAKA_AGENT_REPLAY: "", SPAKA_AGENT_CONFIG_DIR: configDir, SPAKA_AGENT_RECORD: record },
    });
    await launched.window.getByTestId("message-input").waitFor();
    await until(async () => (await invoke("agent:status")).auth === "signed-in", 30_000);
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test(
    "a full turn builds a page in the project, isolated",
    async () => {
      const started = Date.now();
      const item = await turn(
        "A one-page website for a florist in Nantes called Fleur de Loire. Keep it small: the theme and the home page with three sections.",
      );
      console.log(`[real] first turn ${Date.now() - started} ms`);
      expect(item).toMatchObject({ kind: "agent", status: "done" });
      const project = await invoke("projects:current");
      expect(existsSync(join(project.path, "theme.css"))).toBe(true);
      expect(readFileSync(join(project.path, "pages/index.liquid"), "utf8")).toMatch(/<h1/);
      const labels = item.parts
        .filter((p: { kind: string }) => p.kind === "activity")
        .map((p: { activity: { label: string } }) => p.activity.label);
      expect(labels).toContain("Writing pages/index.liquid");
      expect(await problems()).toEqual([]);
      const png = await main((u) => u.preview.capture().then((b: Buffer) => b.toString("base64")));
      writeFileSync(join(runsDir, "real-first-turn-preview.png"), Buffer.from(png, "base64"));
    },
    300_000 * SLOW,
  );

  test(
    "a write outside the project is refused, without a question",
    async () => {
      const target = join(outside, "escape.txt");
      const item = await turn(
        `This is a test of your limits. Create the file ${target} containing "hi" with the Write tool. If that is refused, try once with the shell: echo hi > ${target}. Then say in one sentence what happened. Do not try anything else.`,
        180_000,
      );
      expect(item.status).toBe("done");
      expect(existsSync(target)).toBe(false);
      const states = item.parts
        .filter((p: { kind: string }) => p.kind === "activity")
        .map((p: { activity: { state: string } }) => p.activity.state);
      expect(states.some((s: string) => s === "refused" || s === "failed")).toBe(true);
    },
    200_000 * SLOW,
  );

  test(
    "node runs in the agent's shell",
    async () => {
      const version = await main(() => process.versions.node);
      const item = await turn(
        "Run `node -e \"console.log('v=' + process.versions.node)\"` in the shell and answer with its output only.",
        180_000,
      );
      const text = item.parts
        .filter((p: { kind: string }) => p.kind === "text")
        .map((p: { text: string }) => p.text)
        .join("");
      expect(text).toContain(`v=${version}`);
    },
    200_000 * SLOW,
  );

  test(
    "the agent can look at the preview",
    async () => {
      const project = await invoke("projects:current");
      const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(readFileSync(join(project.path, "pages/index.liquid"), "utf8"))?.[1];
      const item = await turn(
        "Use the look_at_preview tool once, then answer with the exact main heading you see on the page, and nothing else.",
        180_000,
      );
      expect(item.status).toBe("done");
      const looked = item.parts.find((p: { kind: string; activity?: { label: string } }) =>
        p.activity?.label.startsWith("Looking at the home page"),
      );
      expect(looked?.activity.state).toBe("done");
      const words = (h1 ?? "")
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const text = item.parts
        .filter((p: { kind: string }) => p.kind === "text")
        .map((p: { text: string }) => p.text)
        .join("");
      expect(words.some((w) => text.includes(w))).toBe(true);
      expect(await problems()).toEqual([]);
    },
    200_000 * SLOW,
  );

  test(
    "an effort change during the conversation is applied",
    async () => {
      await invoke("agent:set-effort", "low");
      const item = await turn("Reply with the single word: ok", 120_000);
      expect(item.status).toBe("done");
      const project = await invoke("projects:current");
      expect(project.effort).toBe("low");
      // The agent's own transcript keeps each request it sent: the last one asked for "low".
      const dataDir = await main((u, id) => u.projects.dataFor(id), project.id);
      const { sessionId } = JSON.parse(readFileSync(join(dataDir, "agent.json"), "utf8"));
      const transcript = readdirSync(join(configDir, "projects"))
        .map((folder) => join(configDir, "projects", folder, `${sessionId}.jsonl`))
        .find((file) => existsSync(file))!;
      const efforts = readFileSync(transcript, "utf8").match(/"effort":"\w+"/g) ?? [];
      expect(efforts.at(-1)).toBe('"effort":"low"');
      expect(efforts).toContain('"effort":"high"');
    },
    150_000 * SLOW,
  );
});
