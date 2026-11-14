// The agent's questions and plan mode with the real agents (agent questions,
// slice 7: Q283-Q296). Opt-in: they spend the maker's subscription or keys.
//
// Claude, in the packaged app, with .cache/agent-config signed in
// (UPSTART_REAL_AGENT=1; UPSTART_QUESTIONS_CASE runs one case):
// - card: a website from a short message, then the card on what the agent
//   guessed that matters (Q288), answered in the maker's own words with a
//   fact the site must then show;
// - plan: a larger website in plan mode (Q286, Q290): its questions answered
//   with the recommended choices, nothing written before the plan, a change
//   asked, the new plan built with Build, the website back on Build;
// - ember: Ember with its questions answered on the start screen (Q287), from
//   a release built here of the templates' repository and served on
//   127.0.0.1, since the published one does not have them yet.
//
// Upstart's own harness, with Gemini 4 Hydrogen and the AI Studio key of
// spikes/harnesses/homes/keys.env, in the development build
// (UPSTART_REAL_PI=1): a website, its card answered, then a plan built.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";

const realClaude = process.env.UPSTART_REAL_AGENT === "1";
const realPi = process.env.UPSTART_REAL_PI === "1";
const only = process.env.UPSTART_QUESTIONS_CASE;
const configDir = join(import.meta.dirname, "../.cache/agent-config");
const keysFile = join(import.meta.dirname, "../spikes/harnesses/homes/keys.env");

/** Shown even when the checks pass. */
const say = (line: string) => process.stdout.write(`${line}\n`);

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.name.startsWith(".") ? [] : e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      )
    : [];

function key(name: string): string | undefined {
  if (!existsSync(keysFile)) return undefined;
  for (const line of readFileSync(keysFile, "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m?.[1] === name) return m[2]!.replace(/^["']|["']$/g, "") || undefined;
  }
  return undefined;
}

type Card = { kind: "question" | "plan"; card: Record<string, unknown> };

/** What drives a launched app's conversation like a maker, and reads it back. */
function maker(get: () => LaunchedApp) {
  const w = () => get().window;
  const invoke = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
    w().evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...(args as unknown[])),
      [channel, args] as const,
    ) as Promise<T>;
  const send = async (text: string) => {
    await w().getByTestId("message-input").fill(text);
    await w().getByTestId("message-input").press("Enter");
  };
  const waitingQuestion = () => w().locator('[data-testid="question-card"][data-state="waiting"]');
  const proposedPlan = () => w().locator('[data-testid="plan-card"][data-state="proposed"]');
  /** The cards of the conversation, as the main process keeps them. */
  const cards = async (): Promise<Card[]> => {
    const { items } = await invoke<{ items: { kind: string; parts?: { kind: string; card?: object }[] }[] }>(
      "conversation:get",
    );
    return items
      .filter((i) => i.kind === "agent")
      .flatMap((i) => i.parts ?? [])
      .filter((p) => p.kind === "question" || p.kind === "plan")
      .map((p) => ({ kind: p.kind as Card["kind"], card: p.card as Record<string, unknown> }));
  };
  /** Clicks each question's recommended choice, then Answer when there is one. */
  const answerRecommended = async () => {
    const card = waitingQuestion();
    const sets = card.locator("fieldset");
    const answer = card.getByTestId("question-answer");
    if (!(await answer.count())) return card.getByTestId("question-choice").first().click();
    for (let i = 0; i < (await sets.count()); i++) await sets.nth(i).getByTestId("question-choice").first().click();
    await answer.click();
  };
  /**
   * Waits for the agent's turn to end, handing each question and plan it waits
   * on to `on`, which answers it; a turn longer than `timeout` fails.
   */
  const drive = async (
    on: { question?: () => Promise<void>; plan?: (index: number) => Promise<void> },
    timeout = 1_800_000,
  ) => {
    const started = Date.now();
    let plans = 0;
    let questions = 0;
    for (;;) {
      const { items } = await invoke<{ items: { kind: string; status?: string }[] }>("conversation:get");
      const last = items.at(-1);
      if (last?.kind === "agent" && last.status !== "working") return { ms: Date.now() - started, last };
      if (await waitingQuestion().count()) {
        questions++;
        await (on.question ?? answerRecommended)();
        await waitingQuestion().waitFor({ state: "detached", timeout: 30_000 });
      } else if (await proposedPlan().count()) {
        await get().capture(`real-plan-${plans}`);
        if (!on.plan) throw new Error("a plan the check did not expect");
        await on.plan(plans++);
        await proposedPlan().waitFor({ state: "detached", timeout: 30_000 });
      }
      if (Date.now() - started > timeout) throw new Error(`the agent did not finish in ${timeout / 60_000} minutes`);
      if (questions > 6) throw new Error("more than six cards in one turn");
      await new Promise((r) => setTimeout(r, 1000));
    }
  };
  return { w, invoke, send, waitingQuestion, proposedPlan, cards, answerRecommended, drive };
}

/** The site's own files: its pages, parts, records and theme. */
function siteText(path: string): string {
  return walk(path)
    .filter((f) => /\.(liquid|md|css|yaml)$/.test(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
}

const CLAUDE_CASES = ["card", "plan", "ember"].filter((c) => !only || c === only);

describe.skipIf(!realClaude || !CLAUDE_CASES.length)("questions and plans with Claude, packaged", () => {
  let launched: LaunchedApp;
  let server: Server | undefined;
  const m = maker(() => launched);
  const dataDir = join(import.meta.dirname, "../.cache/agent-questions-data");
  const record = join(runsDir, "real-agent-questions.jsonl");
  const report: Record<string, unknown> = {};
  /** A new website: the start screen again. */
  const fresh = async () => {
    if (await m.w().getByTestId("start").count()) return;
    await m.invoke("projects:close");
    await m.w().getByTestId("start").waitFor();
  };

  beforeAll(async () => {
    mkdirSync(runsDir, { recursive: true });
    rmSync(record, { force: true });
    rmSync(dataDir, { recursive: true, force: true });
    // A release of the templates' repository as it is here, served as GitHub serves the published ones.
    const out = mkdtempSync(join(tmpdir(), "upstart-release-"));
    const built = spawnSync("node", ["apps/desktop/scripts/template.mjs", "release", out, "v5-local"], {
      cwd: join(import.meta.dirname, ".."),
      stdio: ["ignore", "pipe", "inherit"],
    });
    expect(built.status).toBe(0);
    server = createServer((req, res) => {
      const file = /^\/releases\/(?:latest\/download|download\/v5-local)\/([\w.-]+)$/.exec(req.url ?? "")?.[1];
      if (!file || !existsSync(join(out, file))) return void res.writeHead(404).end();
      res.writeHead(200).end(readFileSync(join(out, file)));
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    launched = await launchApp({
      packaged: true,
      env: {
        UPSTART_AGENT_REPLAY: "",
        UPSTART_AGENT_CONFIG_DIR: configDir,
        UPSTART_AGENT_RECORD: record,
        UPSTART_DATA_DIR: dataDir,
        UPSTART_TEMPLATES_URL: `http://127.0.0.1:${port}/releases`,
        UPSTART_TEMPLATES_SNAPSHOT: mkdtempSync(join(tmpdir(), "upstart-snapshot-")),
      },
    });
    await launched.window.getByTestId("start").waitFor();
  }, 120_000);
  afterAll(async () => {
    writeFileSync(join(runsDir, "real-agent-questions.json"), JSON.stringify(report, null, 2));
    await launched?.close();
    server?.close();
  });

  test.runIf(CLAUDE_CASES.includes("card"))(
    "card: a short message builds at once, then one card on what was guessed; the answer lands in the site",
    async () => {
      await fresh();
      await m.send("A website for Le Pétrin, a bakery in Lyon.");
      let asked = false;
      const turn = await m.drive({
        question: async () => {
          asked = true;
          await launched.capture("real-card-asked");
          // The maker's own words, with facts the site must then show.
          await m.send(
            "Our real hours: Tuesday to Sunday, 6:30 to 19:45, closed on Mondays. Our address is 12 rue Mercière.",
          );
        },
      });
      const project = await m.invoke<{ path: string }>("projects:current");
      const text = siteText(project.path);
      const cards = await m.cards();
      report.card = { turnMs: turn.ms, status: turn.last.status, cards, pages: walk(join(project.path, "pages")) };
      say(`[card] ${turn.ms / 1000} s, ${cards.length} card(s): ${JSON.stringify(cards.map((c) => c.card))}`);
      expect(turn.last.status).toBe("done");
      expect(asked).toBe(true);
      expect(cards.filter((c) => c.kind === "question")).toHaveLength(1);
      // The card came once the site was built: the home page was there before it.
      expect(existsSync(join(project.path, "pages/index.liquid"))).toBe(true);
      expect(text).toMatch(/19[:.h]45|7:45/);
      expect(text).toMatch(/Merci[eè]re/);
    },
  );

  test.runIf(CLAUDE_CASES.includes("plan"))(
    "plan: questions, a plan before anything is written, a change, Build, then the build",
    async () => {
      await fresh();
      await m.w().getByTestId("mode-select").selectOption("plan");
      await m.send(
        "A website for Atelier Nord, a furniture workshop in Lille: our pieces, custom orders, visits to the workshop on Saturdays, and a journal.",
      );
      let path = "";
      const writtenBeforePlan: string[] = [];
      const turn = await m.drive({
        plan: async (index) => {
          path ||= (await m.invoke<{ path: string }>("projects:current")).path;
          if (index === 0) {
            writtenBeforePlan.push(...walk(path).map((f) => relative(path, f)));
            await m.send("Add a page of questions and answers about custom orders.");
          } else await m.w().getByTestId("plan-build").click();
        },
      });
      const project = await m.invoke<{ path: string; mode?: string }>("projects:current");
      const cards = await m.cards();
      const plans = cards.filter((c) => c.kind === "plan");
      const pages = walk(join(project.path, "pages")).map((f) => relative(project.path, f));
      report.plan = { turnMs: turn.ms, status: turn.last.status, cards, writtenBeforePlan, pages };
      say(`[plan] ${turn.ms / 1000} s, ${plans.length} plan(s), pages ${pages.join(", ")}`);
      say(`[plan] the last plan: ${String(plans.at(-1)?.card.text).slice(0, 600)}`);
      expect(turn.last.status).toBe("done");
      expect(writtenBeforePlan).toEqual([]);
      expect(plans.map((p) => p.card.state)).toEqual(["replaced", "approved"]);
      expect(String(plans[1]?.card.text)).toMatch(/question|FAQ/i);
      expect(project.mode ?? "build").toBe("build");
      expect(pages.length).toBeGreaterThanOrEqual(3);
      expect(siteText(project.path)).toMatch(/custom order/i);
    },
  );

  test.runIf(CLAUDE_CASES.includes("ember"))(
    "ember: its questions answered on the start screen are followed",
    async () => {
      await fresh();
      const w = m.w();
      await w.locator('[data-testid="template-card"][data-template="ember"] button[aria-pressed]').click();
      const rows = w.getByTestId("template-question");
      await rows.first().waitFor();
      expect(await rows.count()).toBe(2);
      await rows.nth(0).getByRole("button", { name: "By phone" }).click();
      await rows.nth(1).getByRole("button", { name: "Events only" }).click();
      await launched.capture("real-ember-questions");
      await m.send(
        "A website for Bodega Triana, a tapas and sherry bar in Seville, open in the evenings, with flamenco nights on Thursdays.",
      );
      await w.getByTestId("conversation").waitFor({ timeout: 300_000 });
      const turn = await m.drive({});
      const project = await m.invoke<{ path: string; template?: { id: string; version: string } }>("projects:current");
      const read = (f: string) =>
        existsSync(join(project.path, f)) ? readFileSync(join(project.path, f), "utf8") : "";
      const markup = walk(project.path)
        .filter((f) => f.endsWith(".liquid"))
        .map((f) => readFileSync(f, "utf8"))
        .join("\n");
      const checks = {
        "from Ember 1.1.0": project.template?.version === "1.1.0",
        "no reservation form":
          !existsSync(join(project.path, "data/reservations")) && !/_data\/reservations/.test(markup),
        "a call button": /href="tel:/.test(markup),
        "no private dining page": !existsSync(join(project.path, "pages/private-dining.liquid")),
        "events kept": existsSync(join(project.path, "data/events")),
        "about the bar": /triana/i.test(read("pages/index.liquid") + read("parts/header.liquid")),
      };
      report.ember = { turnMs: turn.ms, status: turn.last.status, checks, cards: await m.cards() };
      say(`[ember] ${turn.ms / 1000} s: ${JSON.stringify(checks)}`);
      expect(turn.last.status).toBe("done");
      expect(checks).toEqual(Object.fromEntries(Object.keys(checks).map((k) => [k, true])));
    },
  );
});

describe.skipIf(!realPi)("questions and plans with Upstart's own harness, Gemini 4 Hydrogen", () => {
  let launched: LaunchedApp;
  const m = maker(() => launched);
  const hydrogen = "gemini/gemini-4-hydrogen";
  const report: Record<string, unknown> = {};

  beforeAll(async () => {
    launched = await launchApp({ env: { UPSTART_AGENT_REPLAY: "" } });
    await launched.window.getByTestId("message-input").waitFor();
    const gemini = key("GEMINI_API_KEY");
    if (!gemini) throw new Error(`No GEMINI_API_KEY in ${keysFile}`);
    // The key goes from the file to the main process, never printed.
    await launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, k) => (globalThis as any).upstart.piAccounts.setKey("gemini", k),
      gemini,
    );
  }, 60_000);
  afterAll(async () => {
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, "real-pi-questions.json"), JSON.stringify(report, null, 2));
    await launched?.close();
  });

  test("a website, then its card answered with the recommended choices", async () => {
    await m.invoke("conversation:send", "A one-page website for a florist in Nantes, Fleur de Loire.", {
      model: hydrogen,
      effort: "medium",
    });
    await m.w().getByTestId("conversation").waitFor();
    let asked = 0;
    const turn = await m.drive(
      {
        question: async () => {
          asked++;
          await launched.capture("real-pi-card");
          await m.answerRecommended();
        },
      },
      600_000,
    );
    const cards = await m.cards();
    report.card = { turnMs: turn.ms, status: turn.last.status, cards };
    say(`[pi card] ${turn.ms / 1000} s, ${asked} card(s): ${JSON.stringify(cards.map((c) => c.card))}`);
    // What the agent said last: a question asked in words rather than with the card shows here.
    const { items } = await m.invoke<{ items: { kind: string; parts?: { kind: string; text?: string }[] }[] }>(
      "conversation:get",
    );
    const words = (items.at(-1)?.parts ?? []).filter((p) => p.kind === "text").map((p) => p.text);
    say(`[pi card] its last words: ${words.join(" / ").slice(-800)}`);
    expect(turn.last.status).toBe("done");
    expect(asked).toBe(1);
  });

  test("plan mode: a plan, nothing written meanwhile, Build, then the build", async () => {
    const project = await m.invoke<{ path: string }>("projects:current");
    await m.invoke("agent:set-mode", "plan");
    const before = siteText(project.path);
    let unchanged = true;
    await m.send("Add a page for weddings: the arrangements, how we work with couples, and a request form.");
    const turn = await m.drive(
      {
        plan: async () => {
          unchanged = siteText(project.path) === before;
          await m.w().getByTestId("plan-build").click();
        },
      },
      600_000,
    );
    const plans = (await m.cards()).filter((c) => c.kind === "plan");
    const pages = walk(join(project.path, "pages")).map((f) => relative(project.path, f));
    report.plan = { turnMs: turn.ms, status: turn.last.status, plans, unchanged, pages };
    say(
      `[pi plan] ${turn.ms / 1000} s, pages ${pages.join(", ")}; plan: ${String(plans.at(-1)?.card.text).slice(0, 400)}`,
    );
    expect(turn.last.status).toBe("done");
    expect(unchanged).toBe(true);
    expect(plans.map((p) => p.card.state)).toEqual(["approved"]);
    expect(pages.some((p) => /wedding/i.test(p))).toBe(true);
    expect((await m.invoke<{ mode?: string }>("projects:current")).mode ?? "build").toBe("build");
  });
});
