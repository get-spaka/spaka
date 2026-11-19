import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";
import { writePlanRecording } from "./fixtures/questions-recording.ts";

// Plan mode (Q286, Q290, Q296), on a made-up recording
// (fixtures/questions-recording.ts): chosen with the Build / Plan selector
// before the first message or at any moment after, kept with the website;
// the agent hands in a plan, a card waiting for Build or for the changes the
// maker writes in the message box, then builds in the same turn once
// approved, the website back in Build.
describe("plan mode", () => {
  let launched: LaunchedApp;
  const until = async (read: () => Promise<unknown>, timeout = 15_000) => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const invoke = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...(args as unknown[])),
      [channel, args] as const,
    ) as Promise<T>;
  const planAnswers = async () =>
    (
      await launched.app.evaluate(
        // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
        () => (globalThis as any).upstart.replayed as string[],
      )
    )
      .filter((l) => l.startsWith("[ExitPlanMode] "))
      .map((l) => JSON.parse(l.slice("[ExitPlanMode] ".length)));
  const modeOf = async () => (await invoke<{ mode?: string }>("projects:current")).mode ?? "build";
  const card = (state: string) => launched.window.locator(`[data-testid="plan-card"][data-state="${state}"]`);
  const send = async (text: string) => {
    await launched.window.getByTestId("message-input").fill(text);
    await launched.window.getByTestId("message-input").press("Enter");
  };

  beforeAll(async () => {
    const file = join(mkdtempSync(join(tmpdir(), "upstart-plan-")), "plan.jsonl");
    writePlanRecording(file);
    launched = await launchApp({ env: { UPSTART_AGENT_REPLAY: file } });
    await launched.window.getByTestId("message-input").waitFor();
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test("a website started in Plan: a plan, changes, a new plan, Build, then the build", async () => {
    const w = launched.window;
    await w.getByTestId("mode-select").selectOption("plan");
    await send("A bakery in Lyon.");
    await until(() => card("proposed").count());
    expect(await modeOf()).toBe("plan");
    await expect(card("proposed").getByTestId("plan-text").textContent()).resolves.toContain("The bakery's site");
    await expect(w.getByTestId("message-input").getAttribute("placeholder")).resolves.toBe(
      "Say what to change in the plan…",
    );
    expect(await w.getByTestId("project-waiting").count()).toBe(1);
    // The mode waits for the agent's next turn: not changed while it works.
    await expect(w.getByTestId("mode-select").isDisabled()).resolves.toBe(true);
    await launched.capture("plan-proposed");

    // Changes in the maker's words: the plan is replaced by a new one.
    const makers = await w.getByTestId("maker-message").count();
    await send("Add a page for weddings");
    await until(async () => (await card("replaced").count()) === 1 && (await card("proposed").count()) === 1);
    expect(await w.getByTestId("maker-message").count()).toBe(makers);
    await expect(card("replaced").textContent()).resolves.toContain("Add a page for weddings");
    await expect(card("proposed").getByTestId("plan-text").textContent()).resolves.toContain("Weddings");
    expect((await planAnswers())[0]).toMatchObject({
      behavior: "deny",
      message: expect.stringMatching(/^The maker wants changes to the plan: Add a page for weddings/),
    });

    // Build: approved, the agent builds in the same turn, the website back in Build.
    await w.getByTestId("plan-build").click();
    await until(() => w.locator('[data-testid="agent-message"][data-status="done"]').count());
    expect((await planAnswers()).at(-1)).toMatchObject({ behavior: "allow" });
    expect(await card("approved").count()).toBe(1);
    const { path } = await invoke<{ path: string }>("projects:current");
    expect(existsSync(join(path, "pages/index.liquid"))).toBe(true);
    expect(await modeOf()).toBe("build");
    await until(async () => (await w.getByTestId("mode-select").inputValue()) === "build");
    await expect(w.getByTestId("mode-select").isDisabled()).resolves.toBe(false);
    // A settled plan unfolds.
    await card("approved").getByTestId("plan-toggle").click();
    await expect(card("approved").getByTestId("plan-text").textContent()).resolves.toContain("Weddings");
    await launched.capture("plan-approved");
  });

  test("Plan chosen on a website is kept with it; Stop leaves the plan not answered", async () => {
    const w = launched.window;
    await w.getByTestId("mode-select").selectOption("plan");
    await until(async () => (await modeOf()) === "plan");
    await send("A page for the team");
    await until(() => card("proposed").count());
    await w.getByTestId("stop").click();
    await until(() => w.locator('[data-testid="agent-message"][data-status="stopped"]').count());
    expect(await card("unanswered").count()).toBe(1);
    expect((await planAnswers()).at(-1)).toMatchObject({ behavior: "deny" });
    // Not approved: the website stays in Plan until the maker changes it.
    expect(await modeOf()).toBe("plan");
    await w.getByTestId("mode-select").selectOption("build");
    await until(async () => (await modeOf()) === "build");
  });
});
