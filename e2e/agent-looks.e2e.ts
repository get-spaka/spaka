// The agent's look at pages (Q314–Q324) with a real agent: a bar's website
// whose header is too wide for a phone and whose phone menu does not open.
// The maker asks to check it on a phone; the agent should look on a phone,
// open the menu, find both problems, fix them and look again. Each look is
// timed. Opt-in, as the other checks with a real agent:
//
//   UPSTART_REAL_AGENT=1: Claude, in the packaged app (`pnpm package` first),
//     with .cache/agent-config signed in;
//   UPSTART_REAL_PI=1: Gemini 4 Hydrogen in Upstart's own harness, with
//     GEMINI_API_KEY set in the terminal or in the repository's .env (never printed).
//
// Writes e2e/.runs/agent-looks-<agent>.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { devKey as key } from "../apps/desktop/src/main/dev-keys.ts";
import { type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";

const configDir = join(import.meta.dirname, "../.cache/agent-config");
const MESSAGE = "Check the website on a phone and fix what is wrong";

const page = (title: string, body: string) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${title}</title>\n</head>\n<body class="bg-base-100 text-base-content">\n{% render 'header' %}\n${body}\n</body>\n</html>\n`;

// On a phone, the links should give way to the menu: they do not, and the menu's list never shows.
const HEADER = `<header class="navbar bg-base-200 px-4 gap-4">
  <a href="/" class="text-xl font-bold whitespace-nowrap">The Harbor Bar</a>
  <nav class="flex gap-8 whitespace-nowrap">
    <a href="/" class="link link-hover">Home</a>
    <a href="/menu" class="link link-hover">Food and drinks</a>
    <a href="/events" class="link link-hover">Live music</a>
    <a href="/visit" class="link link-hover">Opening hours</a>
    <a href="/visit" class="link link-hover">Find us</a>
  </nav>
  <details class="dropdown dropdown-end ml-auto md:hidden" id="menu">
    <summary class="btn btn-ghost">Menu</summary>
    <ul class="menu dropdown-content hidden bg-base-100 rounded-box w-56 p-2 shadow z-10">
      <li><a href="/menu">Food and drinks</a></li>
      <li><a href="/events">Live music</a></li>
      <li><a href="/visit">Opening hours and how to find us</a></li>
    </ul>
  </details>
</header>
`;

const FILES: Record<string, string> = {
  "theme.css": ":root { --theme-color-primary: #0e7490; --theme-color-primary-content: #ecfeff; }\n",
  "parts/header.liquid": HEADER,
  "pages/index.liquid": page(
    "The Harbor Bar",
    `<main>
  <section class="hero min-h-[70vh] bg-primary text-primary-content">
    <div class="hero-content text-center"><div>
      <h1 class="text-5xl font-bold">Drinks by the water</h1>
      <p class="mt-4 text-lg">A small bar on the old harbor of Saint-Malo, open from five until late.</p>
      <a href="/visit" class="btn mt-6">Find us</a>
    </div></div>
  </section>
  <section class="p-10 max-w-3xl mx-auto">
    <h2 class="text-3xl font-bold">Tonight</h2>
    <p class="mt-4">Local beers, cider from the valley and a short menu of plates to share. A band plays on Fridays.</p>
  </section>
</main>`,
  ),
  "pages/menu.liquid": page(
    "Food and drinks — The Harbor Bar",
    `<main class="p-10 max-w-3xl mx-auto"><h1 class="text-4xl font-bold">Food and drinks</h1><p class="mt-4">Oysters, fish soup, cheese from the market, and six beers on tap.</p></main>`,
  ),
  "pages/events.liquid": page(
    "Live music — The Harbor Bar",
    `<main class="p-10 max-w-3xl mx-auto"><h1 class="text-4xl font-bold">Live music</h1><p class="mt-4">A band every Friday from nine.</p></main>`,
  ),
  "pages/visit.liquid": page(
    "Visit — The Harbor Bar",
    `<main class="p-10 max-w-3xl mx-auto"><h1 class="text-4xl font-bold">Opening hours</h1><p class="mt-4">Every day from five until one. 4 quai Saint-Louis, Saint-Malo.</p></main>`,
  ),
};

type Look = { at: number; ms: number; route: string | null; screen?: string; steps: string[]; problems: string[] };
type Logged = { t: number; kind: string; name?: string; path?: string };

const CASES = [
  { agent: "claude", run: process.env.UPSTART_REAL_AGENT === "1" },
  { agent: "pi", run: process.env.UPSTART_REAL_PI === "1" },
];

for (const { agent, run } of CASES)
  describe.skipIf(!run)(`the ${agent} agent checks a website on a phone`, () => {
    let launched: LaunchedApp;
    let folder: string;
    const report: Record<string, unknown> = { agent };
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
      mkdirSync(runsDir, { recursive: true });
      launched =
        agent === "claude"
          ? await launchApp({
              packaged: true,
              env: {
                UPSTART_AGENT_REPLAY: "",
                UPSTART_AGENT_CONFIG_DIR: configDir,
                UPSTART_AGENT_RECORD: join(runsDir, "agent-looks-claude.jsonl"),
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
      const project = await invoke("projects:create", "The Harbor Bar");
      folder = project.path;
      for (const [file, text] of Object.entries(FILES)) {
        mkdirSync(join(folder, file, ".."), { recursive: true });
        writeFileSync(join(folder, file), text);
      }
      await until(
        () =>
          launched.app.evaluate(() =>
            // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
            (globalThis as any).upstart.preview.view.webContents.executeJavaScript(
              "document.querySelector('h1')?.textContent === 'Drinks by the water'",
            ),
          ),
        20_000,
      );
      // Each look timed, and what the agent does, with its time.
      await main(() => {
        const looks: Look[] = [];
        const log: Logged[] = [];
        Object.assign(globalThis, { agentLooks: looks, agentLog: log });
        const preview = (globalThis as { upstart?: { preview: Record<string, unknown> } }).upstart!.preview;
        const look = (preview.look as (...a: unknown[]) => Promise<Record<string, unknown>>).bind(preview);
        preview.look = async (
          route?: string,
          options: { steps?: { action: string; target?: string; key?: string }[] } = {},
        ) => {
          const at = Date.now();
          const seen = await look(route, options);
          looks.push({
            at,
            ms: Date.now() - at,
            route: seen.route as string | null,
            screen: seen.screen as string | undefined,
            steps: ((seen.steps as { line: string }[] | undefined) ?? []).map((s) => s.line),
            problems: (seen.problems as string[] | undefined) ?? [],
          });
          return seen;
        };
        // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
        const agents = (globalThis as any).upstart.agent;
        const before = agents.o.onAgentEvent;
        agents.o.onAgentEvent = (id: string, e: { kind: string; name?: string; input?: { file_path?: string } }) => {
          if (e.kind === "tool-input-end")
            log.push({ t: Date.now(), kind: e.kind, name: e.name, path: e.input?.file_path });
          before?.(id, e);
        };
      });
    }, 120_000 * SLOW);
    afterAll(async () => {
      writeFileSync(join(runsDir, `agent-looks-${agent}.json`), JSON.stringify(report, null, 2));
      await launched?.close();
    });

    test(
      "it looks on a phone, opens the menu, fixes the header and the menu, and looks again",
      async () => {
        const started = Date.now();
        // The website exists already: its model is set as the maker sets it, effort medium by default.
        if (agent === "pi") await invoke("agent:set-model", "gemini/gemini-4-hydrogen");
        await invoke("conversation:send", MESSAGE);
        const item = (await until(async () => {
          const { items } = await invoke("conversation:get");
          const last = items.at(-1);
          return last?.kind === "agent" && last.status !== "working" ? last : undefined;
        }, 900_000)) as { status: string; parts: { kind: string; text?: string; activity?: { label: string } }[] };
        report.turnMs = Date.now() - started;
        report.status = item.status;
        report.lines = item.parts.flatMap((p) => (p.activity ? [p.activity.label] : []));
        report.answer = item.parts
          .filter((p) => p.kind === "text")
          .map((p) => p.text)
          .join("\n");
        const looks = (await main(() => (globalThis as unknown as { agentLooks: Look[] }).agentLooks)) as Look[];
        const log = (await main(() => (globalThis as unknown as { agentLog: Logged[] }).agentLog)) as Logged[];
        report.looks = looks.map((l) => ({ ...l, at: l.at - started }));
        report.writes = log
          .filter((e) => /^(Write|Edit|Append)$/.test(e.name ?? ""))
          .map((e) => ({ at: e.t - started, name: e.name, path: e.path }));
        const lastWrite = Math.max(0, ...log.filter((e) => /^(Write|Edit|Append)$/.test(e.name ?? "")).map((e) => e.t));

        // The website as it is now, looked at on a phone from scratch.
        const after = (await main(async () => {
          // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
          const p = (globalThis as any).upstart.preview;
          p.endTurn();
          const plain = await p.look("/", { screen: "phone", fresh: true });
          const opened = await p.look("/", { screen: "phone", steps: [{ action: "click", target: "#menu summary" }] });
          const shown = await p.agentView.run(
            `(() => { const a = [...document.querySelectorAll('#menu a')].find((a) => a.getBoundingClientRect().height > 0); if (!a) return false; const r = a.getBoundingClientRect(); return r.right <= ${393} && r.bottom <= innerHeight && getComputedStyle(a).visibility !== 'hidden'; })()`,
          );
          return { problems: plain.problems as string[], menu: opened.steps?.[0]?.line as string, shown: !!shown };
        })) as { problems: string[]; menu: string; shown: boolean };
        report.after = after;

        const checks: Record<string, boolean> = {
          "the turn ended": item.status === "done",
          "looked on a phone": looks.some((l) => l.screen === "phone"),
          "clicked something before a look": looks.some((l) => l.steps.some((s) => s.startsWith("clicked"))),
          "saw the header too wide": looks.some((l) => l.problems.some((p) => p.startsWith("The page is wider"))),
          "changed a file": lastWrite > 0,
          "looked again after the last change": looks.some((l) => l.at > lastWrite),
          "the page fits a phone now": !after.problems.some((p) => p.startsWith("The page is wider")),
          "the menu opens on a phone now": after.shown,
          "a line named the click": (report.lines as string[]).some((l) => / after clicking “/.test(l)),
        };
        report.checks = checks;
        const times = looks.map((l) => l.ms);
        report.lookMs = { count: times.length, max: Math.max(0, ...times), each: times };
        process.stdout.write(
          `[looks ${agent}] turn ${Math.round((report.turnMs as number) / 1000)} s; ${looks.length} looks: ${looks
            .map(
              (l) =>
                `${l.screen} ${l.route}${l.steps.length ? ` +${l.steps.length} steps` : ""} ${(l.ms / 1000).toFixed(1)} s`,
            )
            .join("; ")}\n[looks ${agent}] ${JSON.stringify(checks)}\n`,
        );
        expect(checks).toEqual(Object.fromEntries(Object.keys(checks).map((k) => [k, true])));
      },
      1_000_000 * SLOW,
    );
  });
