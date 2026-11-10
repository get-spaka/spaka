import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";

// Connectors (ADR 0010), with the recorded agent: added from the settings
// without their secrets in any file in clear, a received project's program
// kept off until turned on, and what is on given to the agent.
describe("connectors", () => {
  let launched: LaunchedApp;
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
  const until = async (read: () => Promise<unknown>, timeout = 10_000) => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  /** The connectors the project's running agent was given. */
  const given = async () => {
    const { id } = await invoke("projects:current");
    return main((u, id) => u.agent.sessions.get(id)?.connectors?.names ?? [], id) as Promise<string[]>;
  };
  const row = (name: string) => launched.window.locator(`[data-testid="connector"][data-name="${name}"]`);

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("conversation").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    await launched.window.getByTestId("open-settings").click();
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("a remote connector added for all websites keeps its token out of every file in clear", async () => {
    const w = launched.window;
    await w.getByTestId("connector-new").click();
    await w.getByTestId("connector-scope").selectOption("app");
    await w.getByTestId("connector-name").fill("docs");
    await w.getByTestId("connector-target").fill("https://mcp.example.invalid/mcp");
    await w.getByTestId("connector-secret-name").fill("Authorization");
    await w.getByTestId("connector-secret-value").fill("Bearer check-token");
    await w.getByTestId("connector-add").click();
    await until(() => row("docs").count());
    expect(await row("docs").getAttribute("data-state")).toBe("on");
    expect(readFileSync(join(launched.dataDir, "connectors.json"), "utf8")).not.toContain("check-token");
    expect(readFileSync(join(launched.dataDir, "connector-secrets.bin"), "utf8")).not.toContain("check-token");
    await until(async () => (await given()).includes("docs"));
  });

  test("a received project's program stays off until turned on, showing its command", async () => {
    const { path } = await invoke("projects:current");
    mkdirSync(join(path, ".upstart"), { recursive: true });
    writeFileSync(
      join(path, ".upstart/connectors.json"),
      JSON.stringify({ connectors: [{ name: "notes", kind: "local", command: "node", args: ["notes-server.js"] }] }),
    );
    await until(() => row("notes").count());
    expect(await row("notes").getAttribute("data-state")).toBe("needs-approval");
    await expect(row("notes").locator("code").textContent()).resolves.toBe("node notes-server.js");
    expect(await given()).not.toContain("notes");
    await launched.capture("settings-connectors");
    await row("notes").getByTestId("connector-approve").click();
    await until(async () => (await row("notes").getAttribute("data-state")) === "on");
    await until(async () => (await given()).includes("notes"));

    // The agent (or anyone) changes the command: it is off again.
    writeFileSync(
      join(path, ".upstart/connectors.json"),
      JSON.stringify({ connectors: [{ name: "notes", kind: "local", command: "node", args: ["other.js"] }] }),
    );
    await until(async () => (await row("notes").getAttribute("data-state")) === "needs-approval");
    await until(async () => !(await given()).includes("notes"));
  });

  test("a form error is said; removing a connector takes it from the agent", async () => {
    const w = launched.window;
    await w.getByTestId("connector-new").click();
    await w.getByTestId("connector-name").fill("upstart");
    await w.getByTestId("connector-target").fill("https://example.com/mcp");
    await w.getByTestId("connector-add").click();
    await expect(w.getByTestId("connector-error").textContent()).resolves.toContain("taken by Upstart");
    await row("docs").getByTestId("connector-remove").click();
    await until(async () => (await row("docs").count()) === 0);
    await until(async () => !(await given()).includes("docs"));
  });
});
