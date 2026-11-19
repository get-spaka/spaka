// Checks of Upstart's own harness with a real model (ADR 0012). They spend a
// little of the maker's Gemini key, so they run only when asked:
// UPSTART_REAL_PI=1, with GEMINI_API_KEY set in the terminal
// (Q404: never kept in a file). The key goes from there to the app's main process,
// never printed. With UPSTART_PI_RECORD=<file>, the model's replies are
// recorded, for agent-pi-replay.e2e.ts to play back. With
// UPSTART_REAL_PI_VERTEX_PROJECT=<project>, Gemini runs on Vertex AI instead,
// on the Google Cloud sign-in made with gcloud (Q280), its calls' arguments
// streamed to the preview.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";

const real = process.env.UPSTART_REAL_PI === "1";
const vertexProject = process.env.UPSTART_REAL_PI_VERTEX_PROJECT;
const account = vertexProject ? "vertex" : "gemini";
const hydrogen = `${account}/gemini-4-hydrogen`;

/** A key of the maker's, set in the terminal for a run with a real model (Q404): never kept in a file. */
const key = (name: string): string | undefined => process.env[name]?.trim() || undefined;

/** Shown even when the checks pass. */
const say = (line: string) => process.stdout.write(`${line}\n`);

type Logged = { t: number; kind: string; name?: string; path?: string; length?: number };

describe.skipIf(!real)(`Upstart's own harness, with Gemini on ${account}`, () => {
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
    timeout *= SLOW;
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
    const record = process.env.UPSTART_PI_RECORD;
    launched = await launchApp({ env: { UPSTART_AGENT_REPLAY: "", ...(record ? { UPSTART_PI_RECORD: record } : {}) } });
    await launched.window.getByTestId("message-input").waitFor();
    if (vertexProject) await main((u, p) => u.piAccounts.setVertexGcloud(p), vertexProject);
    else {
      const gemini = key("GEMINI_API_KEY");
      if (!gemini) throw new Error("Set GEMINI_API_KEY in the terminal to run these checks with a real Gemini.");
      await main((u, k) => u.piAccounts.setKey("gemini", k), gemini);
    }
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
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test("the key connects the account: its models are offered", async () => {
    const status = await invoke("agent:status");
    expect(status.accounts[account]).toBe(true);
    expect(status.models.map((m: { id: string }) => m.id)).toEqual(
      expect.arrayContaining([hydrogen, `${account}/gemini-4-carbon`]),
    );
  });

  test(
    "Gemini 4 Hydrogen builds a site, the preview following it",
    async () => {
      const started = Date.now();
      await invoke(
        "conversation:send",
        "Un site d'une page pour un fleuriste à Nantes, Fleur de Loire : le thème et la page d'accueil avec trois sections.",
        { model: hydrogen, effort: "medium" },
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
      // How finely the home page reached the preview: each piece is a new rendering of it.
      const pagePieces = log.filter((e) => e.kind === "tool-input" && e.path === "pages/index.liquid" && e.length);
      say(
        `[pi] pages/index.liquid: ${pagePieces.length} pieces, first at ${at(pagePieces[0])}, last at ${at(pagePieces.at(-1))}`,
      );
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
    },
    420_000 * SLOW,
  );

  test(
    "a second message continues the same conversation",
    async () => {
      const before = await launched.window.getByTestId("agent-message").count();
      await invoke("conversation:send", "Mets le nom du fleuriste en titre de l'onglet, sans rien changer d'autre.");
      await turnEnded(before, 240_000);
      const { items } = await invoke("conversation:get");
      expect(items.at(-1)).toMatchObject({ kind: "agent", status: "done" });
      const project = await invoke("projects:current");
      expect(readFileSync(join(project.path, "pages/index.liquid"), "utf8")).toMatch(/<title>[^<]*Fleur de Loire/);
    },
    260_000 * SLOW,
  );

  test(
    "the agent searches the web with Google Search, then writes what it found",
    async () => {
      const before = await launched.window.getByTestId("agent-message").count();
      const from = ((await main(() => (globalThis as { piLog?: Logged[] }).piLog ?? [])) as Logged[]).length;
      await invoke(
        "conversation:send",
        "Le fleuriste est en face du Jardin des Plantes de Nantes : cherche sur le web les horaires d'ouverture du jardin en hiver, et ajoute-les dans le pied de page, sous « Le jardin d'en face ».",
      );
      await turnEnded(before, 300_000);
      const { items } = await invoke("conversation:get");
      expect(items.at(-1)).toMatchObject({ kind: "agent", status: "done" });
      const log = ((await main(() => (globalThis as { piLog?: Logged[] }).piLog ?? [])) as Logged[]).slice(from);
      const searches = log.filter((e) => e.kind === "tool-result" && e.name === "WebSearch");
      say(`[pi] searches: ${searches.length}; problems: ${JSON.stringify(await problems())}`);
      expect(searches.length).toBeGreaterThan(0);
      const project = await invoke("projects:current");
      const footer = ["parts/footer.liquid", "pages/index.liquid"]
        .map((f) => (existsSync(join(project.path, f)) ? readFileSync(join(project.path, f), "utf8") : ""))
        .join("\n");
      expect(footer).toMatch(/jardin d.en face/i);
    },
    320_000 * SLOW,
  );
});
