import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";

// Edits by hand (Q90, Q91, Q94), with the recorded agent: written by the app
// into the files, each a version of its own that can be undone alone, folded
// together in the timeline, and told to the agent with the next message.
describe("edits by hand", () => {
  let launched: LaunchedApp;
  let path: string;
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
      [channel, args] as const,
    );
  const until = async (read: () => Promise<unknown>, timeout = 10_000) => {
    timeout *= SLOW;
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const home = () => readFileSync(join(path, "pages/index.liquid"), "utf8");
  const inPreview = (code: string) =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, code) => (globalThis as any).upstart.preview.view.webContents.executeJavaScript(code),
      code,
    );

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    path = (await invoke("projects:current")).path;
    // Edit mode: the preview opens in visitor mode (Q253).
    await invoke("preview:set-mode", "edit");
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test("a text changed by hand is written, shown, and undone alone", async () => {
    const before = home();
    const at = before.indexOf("<h1");
    const h1 = /<h1[^>]*>([^<]*)<\/h1>/.exec(before)!;
    const result = await invoke("editing:apply", {
      type: "text",
      file: "pages/index.liquid",
      at,
      texts: ["Pain & café"],
    });
    expect(result).toEqual({ label: "Text changed", files: ["pages/index.liquid"] });
    expect(home()).toBe(before.replace(h1[0], h1[0].replace(h1[1]!, "Pain &amp; café")));
    await invoke("preview:navigate", "/");
    await until(() => inPreview("document.querySelector('h1')?.textContent === 'Pain & café'"));
    const entries = await invoke("history:list");
    expect(entries.at(-1)).toMatchObject({ kind: "hand", label: "Text changed", current: true });
    await invoke("history:undo");
    expect(home()).toBe(before);
  });

  test("a section is duplicated, moved and deleted; a computed text is refused", async () => {
    const before = home();
    const sections = () => [...home().matchAll(/<section\b/g)].length;
    const count = sections();
    const at = before.indexOf("<section");
    await invoke("editing:apply", { type: "duplicate", file: "pages/index.liquid", at });
    expect(sections()).toBe(count + 1);
    // The copy and its original are alike: the third section moves to the top.
    const duplicated = home();
    const starts = [...duplicated.matchAll(/<section\b/g)].map((m) => m.index);
    await invoke("editing:apply", { type: "move", file: "pages/index.liquid", at: starts[2], before: starts[0] });
    expect(home()).not.toBe(duplicated);
    await invoke("editing:apply", { type: "delete", file: "pages/index.liquid", at: home().indexOf("<section") });
    expect(sections()).toBe(count);
    await expect(
      invoke("editing:apply", { type: "text", file: "../outside.liquid", at: 0, texts: ["x"] }),
    ).rejects.toThrow(/cannot be edited/);
    expect(existsSync(join(path, "../outside.liquid"))).toBe(false);
  });

  test("edits that follow one another are folded together in the timeline", async () => {
    const w = launched.window;
    await w.getByTestId("history").click();
    await w.getByTestId("history-group").first().waitFor();
    await expect(w.getByTestId("history-group-toggle").first().textContent()).resolves.toContain("3 changes by you");
    expect(await w.getByTestId("history-entry").count()).toBeLessThan((await invoke("history:list")).length);
    await w.getByTestId("history-group-toggle").first().click();
    await expect(w.getByTestId("history-entry").first().textContent()).resolves.toContain("Deleted");
    await launched.capture("history-hand-group");
    await w.getByTestId("history").click();
  });

  test("the agent is told, with the next message, what the maker changed", async () => {
    await launched.app.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const u = (globalThis as any).upstart;
      const send = u.agent.send.bind(u.agent);
      u.sent = [];
      u.agent.send = (project: unknown, text: string, forAgent?: string) => {
        u.sent.push(forAgent ?? text);
        return send(project, text, forAgent);
      };
    });
    await invoke("conversation:send", "Make the footer darker.");
    // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
    const sent = (await launched.app.evaluate(() => (globalThis as any).upstart.sent)) as string[];
    expect(sent[0]).toMatch(
      /^\[Upstart: .*the maker changed by hand: .*duplicated \(pages\/index.liquid\); section moved/,
    );
    expect(sent[0]).toContain("Make the footer darker.");
  });

  test("while the agent works, an edit by hand waits", async () => {
    // The agent's turn is held as working, whatever the replay does.
    await launched.app.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const agent = (globalThis as any).upstart.agent;
      agent.isWorkingWas = agent.isWorking;
      agent.isWorking = () => true;
    });
    try {
      await expect(
        invoke("editing:apply", { type: "delete", file: "pages/index.liquid", at: home().indexOf("<section") }),
      ).rejects.toThrow(/agent is working/);
    } finally {
      await launched.app.evaluate(() => {
        // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
        const agent = (globalThis as any).upstart.agent;
        agent.isWorking = agent.isWorkingWas;
      });
    }
  });
});
