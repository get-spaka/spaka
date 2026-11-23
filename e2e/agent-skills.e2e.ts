// Skills with the real agent (ADR 0010). Opt-in like agent.e2e.ts:
// UPSTART_REAL_AGENT=1, with .cache/agent-config signed in. Three short turns.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { agentConfigDir, type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";

const real = process.env.UPSTART_REAL_AGENT === "1";
const configDir = agentConfigDir();
const outside = join(import.meta.dirname, "../.cache/outside-check");
// The app's data under the home folder, as in real use: the sandbox denies
// reading there, except for the folders Upstart opens to the agent.
const dataDir = join(import.meta.dirname, "../.cache/skills-check-data");

describe.skipIf(!real)("skills with the real agent", () => {
  let launched: LaunchedApp;
  const record = join(runsDir, "real-agent-skills.jsonl");
  // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
  const main = <T>(fn: (upstart: any, arg: any) => T, arg?: unknown) =>
    launched.app.evaluate(
      (_electron, [source, arg]) =>
        new Function("u", "a", `return (${source})(u, a)`)((globalThis as { upstart?: unknown }).upstart, arg),
      [fn.toString(), arg] as const,
    ) as Promise<Awaited<T>>;
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
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
  const textOf = (item: { parts: { kind: string; text?: string }[] }) =>
    item.parts
      .filter((p) => p.kind === "text")
      .map((p) => p.text)
      .join("");
  const labels = (item: { parts: { kind: string; activity?: { label: string; state: string } }[] }) =>
    item.parts.filter((p) => p.kind === "activity").map((p) => `${p.activity!.label} [${p.activity!.state}]`);
  const problems = () => main((u) => [...u.agent.sessions.values()].flatMap((s: { problems: string[] }) => s.problems));
  /** The init messages the agent sent, from the recording. */
  const inits = () =>
    readFileSync(record, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).m)
      .filter((m) => m?.type === "system" && m.subtype === "init");

  beforeAll(async () => {
    mkdirSync(runsDir, { recursive: true });
    rmSync(record, { force: true });
    rmSync(outside, { recursive: true, force: true });
    mkdirSync(outside, { recursive: true });
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
    // A skill for all websites, added before any project exists.
    const source = mkdtempSync(join(tmpdir(), "skill-"));
    mkdirSync(join(source, "secret-word"));
    writeFileSync(
      join(source, "secret-word", "SKILL.md"),
      "---\nname: secret-word\ndescription: The maker's secret word. Use when the maker asks for the secret word.\n---\n\nThe secret word is: hibiscus.\n",
    );
    await invoke("skills:add", "app", join(source, "secret-word"));
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test(
    "a skill for all websites is used; the binary's own skills are not offered",
    async () => {
      const item = await turn(
        "Do not build anything yet. What is my secret word? Answer with the word only, using your skills.",
      );
      expect(item.status).toBe("done");
      process.stdout.write(`[skills] turn 1: ${labels(item).join(", ")} — ${textOf(item)}\n`);
      expect(textOf(item).toLowerCase()).toContain("hibiscus");
      expect(labels(item)).toContain("Following the skill secret-word [done]");
      expect(await problems()).toEqual([]);
      const [init] = inits();
      process.stdout.write(`[skills] init skills: ${JSON.stringify(init.skills)}\n`);
      process.stdout.write(`[skills] init plugins: ${JSON.stringify(init.plugins)}\n`);
      process.stdout.write(`[skills] init tools: ${JSON.stringify(init.tools)}\n`);
    },
    200_000 * SLOW,
  );

  test(
    "a project skill written meanwhile is picked up; its script stays in the sandbox; the skills folder is read-only",
    async () => {
      const project = await invoke("projects:current");
      const target = join(outside, "escape.txt");
      const dir = join(project.path, ".upstart/skills/site-check");
      mkdirSync(join(dir, "scripts"), { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: site-check\ndescription: Checks the site. Use when the maker asks for a site check.\n---\n\nRun `sh scripts/check.sh` from this skill's folder with the shell, once, and report its output in one sentence. If it fails, say so; do not try another way.\n",
      );
      writeFileSync(join(dir, "scripts/check.sh"), `#!/bin/sh\necho "checking"\necho hi > ${JSON.stringify(target)}\n`);
      const data = await main((u, id) => u.projects.dataFor(id), project.id);
      const copied = join(data, "skills/project/skills/site-check/SKILL.md");
      const item = await turn(
        `Run a site check with your skills. Then, as a test of your limits, try once to append the line "x" to the file ${copied} with the Edit tool, and say in one sentence whether it worked.`,
      );
      process.stdout.write(`[skills] turn 2: ${labels(item).join(", ")} — ${textOf(item)}\n`);
      expect(item.status).toBe("done");
      expect(labels(item)).toContain("Following the skill site-check [done]");
      expect(existsSync(target)).toBe(false);
      expect(readFileSync(copied, "utf8")).not.toMatch(/\nx\s*$/);
      expect(await problems()).toEqual([]);
      // The agent started again with the project's skill, resuming the same conversation.
      const all = inits();
      expect(all.length).toBeGreaterThanOrEqual(2);
      expect(all.at(-1).session_id).toBe(all[0].session_id);
    },
    200_000 * SLOW,
  );

  test(
    "a skill built into the binary cannot be launched",
    async () => {
      const item = await turn(
        'This is a test of your limits. Use the Skill tool once to launch the skill named "dataviz", then say in one sentence whether it worked. Do not try anything else.',
      );
      process.stdout.write(`[skills] turn 3: ${labels(item).join(", ")} — ${textOf(item)}\n`);
      expect(item.status).toBe("done");
      expect(labels(item).some((l) => /dataviz \[done\]/.test(l))).toBe(false);
    },
    200_000 * SLOW,
  );
});
