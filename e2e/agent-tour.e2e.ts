// The tour with the real agent, in the packaged app (tour and polish slice 7,
// Q328-Q340), each case on a new maker's profile, the statistics written to a
// log (UPSTART_STATS_LOG) rather than sent. Opt-in, since it spends the maker's
// subscription: UPSTART_REAL_AGENT=1, with .cache/agent-config signed in to
// Claude; UPSTART_TOUR_CASE runs one case.
// - scratch: a website built from a message; the tour opens at the end of that
//   turn, and Next goes through its five steps to Done;
// - ember: Ember from the published templates, kept to its home and visit
//   pages; nothing opens during the adaptation, the tour opens once the visit
//   page is done, and Skip ends it.
// The statistics hold the expected events, and nothing else.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";
import { maker, say } from "./real-maker.ts";

const real = process.env.UPSTART_REAL_AGENT === "1";
const only = process.env.UPSTART_TOUR_CASE;
const configDir = join(import.meta.dirname, "../.cache/agent-config");
/** A real turn takes minutes; an adaptation of two pages, up to half an hour. */
const LONG = 40 * 60_000;

type Logged = { eventName: string; props: Record<string, string> };

describe.skipIf(!real)("the tour with the real agent, packaged", { timeout: LONG }, () => {
  let launched: LaunchedApp | undefined;
  const m = maker(() => launched!);
  const report: Record<string, unknown> = {};

  /** A new maker's profile: no website yet, so the tour has not been seen. */
  const start = async (name: string) => {
    mkdirSync(runsDir, { recursive: true });
    const log = join(runsDir, `real-tour-${name}-stats.jsonl`);
    writeFileSync(log, "");
    launched = await launchApp({
      packaged: true,
      tour: true,
      env: {
        UPSTART_AGENT_REPLAY: "",
        UPSTART_AGENT_CONFIG_DIR: configDir,
        UPSTART_AGENT_RECORD: join(runsDir, `real-tour-${name}.jsonl`),
        UPSTART_STATS_LOG: log,
      },
    });
    await launched.window.getByTestId("start").waitFor({ timeout: 60_000 });
    return log;
  };
  const events = (log: string): Logged[] =>
    readFileSync(log, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Logged);
  const tour = () => m.w().getByTestId("tour");
  const step = () => tour().getAttribute("data-step");
  const settings = () => JSON.parse(readFileSync(join(launched!.dataDir, "settings.json"), "utf8"));
  /** Clicks the Next of the tour's bubble drawn in the page (ADR 0008). */
  const pageNext = () =>
    launched!.app.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the main process's objects, set for checks
      (globalThis as any).upstart.preview.view.webContents.executeJavaScript(
        `(() => { const b = document.querySelector("upstart-editor")?.shadowRoot?.querySelector('[data-testid="page-tour-next"]'); if (!b || getComputedStyle(b).display === "none") return false; b.click(); return true; })()`,
      ),
    );
  const until = async (read: () => Promise<unknown>, timeout = 15_000) => {
    timeout *= SLOW;
    for (const started = Date.now(); !(await read()); ) {
      if (Date.now() - started > timeout) throw new Error("timed out");
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  afterEach(async (context) => {
    writeFileSync(join(runsDir, "real-tour.json"), JSON.stringify(report, null, 2));
    // What the app printed and showed, to see where a failed case stopped.
    if (launched && context.task.result?.state === "fail") {
      writeFileSync(join(runsDir, `real-tour-${context.task.name.split(":")[0]}.log`), launched.logs.join(""));
      await launched.capture(`real-tour-${context.task.name.split(":")[0]}-failed`).catch(() => {});
    }
    await launched?.close();
    launched = undefined;
  });

  test.runIf(!only || only === "scratch")(
    "scratch: the tour opens at the end of the first turn and goes to Done",
    async () => {
      const log = await start("scratch");
      await m.send("A website for Le Pétrin, a bakery in Lyon.");
      const turn = await m.drive({}, 1_800_000);
      expect(turn.last.status).toBe("done");
      await tour().waitFor({ timeout: 30_000 });
      const steps = [await step()];
      await launched!.capture("real-tour-scratch-opened");
      await m.w().getByTestId("tour-next").click();
      steps.push(await step());
      await until(pageNext);
      await until(async () => (await step()) === "blocks");
      steps.push(await step());
      await m.w().getByTestId("tour-next").click();
      steps.push(await step());
      await m.w().getByTestId("tour-next").click();
      steps.push(await step());
      await launched!.capture("real-tour-scratch-publish");
      await until(pageNext);
      await tour().waitFor({ state: "detached" });
      await until(async () => settings().tourSeen === true);
      const logged = events(log);
      report.scratch = { turnMs: turn.ms, steps, events: logged };
      say(`[scratch] ${turn.ms / 1000} s; steps ${steps.join(", ")}; events ${JSON.stringify(logged)}`);
      expect(steps).toEqual(["conversation", "page", "blocks", "theme", "publish"]);
      const names = logged.map((e) => e.eventName);
      expect(names[0]).toBe("launch");
      expect(logged.find((e) => e.eventName === "site_created")?.props).toEqual({ template: "none" });
      expect(logged.filter((e) => e.eventName === "message_sent").every((e) => e.props.provider === "claude")).toBe(
        true,
      );
      expect(names.filter((n) => n === "tour_finished")).toHaveLength(1);
      expect(new Set(names)).toEqual(new Set(["launch", "site_created", "message_sent", "tour_finished"]));
    },
  );

  test.runIf(!only || only === "ember")(
    "ember: nothing during the adaptation; the tour once the last page is done, Skip ends it",
    async () => {
      const log = await start("ember");
      await m.w().locator('[data-testid="template-card"][data-template="ember"] button[aria-pressed]').click();
      await m.send(
        "A website for Bodega Triana, a tapas and sherry bar in Seville, open in the evenings. Guests book by phone only.",
      );
      await m.w().getByTestId("conversation").waitFor({ timeout: 300_000 });
      const kept: string[] = [];
      const home = await m.drive(
        {
          // Only the home and visit pages: the others taken off.
          pages: async () => {
            const choices = m.waitingPages().getByTestId("pages-choice");
            for (let i = 0; i < (await choices.count()); i++) {
              const choice = choices.nth(i);
              const route = (await choice.getAttribute("data-route")) ?? "";
              const on = (await choice.getAttribute("aria-pressed")) === "true";
              const keep = route === "/" || route === "/visit";
              if (on !== keep && !(await choice.isDisabled())) await choice.click();
              if (keep) kept.push(route);
            }
            await m.waitingPages().getByTestId("pages-keep").click();
          },
        },
        1_800_000,
      );
      expect(home.last.status).toBe("done");
      // Between two pages: no tour.
      await new Promise((r) => setTimeout(r, 3000));
      const duringAdaptation = await tour().count();
      await launched!.capture("real-tour-ember-between");
      const visit = await m.continueAdaptation(1_800_000);
      expect(visit.last.status).toBe("done");
      await until(async () => (await m.w().getByTestId("adaptation-bar").count()) === 0, 30_000);
      await tour().waitFor({ timeout: 30_000 });
      const opened = await step();
      await launched!.capture("real-tour-ember-opened");
      await m.w().getByTestId("tour-skip").click();
      await tour().waitFor({ state: "detached" });
      await until(async () => settings().tourSeen === true);
      const project = await m.invoke<{ path: string }>("projects:current");
      const logged = events(log);
      report.ember = { homeMs: home.ms, visitMs: visit.ms, kept, duringAdaptation, opened, events: logged };
      say(
        `[ember] home ${home.ms / 1000} s, visit ${visit.ms / 1000} s; kept ${kept.join(", ")}; tour between pages: ${duringAdaptation}; events ${JSON.stringify(logged)}`,
      );
      expect(kept).toEqual(["/", "/visit"]);
      expect(duringAdaptation).toBe(0);
      expect(opened).toBe("conversation");
      expect(existsSync(join(project.path, ".upstart/adaptation"))).toBe(false);
      const names = logged.map((e) => e.eventName);
      expect(names[0]).toBe("launch");
      expect(logged.find((e) => e.eventName === "site_created")?.props).toEqual({ template: "ember" });
      expect(names.filter((n) => n === "tour_skipped")).toHaveLength(1);
      expect(new Set(names)).toEqual(new Set(["launch", "site_created", "message_sent", "tour_skipped"]));
    },
  );
});
