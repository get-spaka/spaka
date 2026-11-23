// The web-design skill (Q418-Q421, Q430) with a real agent: six briefs of
// opposite characters, from a notary's calm to a tattoo studio's edge, each
// built from one message in a new website, then looked at as a visitor would.
// Run once before a change to the design rules and once after, with a label
// for each, to set the pictures side by side and count how much the websites
// differ (Q439): which hero each opens with, its fonts, its colors. Opt-in,
// as the other checks with a real agent:
//
//   UPSTART_REAL_AGENT=1: Claude, in the packaged app (`pnpm package` first),
//     with .cache/agent-config signed in;
//   UPSTART_REAL_PI=1: Gemini 4 Hydrogen in Upstart's own harness, with
//     GEMINI_API_KEY set in the terminal or in the repository's .env (never printed).
//   UPSTART_DESIGN_LABEL=before|after (after by default).
//   UPSTART_DESIGN_BRIEFS=tattoo,bar: only these briefs.
//
// Writes e2e/.runs/agent-design/<label>-<agent>-<brief>-<picture>.png,
// <label>-<agent>.json (each turn's time, its lines, its block searches and
// placements, the theme and the files) and <label>-<agent>.md, the variety
// table; `node e2e/agent-design-sheet.ts` sets the first screens side by side.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { devKey as key } from "../apps/desktop/src/main/dev-keys.ts";
import { type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";
import { type DesignSite, themeTraits, varietyTable } from "./design-variety.ts";
import { maker, walk } from "./real-maker.ts";

const configDir = join(import.meta.dirname, "../.cache/agent-config");
const shots = join(runsDir, "agent-design");
const label = process.env.UPSTART_DESIGN_LABEL || "after";

const ALL_BRIEFS = [
  {
    id: "patisserie",
    name: "Maison Odile",
    message:
      "A website for Maison Odile, a pâtisserie in Bordeaux: cakes and tarts to order, the pastries of the season, and the shop's hours.",
  },
  {
    id: "tattoo",
    name: "Encre Sauvage",
    message:
      "A website for Encre Sauvage, a tattoo studio in Lille with three artists: their styles and work, the flash days, how to book, and the aftercare.",
  },
  {
    id: "bar",
    name: "Minuit Quinze",
    message:
      "A website for Minuit Quinze, a cocktail bar in Marseille open from 7 pm to 2 am: the cocktails, the DJ nights on Fridays and Saturdays, and how to book a table.",
  },
  {
    id: "notary",
    name: "Claire Duval",
    message:
      "A website for Claire Duval's notary office in Rennes: what the office handles (buying a home, wills and inheritance, marriage contracts), the fees, and how to make an appointment.",
  },
  {
    id: "climbing",
    name: "Grimpette",
    message:
      "A website for Grimpette, an indoor climbing gym for children aged 4 to 12 in Lyon: the sessions and school-holiday courses, birthday parties, prices and opening hours.",
  },
  {
    id: "wedding",
    name: "Léa & Thomas",
    message:
      "A website for Léa and Thomas's wedding on 12 June 2027 in a farmhouse near Annecy: the day's programme, how to get there, where to stay, and a form to reply.",
  },
];
const chosen = process.env.UPSTART_DESIGN_BRIEFS?.split(",").map((s) => s.trim());
const BRIEFS = chosen ? ALL_BRIEFS.filter((b) => chosen.includes(b.id)) : ALL_BRIEFS;

/** A call the agent made to the gallery's tools, as it streamed it. */
type GalleryCall = { name: string; input: Record<string, unknown> };

/** The pictures taken of each home page: its first screen and two more on desktop, its first on a phone. */
const PICTURES = [
  { id: "desktop-1", screen: "desktop", steps: [] },
  { id: "desktop-2", screen: "desktop", steps: [{ action: "scroll", target: "down" }] },
  {
    id: "desktop-3",
    screen: "desktop",
    steps: [
      { action: "scroll", target: "down" },
      { action: "scroll", target: "down" },
    ],
  },
  { id: "phone-1", screen: "phone", steps: [] },
];

const CASES = [
  { agent: "claude", run: process.env.UPSTART_REAL_AGENT === "1" },
  { agent: "pi", run: process.env.UPSTART_REAL_PI === "1" },
];

for (const { agent, run } of CASES)
  describe.skipIf(!run)(`the ${agent} agent designs ${BRIEFS.length} websites (${label})`, () => {
    let launched: LaunchedApp;
    const m = maker(() => launched);
    const report: Record<string, unknown> = { agent, label };
    const sites: DesignSite[] = [];
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
        await new Promise((r) => setTimeout(r, 500));
      }
    };

    beforeAll(async () => {
      mkdirSync(shots, { recursive: true });
      launched =
        agent === "claude"
          ? await launchApp({
              packaged: true,
              env: {
                UPSTART_AGENT_REPLAY: "",
                UPSTART_AGENT_CONFIG_DIR: configDir,
                UPSTART_AGENT_RECORD: join(runsDir, `agent-design-${label}-claude.jsonl`),
              },
            })
          : await launchApp({ env: { UPSTART_AGENT_REPLAY: "" } });
      await launched.window.getByTestId("message-input").waitFor({ timeout: 60_000 });
      if (agent === "claude") await until(async () => (await invoke("agent:status")).auth === "signed-in", 30_000);
      else {
        const gemini = key("GEMINI_API_KEY");
        if (!gemini)
          throw new Error(
            "Set GEMINI_API_KEY in the terminal or in the repository's .env to run these checks with a real Gemini.",
          );
        await main((u, k) => u.piAccounts.setKey("gemini", k), gemini);
      }
      // The agent's searches of the gallery and the blocks it placed, with what it asked.
      await main((u) => {
        const calls: GalleryCall[] = [];
        (globalThis as { galleryCalls?: GalleryCall[] }).galleryCalls = calls;
        const before = u.agent.o.onAgentEvent;
        u.agent.o.onAgentEvent = (id: string, e: { kind: string; name?: string; input?: Record<string, unknown> }) => {
          if (e.kind === "tool-input-end" && e.name && /find_blocks|use_block/.test(e.name) && e.input)
            calls.push({ name: e.name.replace(/^mcp__upstart__/, ""), input: e.input });
          before?.(id, e);
        };
      });
    }, 120_000 * SLOW);
    afterAll(async () => {
      writeFileSync(join(shots, `${label}-${agent}.json`), JSON.stringify(report, null, 2));
      const table = varietyTable(`${agent}, ${label}`, sites);
      writeFileSync(join(shots, `${label}-${agent}.md`), table);
      process.stdout.write(`${table}\n`);
      await launched?.close();
    });

    for (const brief of BRIEFS)
      test(
        `${brief.name}: built from one message, then photographed`,
        async () => {
          const project = await invoke("projects:create", brief.name);
          await main(() => (globalThis as { galleryCalls?: GalleryCall[] }).galleryCalls?.splice(0));
          if (agent === "pi") await invoke("agent:set-model", "gemini/gemini-4-hydrogen");
          const started = Date.now();
          await invoke("conversation:send", brief.message);
          // A card of questions the agent asks on what it guessed is answered with its recommended choices.
          const questions: string[] = [];
          const { last } = await m.drive(
            {
              question: async () => {
                const card = (await m.cards()).filter((c) => c.kind === "question").at(-1)?.card as
                  | { questions: { question: string }[] }
                  | undefined;
                questions.push(...(card?.questions ?? []).map((q) => q.question));
                await m.answerRecommended();
              },
            },
            1_800_000 * SLOW,
          );
          const { items } = await invoke("conversation:get");
          const turns = (items as { kind: string; parts?: { activity?: { label: string } }[] }[]).filter(
            (i) => i.kind === "agent",
          );
          const item = last as { status: string };
          const lines = turns.flatMap((t) => (t.parts ?? []).flatMap((p) => (p.activity ? [p.activity.label] : [])));
          const files = walk(project.path).map((f) => relative(project.path, f));
          const pictures = (await main(async (u, pictures) => {
            u.preview.endTurn();
            const out: Record<string, string> = {};
            for (const p of pictures as typeof PICTURES) {
              const seen = await u.preview.look("/", { screen: p.screen, steps: p.steps, fresh: true });
              if (seen.png) out[p.id] = Buffer.from(seen.png).toString("base64");
            }
            return out;
          }, PICTURES)) as Record<string, string>;
          for (const [id, png] of Object.entries(pictures))
            writeFileSync(join(shots, `${label}-${agent}-${brief.id}-${id}.png`), Buffer.from(png, "base64"));
          const calls = (await main(
            () => (globalThis as { galleryCalls?: GalleryCall[] }).galleryCalls ?? [],
          )) as GalleryCall[];
          const theme = existsSync(join(project.path, "theme.css"))
            ? readFileSync(join(project.path, "theme.css"), "utf8")
            : "";
          const placed = calls
            .filter((c) => c.name === "use_block")
            .flatMap((c) =>
              ((c.input.blocks as { block: string }[] | undefined) ?? []).map((b) => ({
                page: String(c.input.page ?? ""),
                block: b.block,
              })),
            );
          const heroQueries = calls
            .filter((c) => c.name === "find_blocks")
            .flatMap((c) => (c.input.sections as { kind?: string; query?: string }[] | undefined) ?? [])
            .filter((s) => s.kind === "hero" || /hero/i.test(s.query ?? ""))
            .map((s) => s.query ?? "");
          // The first screen of the home page: its first block after the header, or what the agent wrote itself.
          const hero =
            placed.find((p) => p.page === "pages/index.liquid" && !/^(header|banner)-/.test(p.block))?.block ??
            "(written)";
          sites.push({
            brief: brief.id,
            hero,
            heroQueries,
            seconds: Math.round((Date.now() - started) / 1000),
            ...themeTraits(theme),
          });
          report[brief.id] = {
            placed,
            heroQueries,
            status: item.status,
            turnS: Math.round((Date.now() - started) / 1000),
            readWebDesign: lines.some((l) => /web-design/i.test(l)),
            questions,
            lines,
            theme,
            files,
          };
          process.stdout.write(
            `[design ${label} ${agent}] ${brief.id}: ${item.status} in ${Math.round((Date.now() - started) / 1000)} s, ${files.length} files, ${Object.keys(pictures).length} pictures\n`,
          );
          expect(item.status).toBe("done");
          expect(Object.keys(pictures)).toHaveLength(PICTURES.length);
        },
        1_900_000 * SLOW,
      );
  });
