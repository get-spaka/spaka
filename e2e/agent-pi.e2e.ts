// Checks of Upstart's own harness with a real model (ADR 0012). They spend a
// little of the maker's Gemini key, so they run only when asked:
// UPSTART_REAL_PI=1, with GEMINI_API_KEY in spikes/harnesses/homes/keys.env
// (ignored by git). The key goes from that file to the app's main process,
// never printed.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";

const keysFile = join(import.meta.dirname, "../spikes/harnesses/homes/keys.env");
const real = process.env.UPSTART_REAL_PI === "1";

function key(name: string): string | undefined {
  if (!existsSync(keysFile)) return undefined;
  for (const line of readFileSync(keysFile, "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m?.[1] === name) return m[2]!.replace(/^["']|["']$/g, "") || undefined;
  }
  return undefined;
}

/** Shown even when the checks pass. */
const say = (line: string) => process.stdout.write(`${line}\n`);

type Logged = { t: number; kind: string; name?: string; path?: string; length?: number };

describe.skipIf(!real)("Upstart's own harness, with Gemini", () => {
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
  const until = async (read: () => Promise<unknown>, timeout: number) => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 300));
    }
  };
  const turnEnded = (before: number, timeout: number) =>
    until(
      () => launched.window.locator('[data-testid="agent-message"]:not([data-status="working"])').nth(before).count(),
      timeout,
    );
  const problems = () => main((u) => [...u.agent.sessions.values()].flatMap((s: { problems: string[] }) => s.problems));

  beforeAll(async () => {
    launched = await launchApp({ env: { UPSTART_AGENT_REPLAY: "" } });
    await launched.window.getByTestId("message-input").waitFor();
    const gemini = key("GEMINI_API_KEY");
    if (!gemini) throw new Error(`No GEMINI_API_KEY in ${keysFile}`);
    await main((u, k) => u.piAccounts.setKey("gemini", k), gemini);
    // What the agent streams, with its time, to see the page grow (ADR 0009).
    await main((u) => {
      const log: Logged[] = [];
      (globalThis as { piLog?: Logged[] }).piLog = log;
      const before = u.agent.o.onAgentEvent;
      u.agent.o.onAgentEvent = (
        id: string,
        e: {
          kind: string;
          name?: string;
          fields?: { file_path?: string; content?: string };
          input?: { file_path?: string; content?: string };
        },
      ) => {
        const input = e.fields ?? e.input;
        log.push({ t: Date.now(), kind: e.kind, name: e.name, path: input?.file_path, length: input?.content?.length });
        before?.(id, e);
      };
    });
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("the key connects the account: its models are offered", async () => {
    const status = await invoke("agent:status");
    expect(status.accounts.gemini).toBe(true);
    expect(status.models.map((m: { id: string }) => m.id)).toEqual(
      expect.arrayContaining(["gemini/gemini-4-hydrogen", "gemini/gemini-4-carbon"]),
    );
  });

  test("Gemini 4 Hydrogen builds a site, the preview following it", async () => {
    const started = Date.now();
    await invoke(
      "conversation:send",
      "Un site d'une page pour un fleuriste à Nantes, Fleur de Loire : le thème et la page d'accueil avec trois sections.",
      { model: "gemini/gemini-4-hydrogen", effort: "medium" },
    );
    await turnEnded(0, 400_000);
    const done = Date.now();
    const { items } = await invoke("conversation:get");
    const item = items.at(-1);
    const project = await invoke("projects:current");
    const log = (await main(() => (globalThis as { piLog?: Logged[] }).piLog ?? [])) as Logged[];
    const at = (e?: Logged) => (e ? `${((e.t - started) / 1000).toFixed(1)} s` : "-");
    // The first change the maker sees: a file being written, or a block placed (ADR 0009).
    const firstWrite = log.find((e) => e.kind === "tool-input" && e.length);
    const firstBlock = log.find((e) => e.kind === "tool-result" && e.name === "mcp__upstart__use_block");
    const calls = log.filter((e) => e.kind === "tool-input-end");
    say(
      `[pi] turn ${((done - started) / 1000).toFixed(1)} s; first text written at ${at(firstWrite)} (${firstWrite?.path}); first block placed at ${at(firstBlock)}; ${calls.length} tool calls`,
    );
    say(`[pi] calls: ${calls.map((e) => `${at(e)} ${e.name}${e.path ? ` ${e.path}` : ""}`).join("; ")}`);
    say(`[pi] problems: ${JSON.stringify(await problems())}`);
    expect(item).toMatchObject({ kind: "agent", status: "done" });
    expect(existsSync(join(project.path, "theme.css"))).toBe(true);
    const page = readFileSync(join(project.path, "pages/index.liquid"), "utf8");
    expect(page).toMatch(/<html|render/);
    expect(firstWrite ?? firstBlock).toBeDefined();
  }, 420_000);

  test("a second message continues the same conversation", async () => {
    const before = await launched.window.getByTestId("agent-message").count();
    await invoke("conversation:send", "Mets le nom du fleuriste en titre de l'onglet, sans rien changer d'autre.");
    await turnEnded(before, 240_000);
    const { items } = await invoke("conversation:get");
    expect(items.at(-1)).toMatchObject({ kind: "agent", status: "done" });
    const project = await invoke("projects:current");
    expect(readFileSync(join(project.path, "pages/index.liquid"), "utf8")).toMatch(/<title>[^<]*Fleur de Loire/);
  }, 260_000);
});
