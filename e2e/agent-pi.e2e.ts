// Checks of Spaka's own harness with a real model (ADR 0012). They spend a
// little of the maker's Gemini key, so they run only when asked:
// SPAKA_REAL_PI=1, with GEMINI_API_KEY set in the terminal or in the
// repository's .env (Q438). The key goes from there to the app's main process,
// never printed. With SPAKA_PI_RECORD=<file>, the model's replies are
// recorded, for agent-pi-replay.e2e.ts to play back. With
// SPAKA_REAL_PI_VERTEX_PROJECT=<project>, Gemini runs on Vertex AI instead,
// on the Google Cloud sign-in made with gcloud (Q280), its calls' arguments
// streamed to the preview. With SPAKA_REAL_PI_OPENAI=1, the harness runs
// OpenAI's default model on OPENAI_API_KEY instead, searching with OpenAI's
// own web search.
import { existsSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { devKey as key } from "../apps/desktop/src/main/dev-keys.ts";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";
import { maker } from "./real-maker.ts";

const real = process.env.SPAKA_REAL_PI === "1";
const vertexProject = process.env.SPAKA_REAL_PI_VERTEX_PROJECT;
const openai = process.env.SPAKA_REAL_PI_OPENAI === "1";
const account = vertexProject ? "vertex" : openai ? "openai" : "gemini";
/** The model that builds, and another the account offers. */
const [model, other, modelName] = openai
  ? ["openai/gpt-6.2-sol", "openai/gpt-6.2-astra", "GPT-6.2 Sol"]
  : [`${account}/gemini-4-hydrogen`, `${account}/gemini-4-carbon`, "Gemini 4 Hydrogen"];

/** Shown even when the checks pass. */
const say = (line: string) => process.stdout.write(`${line}\n`);

type Logged = { t: number; kind: string; name?: string; path?: string; length?: number };

describe.skipIf(!real)(`Spaka's own harness, with ${modelName} on ${account}`, () => {
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
      await new Promise((r) => setTimeout(r, 300));
    }
  };
  const asker = maker(() => launched);
  /** The turn's end; a card the agent waits on is answered with its recommended choices, as a maker who agrees. */
  const turnEnded = (before: number, timeout: number) =>
    until(async () => {
      // A new website's first turn may end on the card of what the agent guessed (Q301).
      if (await asker.waitingQuestion().count()) {
        say("[pi] a card of questions, answered with its recommended choices");
        await asker.answerRecommended();
      }
      return launched.window.locator('[data-testid="agent-message"]:not([data-status="working"])').nth(before).count();
    }, timeout);
  const problems = () => main((u) => [...u.agent.sessions.values()].flatMap((s: { problems: string[] }) => s.problems));

  beforeAll(async () => {
    const record = process.env.SPAKA_PI_RECORD;
    launched = await launchApp({ env: { SPAKA_AGENT_REPLAY: "", ...(record ? { SPAKA_PI_RECORD: record } : {}) } });
    await launched.window.getByTestId("message-input").waitFor();
    if (vertexProject) await main((u, p) => u.piAccounts.setVertexGcloud(p), vertexProject);
    else if (openai) {
      const k = key("OPENAI_API_KEY");
      if (!k)
        throw new Error(
          "Set OPENAI_API_KEY in the terminal or in the repository's .env to run these checks with OpenAI.",
        );
      await main((u, k) => u.piAccounts.setKey("openai", k), k);
    } else {
      const gemini = key("GEMINI_API_KEY");
      if (!gemini)
        throw new Error(
          "Set GEMINI_API_KEY in the terminal or in the repository's .env to run these checks with a real Gemini.",
        );
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
    expect(status.models.map((m: { id: string }) => m.id)).toEqual(expect.arrayContaining([model, other]));
  });

  test(
    `${modelName} builds a site, the preview following it`,
    async () => {
      const started = Date.now();
      await invoke(
        "conversation:send",
        "Un site d'une page pour un fleuriste à Nantes, Fleur de Loire : le thème et la page d'accueil avec trois sections.",
        { model, effort: "medium" },
      );
      // What the agent did, said even when its turn does not end in time.
      const report = async (done: number) => {
        const log = (await main(() => (globalThis as { piLog?: Logged[] }).piLog ?? [])) as Logged[];
        const at = (e?: Logged) => (e ? `${((e.t - started) / 1000).toFixed(1)} s` : "-");
        // The first change the maker sees: a file being written, or a block placed (ADR 0009).
        const firstWrite = log.find((e) => e.kind === "tool-input" && e.length);
        const firstBlock = log.find((e) => e.kind === "tool-result" && e.name === "mcp__spaka__use_block");
        const calls = log.filter((e) => e.kind === "tool-input-end");
        // How finely the home page reached the preview: each piece is a new rendering of it.
        const pagePieces = log.filter((e) => e.kind === "tool-input" && e.path === "pages/index.liquid" && e.length);
        say(
          `[pi] pages/index.liquid: ${pagePieces.length} pieces, first at ${at(pagePieces[0])}, last at ${at(pagePieces.at(-1))}`,
        );
        say(
          `[pi] turn ${((done - started) / 1000).toFixed(1)} s; first text written at ${at(firstWrite)} (${firstWrite?.path}); first block placed at ${at(firstBlock)}; ${calls.length} tool calls; last event at ${at(log.at(-1))} (${log.at(-1)?.kind} ${log.at(-1)?.name ?? ""})`,
        );
        say(`[pi] calls: ${calls.map((e) => `${at(e)} ${e.name}${e.path ? ` ${e.path}` : ""}`).join("; ")}`);
        say(`[pi] problems: ${JSON.stringify(await problems())}`);
        const { items } = await invoke("conversation:get");
        const last = items.at(-1);
        // The turn's lines (retries, compaction, errors) and its last words.
        const lines = (last?.parts ?? [])
          .map((p: { kind: string; text?: string; activity?: { label: string; state: string; error?: string } }) =>
            p.kind === "activity"
              ? `${p.activity?.label} (${p.activity?.state}${p.activity?.error ? `: ${p.activity.error}` : ""})`
              : p.kind === "text"
                ? `text: ${p.text?.slice(0, 120).replace(/\n/g, " ")}`
                : p.kind,
          )
          .slice(-12);
        say(
          `[pi] last item: ${last?.kind} ${last?.status ?? ""}${last?.error ? ` (${last.error})` : ""}; ${lines.join(" | ")}`,
        );
        return { item: last, firstChange: firstWrite ?? firstBlock };
      };
      let seen: Awaited<ReturnType<typeof report>> | undefined;
      try {
        await turnEnded(0, 400_000);
      } finally {
        seen = await report(Date.now());
      }
      const project = await invoke("projects:current");
      expect(seen.item).toMatchObject({ kind: "agent", status: "done" });
      expect(existsSync(join(project.path, "theme.css"))).toBe(true);
      const page = readFileSync(join(project.path, "pages/index.liquid"), "utf8");
      expect(page).toMatch(/<html|render/);
      expect(seen.firstChange).toBeDefined();
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
    `the agent searches the web with ${openai ? "OpenAI's web search" : "Google Search"}, then writes what it found`,
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
  // Google's own suggestions come with Google Search alone.
  test.skipIf(openai)(
    "the search's results and Google's suggestions are shown with it (Q437)",
    async () => {
      const { items } = await invoke("conversation:get");
      const grounded = items
        .flatMap((i: { kind: string; parts?: { kind: string; activity?: { grounded?: unknown } }[] }) => i.parts ?? [])
        .filter((p: { activity?: { grounded?: unknown } }) => p.activity?.grounded);
      expect(grounded.length).toBeGreaterThan(0);
      expect(grounded[0].activity.grounded.suggestions).toMatch(/<a /);
    },
    10_000,
  );

  test(
    "a page the maker changed by hand is read again before the agent edits it (Q294, Q433)",
    async () => {
      const project = await invoke("projects:current");
      // The file holding the main title: the page, or one of its parts when it was built from blocks.
      const parts = join(project.path, "parts");
      const files = [
        join(project.path, "pages/index.liquid"),
        ...(existsSync(parts) ? readdirSync(parts).filter((f) => f.endsWith(".liquid")) : []).map((f) =>
          join(parts, f),
        ),
      ];
      const page = files.find((f) => /<h1[\s>]/.test(readFileSync(f, "utf8")));
      if (!page) throw new Error(`no <h1> in ${files.map((f) => relative(project.path, f)).join(", ")}`);
      say(`[pi] the main title is in ${relative(project.path, page)}`);
      const text = readFileSync(page, "utf8");
      // The maker's hand edit, after the agent last read the page.
      const edited = text.replace(/<h1([^>]*)>/, "<h1$1>Fleurs fraîches · ");
      expect(edited).not.toBe(text);
      writeFileSync(page, edited);
      utimesSync(page, new Date(), new Date(Date.now() + 2000));
      const before = await launched.window.getByTestId("agent-message").count();
      const from = ((await main(() => (globalThis as { piLog?: Logged[] }).piLog ?? [])) as Logged[]).length;
      await invoke("conversation:send", "Ajoute « Livraison le jour même » sous le titre principal.");
      await turnEnded(before, 240_000);
      const { items } = await invoke("conversation:get");
      expect(items.at(-1)).toMatchObject({ kind: "agent", status: "done" });
      const log = ((await main(() => (globalThis as { piLog?: Logged[] }).piLog ?? [])) as Logged[]).slice(from);
      say(
        `[pi] after a hand edit: ${log
          .filter((e) => e.kind === "tool-result")
          .map((e) => e.name)
          .join(", ")}`,
      );
      const after = readFileSync(page, "utf8");
      // The maker's words are kept, and the agent's are there.
      expect(after).toContain("Fleurs fraîches · ");
      expect(after).toMatch(/Livraison le jour même/);
    },
    260_000 * SLOW,
  );
});
