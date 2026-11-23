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
// - ember: Ember adapted page by page (Q302-Q313) from a message that settles
//   how guests book: the card of pages before any file changes, the home
//   page's choices asked without booking, the home page alone done, then
//   Continue to the visit page and its call button; from a release built here
//   of the templates' repository and served on 127.0.0.1, since the published
//   one has no guides by page type yet.
//
// Upstart's own harness, with Gemini 4 Hydrogen and the AI Studio key
// set as GEMINI_API_KEY in the terminal or the repository's .env, in the development build
// (UPSTART_REAL_PI=1): a website, its card answered, then a plan built, then
// the same Ember case (UPSTART_QUESTIONS_CASE=ember runs it alone).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { devKey as key } from "../apps/desktop/src/main/dev-keys.ts";
import { agentConfigDir, type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";
import { maker, say, siteText, walk } from "./real-maker.ts";

const realClaude = process.env.UPSTART_REAL_AGENT === "1";
const realPi = process.env.UPSTART_REAL_PI === "1";
const only = process.env.UPSTART_QUESTIONS_CASE;
const configDir = agentConfigDir();

/** A real turn takes minutes; an adaptation, up to half an hour. */
const LONG = 40 * 60_000;

const CLAUDE_CASES = ["card", "plan", "ember"].filter((c) => !only || c === only);
const PI_CASES = ["card", "plan", "ember"].filter((c) => !only || c === only);

const EMBER = join(import.meta.dirname, "../apps/desktop/templates/ember");
const EMBER_MESSAGE =
  "A website for Bodega Triana, a tapas and sherry bar in Seville, open in the evenings, with flamenco nights on Thursdays. Guests book by phone only.";

/**
 * Ember once its first message is sent, adapted page by page (Q302-Q313):
 * the card of pages before any file changes, kept as the agent checked it;
 * the home page's choices, if any, asked before the home page changes and
 * never about booking, which the message settles; the home page alone done,
 * the pages after it still the template's; then Continue to the next page,
 * the visit page, which gets the call button. Each turn ends without a card.
 */
async function emberCase(m: ReturnType<typeof maker>, timeout: number) {
  await m.w().getByTestId("conversation").waitFor({ timeout: 300_000 });
  const project = await m.invoke<{ path: string; template?: { id: string; version: string } }>("projects:current");
  const read = (f: string) => (existsSync(join(project.path, f)) ? readFileSync(join(project.path, f), "utf8") : "");
  const same = (f: string) => read(f) === readFileSync(join(EMBER, f), "utf8");
  const pages: { routes: string[]; checked: Record<string, boolean>; lines: string[]; unchanged: boolean } = {
    routes: [],
    checked: {},
    lines: [],
    unchanged: false,
  };
  const home: { questions: string[]; asked: number; unchangedWhenAsked: boolean } = {
    questions: [],
    asked: 0,
    unchangedWhenAsked: true,
  };
  const home_ = await m.drive(
    {
      pages: async () => {
        pages.unchanged = same("pages/index.liquid") && same("parts/header.liquid") && same("parts/reserve.liquid");
        const choices = m.waitingPages().getByTestId("pages-choice");
        for (let i = 0; i < (await choices.count()); i++) {
          const route = (await choices.nth(i).getAttribute("data-route")) ?? "";
          pages.routes.push(route);
          pages.checked[route] = (await choices.nth(i).getAttribute("aria-pressed")) === "true";
          pages.lines.push((await choices.nth(i).textContent()) ?? "");
        }
        await m.waitingPages().getByTestId("pages-keep").click();
      },
      question: async () => {
        home.asked++;
        home.unchangedWhenAsked &&= same("pages/index.liquid") && same("parts/hero.liquid");
        const card = (await m.cards()).filter((c) => c.kind === "question").at(-1)?.card as
          | { questions: { question: string }[] }
          | undefined;
        home.questions.push(...(card?.questions ?? []).map((q) => q.question));
        await m.answerRecommended();
      },
    },
    timeout,
  );
  const state = () =>
    JSON.parse(read(".upstart/adaptation/state.json") || "{}") as { steps?: { route: string; status: string }[] };
  const statusOf = (route: string) => state().steps?.find((s) => s.route === route)?.status;
  const afterHome = {
    "from Ember 1.1.0": project.template?.version === "1.1.0",
    "the card of pages before any file changed": pages.unchanged,
    "every page type in it, the home page first": pages.routes[0] === "/" && pages.routes.length >= 7,
    "the events kept": pages.checked["/events"] === true,
    // In the message's language, English, not the business's country's.
    "the card in English":
      pages.lines.filter((l) => /\b(?:the|and|with|of)\b/i.test(l)).length >= pages.lines.length / 2,
    "no question on booking, which the message settled": !home.questions.some((q) => /book|reserv/i.test(q)),
    "at most one card of questions, before the home page changed": home.asked <= 1 && home.unchangedWhenAsked,
    "the home page about the bar": /triana/i.test(read("pages/index.liquid") + read("parts/hero.liquid")),
    "the home page to look at": statusOf("/") === "ready",
    "the menu page still the template's": statusOf("/menu") !== "todo" || same("parts/courses.liquid"),
    "the story page still the template's": statusOf("/story") !== "todo" || same("parts/chapters.liquid"),
  };
  const cardsBefore = (await m.cards()).length;
  const visit_ = await m.continueAdaptation(timeout);
  const markup = walk(project.path)
    .filter((f) => f.endsWith(".liquid"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const visitCards = (await m.cards()).length - cardsBefore;
  const afterVisit = {
    "the visit page next": statusOf("/visit") === "ready" && statusOf("/") === "done",
    "a call button on the visit page": /href="tel:/.test(read("parts/reserve.liquid") + read("pages/visit.liquid")),
    "no reservation form": !existsSync(join(project.path, "data/reservations")) && !/_data\/reservations/.test(markup),
    "no card in the visit page's turn": visitCards === 0,
    "the menu page still the template's": statusOf("/menu") !== "todo" || same("parts/courses.liquid"),
  };
  return { home: home_, visit: visit_, checks: { ...afterHome, ...afterVisit }, pages, questions: home.questions };
}

describe.skipIf(!realClaude || !CLAUDE_CASES.length)(
  "questions and plans with Claude, packaged",
  { timeout: LONG },
  () => {
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
    }, 120_000 * SLOW);
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
      "ember: the card of pages, the home page alone, then Continue to the visit page",
      async () => {
        await fresh();
        await m.w().locator('[data-testid="template-card"][data-template="ember"] button[aria-pressed]').click();
        await m.send(EMBER_MESSAGE);
        const { home, visit, checks, pages, questions } = await emberCase(m, 1_800_000);
        report.ember = { homeMs: home.ms, visitMs: visit.ms, checks, pages, questions, cards: await m.cards() };
        say(
          `[ember] home ${home.ms / 1000} s, visit ${visit.ms / 1000} s; pages ${JSON.stringify(pages.checked)}; questions ${JSON.stringify(questions)}: ${JSON.stringify(checks)}`,
        );
        expect(home.last.status).toBe("done");
        expect(visit.last.status).toBe("done");
        expect(checks).toEqual(Object.fromEntries(Object.keys(checks).map((k) => [k, true])));
      },
    );
  },
);

describe.skipIf(!realPi || !PI_CASES.length)(
  "questions and plans with Upstart's own harness, Gemini 4 Hydrogen",
  { timeout: LONG },
  () => {
    let launched: LaunchedApp;
    const m = maker(() => launched);
    const hydrogen = "gemini/gemini-4-hydrogen";
    const report: Record<string, unknown> = {};

    beforeAll(async () => {
      launched = await launchApp({ env: { UPSTART_AGENT_REPLAY: "" } });
      await launched.window.getByTestId("message-input").waitFor();
      const gemini = key("GEMINI_API_KEY");
      if (!gemini)
        throw new Error(
          "Set GEMINI_API_KEY in the terminal or in the repository's .env to run these checks with a real Gemini.",
        );
      // The key goes from the file to the main process, never printed.
      await launched.app.evaluate(
        // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
        (_electron, k) => (globalThis as any).upstart.piAccounts.setKey("gemini", k),
        gemini,
      );
    }, 60_000 * SLOW);
    afterAll(async () => {
      mkdirSync(runsDir, { recursive: true });
      writeFileSync(join(runsDir, "real-pi-questions.json"), JSON.stringify(report, null, 2));
      await launched?.close();
    });

    test.runIf(PI_CASES.includes("card"))(
      "a website, then its card answered with the recommended choices",
      async () => {
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
      },
    );

    test.runIf(PI_CASES.includes("plan") && PI_CASES.includes("card"))(
      "plan mode: a plan, nothing written meanwhile, Build, then the build",
      async () => {
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
      },
    );

    test.runIf(PI_CASES.includes("ember"))(
      "ember: the card of pages, the home page alone, then Continue to the visit page",
      async () => {
        if (!(await m.w().getByTestId("start").count())) {
          await m.invoke("projects:close");
          await m.w().getByTestId("start").waitFor();
        }
        await m.invoke("conversation:send", EMBER_MESSAGE, { model: hydrogen, effort: "medium", template: "ember" });
        const { home, visit, checks, pages, questions } = await emberCase(m, 1_800_000);
        report.ember = { homeMs: home.ms, visitMs: visit.ms, checks, pages, questions, cards: await m.cards() };
        say(
          `[pi ember] home ${home.ms / 1000} s, visit ${visit.ms / 1000} s; pages ${JSON.stringify(pages.checked)}; questions ${JSON.stringify(questions)}: ${JSON.stringify(checks)}`,
        );
        expect(home.last.status).toBe("done");
        expect(visit.last.status).toBe("done");
        expect(checks).toEqual(Object.fromEntries(Object.keys(checks).map((k) => [k, true])));
      },
    );
  },
);
