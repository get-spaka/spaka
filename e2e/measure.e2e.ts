// Measures, with the real agent, how fast a new website takes shape in the
// preview, against the targets (decisions, Live generation): a first visible
// change within 3 s, a first real section within 10 s, a full home page
// within 60 s. Runs only when asked (UPSTART_MEASURE=1), like agent.e2e.ts.
//
// - first change: the preview shows text for the first time;
// - first section: a first section of the page is complete (the next one has started);
// - full page: pages/index.liquid is on disk.
// The first build is also filmed (e2e/.runs/measure-1.mp4).
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";

const configDir = join(import.meta.dirname, "../.cache/agent-config");
const prompts = [
  "A website for Fleur de Loire, a florist in Nantes.",
  "A website for a small climbing gym in Grenoble called Le Bloc.",
  "A website for a freelance English-French translator.",
];

type Sample = {
  t: number;
  route: string | null;
  onDisk: boolean;
  visible: boolean;
  text: number;
  blocks: number;
  themed: boolean;
};

describe.skipIf(process.env.UPSTART_MEASURE !== "1")("how fast a website takes shape", () => {
  let launched: LaunchedApp;
  const results: Record<string, number | null | string>[] = [];

  beforeAll(async () => {
    rmSync(join(runsDir, "measure-agent.jsonl"), { force: true });
    launched = await launchApp({
      env: {
        UPSTART_AGENT_REPLAY: "",
        UPSTART_AGENT_CONFIG_DIR: configDir,
        UPSTART_AGENT_RECORD: join(runsDir, "measure-agent.jsonl"),
      },
    });
    await launched.window.getByTestId("conversation").waitFor();
  }, 60_000);
  afterAll(async () => {
    writeFileSync(join(runsDir, "measure.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    await launched?.close();
  });

  for (const [index, prompt] of prompts.entries()) {
    test(`build ${index + 1}`, async () => {
      const film = index === 0 ? join(runsDir, "measure-1-frames") : undefined;
      if (film) {
        rmSync(film, { recursive: true, force: true });
        mkdirSync(film, { recursive: true });
      }
      await launched.window.evaluate(() =>
        // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
        (window as any).upstart.invoke("projects:close"),
      );
      // In the main process: sample the disk and the preview every 25 ms, and film it.
      await launched.app.evaluate(async (_electron, film) => {
        const { existsSync, writeFileSync } = process.getBuiltinModule("node:fs");
        // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
        const u = (globalThis as any).upstart;
        const contents = u.preview.view.webContents;
        const started = Date.now();
        u.measure = { started, samples: [] as Sample[], frames: [] as { file: string; t: number }[] };
        u.measure.timer = setInterval(async () => {
          const project = u.preview.project;
          if (!project) return;
          const onDisk = existsSync(`${project.path}/pages/index.liquid`);
          const page = await contents
            .executeJavaScript(
              "({ text: (document.body?.innerText ?? '').trim().length, blocks: document.querySelectorAll('body section, body header, body footer, body main > div').length, themed: (document.getElementById('up-theme')?.textContent ?? '').includes('--theme-') })",
            )
            .catch(() => ({ text: 0, blocks: 0, themed: false }));
          u.measure.samples.push({
            t: Date.now() - started,
            route: u.preview.state().route,
            onDisk,
            visible: u.preview.view.getVisible(),
            ...page,
          });
        }, 25);
        if (film) {
          // A picture of what the maker sees, every 100 ms: the page once the preview shows it, else nothing.
          let busy = false;
          u.measure.filmer = setInterval(async () => {
            if (busy) return;
            busy = true;
            const t = Date.now() - started;
            const visible = u.preview.view.getVisible();
            const data = visible
              ? await u.preview.capture({ format: "jpeg", quality: 70 }).catch(() => undefined)
              : undefined;
            const file = `${film}/${String(u.measure.frames.length).padStart(5, "0")}.jpg`;
            if (data) writeFileSync(file, data);
            u.measure.frames.push({ file: data ? file : null, t });
            busy = false;
          }, 100);
        }
      }, film);

      await launched.window.getByTestId("message-input").fill(prompt);
      await launched.window.getByTestId("message-input").press("Enter");
      await launched.window
        .locator('[data-testid="agent-message"]:not([data-status="working"])')
        .waitFor({ timeout: 240_000 });

      const { samples, frames } = await launched.app.evaluate(async () => {
        // biome-ignore lint/suspicious/noExplicitAny: idem
        const u = (globalThis as any).upstart;
        clearInterval(u.measure.timer);
        clearInterval(u.measure.filmer);
        return {
          samples: u.measure.samples as Sample[],
          frames: u.measure.frames as { file: string | null; t: number }[],
        };
      });
      const first = (test: (s: Sample) => boolean) => samples.find(test)?.t ?? null;
      const result = {
        prompt,
        themeMs: first((s) => s.themed),
        firstVisibleMs: first((s) => s.visible),
        firstTextMs: first((s) => s.visible && s.text > 0),
        firstSectionMs: first((s) => s.visible && s.blocks >= 2),
        fullPageMs: first((s) => s.onDisk),
        turnMs: samples.at(-1)?.t ?? null,
        routes: samples
          .map((s) => s.route)
          .filter((r, i, all) => r !== all[i - 1])
          .join(" → "),
      };
      results.push(result);
      console.log(`[measure] ${JSON.stringify(result)}`);
      if (film && frames.length) {
        // Until the preview shows something, the maker sees Upstart's empty state: a blank frame.
        const blank = join(film, "blank.jpg");
        execFileSync("ffmpeg", [
          "-y",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "color=c=0xfafafa:s=1280x800",
          "-frames:v",
          "1",
          blank,
        ]);
        // Each frame shown until the next one, at its real pace.
        const list = frames
          .map((f) => ({ ...f, file: f.file ?? blank }))
          .map((f, i) => `file '${f.file}'\nduration ${(((frames[i + 1]?.t ?? f.t + 1000) - f.t) / 1000).toFixed(3)}`)
          .join("\n");
        writeFileSync(join(film, "list.txt"), `${list}\nfile '${frames.at(-1)!.file ?? blank}'\n`);
        execFileSync("ffmpeg", [
          "-y",
          "-loglevel",
          "error",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          join(film, "list.txt"),
          "-vf",
          "scale=1280:-2,fps=30",
          "-pix_fmt",
          "yuv420p",
          join(runsDir, "measure-1.mp4"),
        ]);
      }
      expect(result.fullPageMs).not.toBeNull();
    }, 300_000);
  }
});
