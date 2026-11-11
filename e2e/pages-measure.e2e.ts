// How much the "All pages" view costs while the agent builds (plan, slice 0):
// the same recorded build of ten pages, shown as one page, then as thumbnails
// (one live view, pictures for the others, Q141). Measures how long each
// rendering takes in the main process (the live thumbnail included), the memory
// of all of Upstart's processes, how soon every page has its picture, and
// whether the agent can still look at the page while the thumbnails are shown. Runs only when
// asked (UPSTART_MEASURE_GRID=1); writes e2e/.runs/pages-measure.json.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";
import { writePagesRecording } from "./fixtures/pages-recording.ts";

const results: Record<string, unknown> = {};

describe.skipIf(process.env.UPSTART_MEASURE_GRID !== "1")("the cost of the All pages view", () => {
  const recording = join(mkdtempSync(join(tmpdir(), "pages-rec-")), "many.jsonl");
  writePagesRecording(recording);

  async function build(view: "page" | "pages") {
    const launched: LaunchedApp = await launchApp({
      env: { UPSTART_AGENT_REPLAY: recording, UPSTART_AGENT_REPLAY_SPEED: "1" },
    });
    // biome-ignore lint/suspicious/noExplicitAny: the main process's objects, for checks
    const main = <T>(fn: (u: any) => T) =>
      launched.app.evaluate(
        (_e, source) => new Function("u", `return (${source})(u)`)((globalThis as { upstart?: unknown }).upstart),
        fn.toString(),
      ) as Promise<Awaited<T>>;
    const invoke = (channel: string, ...args: unknown[]) =>
      launched.window.evaluate(
        // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
        ([c, a]) => (window as any).upstart.invoke(c, ...a),
        [channel, args] as const,
      );
    try {
      const w = launched.window;
      await w.getByTestId("conversation").waitFor();
      const started = Date.now();
      await invoke("conversation:send", "A climbing gym in Grenoble, ten pages.");
      if (view === "pages") {
        await w.getByTestId("view-pages").waitFor({ timeout: 30_000 });
        await invoke("preview:set-view", "pages");
      }
      let peak = 0;
      let liveSeen = 0;
      for (;;) {
        const done = await w.locator('[data-testid="agent-message"][data-status="done"]').count();
        const metrics = await launched.app.evaluate(({ app }) =>
          app.getAppMetrics().reduce((sum, m) => sum + m.memory.workingSetSize, 0),
        );
        peak = Math.max(peak, metrics);
        if (view === "pages")
          liveSeen = Math.max(liveSeen, (await main((u) => u.preview.grid.live().length)) as number);
        if (done) break;
        if (Date.now() - started > 15_000) throw new Error("The turn did not end.");
        await new Promise((r) => setTimeout(r, 100));
      }
      const turnMs = Date.now() - started;
      const times = ((await main((u) => u.preview.pushTimes)) as number[]).slice().sort((a, b) => a - b);
      const at = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))];
      const look = (await main(async (u) => {
        const seen = await u.preview.look();
        return { route: seen.route, png: seen.png ? seen.png.length : 0 };
      })) as { route: string; png: number };
      let picturesMs = 0;
      let pictureBytes: number[] = [];
      if (view === "pages") {
        // Every page gets its picture once the build is over.
        const images = () => w.locator('[data-testid="page-thumb"] img').count();
        for (;;) {
          if ((await images()) >= 10) break;
          if (Date.now() - started > 20_000) throw new Error(`Only ${await images()} pictures of 10.`);
          await new Promise((r) => setTimeout(r, 100));
        }
        picturesMs = Date.now() - started - turnMs;
        await launched.capture("pages-measure-grid");
        // Each picture is a real image, the menu's kept to look at.
        pictureBytes = await w.evaluate(() =>
          [...document.querySelectorAll('[data-testid="page-thumb"] img')].map((img) => {
            const src = img.getAttribute("src") ?? "";
            return Math.floor(((src.split(",")[1] ?? "").length * 3) / 4);
          }),
        );
        const menu = await w.locator('[data-testid="page-thumb"][data-route="/menu"] img').getAttribute("src");
        writeFileSync(join(runsDir, "pages-measure-menu.png"), Buffer.from(String(menu).split(",")[1] ?? "", "base64"));
        const after = await launched.app.evaluate(({ app }) =>
          app.getAppMetrics().reduce((sum, m) => sum + m.memory.workingSetSize, 0),
        );
        peak = Math.max(peak, after);
      }
      results[view] = {
        turnMs,
        renderings: times.length,
        renderMs: { median: at(0.5), p95: at(0.95), max: times.at(-1) },
        peakMemoryMB: Math.round(peak / 1024),
        liveThumbnails: liveSeen,
        picturesAfterTurnMs: picturesMs,
        lookPngBytes: look.png,
        smallestPictureBytes: pictureBytes.length ? Math.min(...pictureBytes) : 0,
      };
      return results[view] as { lookPngBytes: number; liveThumbnails: number; smallestPictureBytes: number };
    } finally {
      await launched.close();
    }
  }

  test("one page", async () => {
    await build("page");
  }, 120_000);

  test("every page as thumbnails, the agent still able to look", async () => {
    const r = await build("pages");
    writeFileSync(join(runsDir, "pages-measure.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    expect(r.liveThumbnails).toBe(1);
    expect(r.lookPngBytes).toBeGreaterThan(1000);
    expect(r.smallestPictureBytes).toBeGreaterThan(1000);
  }, 120_000);
});
