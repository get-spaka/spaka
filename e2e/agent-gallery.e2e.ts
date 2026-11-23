// The gallery with the real agent (Q97, Q98, Q102, Q88). Opt-in like
// agent.e2e.ts: UPSTART_REAL_AGENT=1, with .cache/agent-config signed in.
// One build: a home page asked for in English. The agent searches the
// gallery, puts its blocks in with use_block, writes the site in
// English; the first section's time is measured against the 10 s target.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { agentConfigDir, type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";

const real = process.env.UPSTART_REAL_AGENT === "1";
const configDir = agentConfigDir();
const gallery = join(import.meta.dirname, "../apps/desktop/gallery");

const classesOf = (html: string) =>
  new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/)).filter(Boolean));
const likeness = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length / new Set([...a, ...b]).size;

describe.skipIf(!real)("the gallery with the real agent", () => {
  let launched: LaunchedApp;
  let path: string;
  const record = join(runsDir, "real-agent-gallery.jsonl");
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
      [channel, args] as const,
    );
  const page = (code: string) =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, code) => (globalThis as any).upstart.preview.view.webContents.executeJavaScript(code),
      code,
    );
  const messages = () =>
    readFileSync(record, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).m);
  const report: Record<string, unknown> = {};

  beforeAll(async () => {
    mkdirSync(runsDir, { recursive: true });
    rmSync(record, { force: true });
    launched = await launchApp({
      env: { UPSTART_AGENT_REPLAY: "", UPSTART_AGENT_CONFIG_DIR: configDir, UPSTART_AGENT_RECORD: record },
    });
    await launched.window.getByTestId("message-input").waitFor();
  }, 60_000 * SLOW);
  afterAll(async () => {
    writeFileSync(join(runsDir, "real-agent-gallery.json"), JSON.stringify(report, null, 2));
    await launched?.close();
  });

  test(
    "a home page in English, with a section started from a block",
    async () => {
      const started = Date.now();
      await invoke(
        "conversation:send",
        "A website for Still Water, a small yoga studio in Bristol: a home page with the classes we teach, prices for our three passes, a few reviews from students and answers to common questions.",
      );
      // The first section on screen: a section of the page with some text in it.
      let firstSection: number | undefined;
      for (;;) {
        const { items } = await invoke("conversation:get");
        const last = items.at(-1);
        if (firstSection === undefined) {
          const shown = await page(
            "[...document.querySelectorAll('body section, main > *')].some((s) => s.textContent.trim().length > 20)",
          ).catch(() => false);
          if (shown) firstSection = Date.now() - started;
        }
        if (last?.kind === "agent" && last.status !== "working") break;
        if (Date.now() - started > 420_000) throw new Error("the agent did not finish in 7 minutes");
        await new Promise((r) => setTimeout(r, 100));
      }
      report.turnMs = Date.now() - started;
      report.firstSectionMs = firstSection;
      path = (await invoke("projects:current")).path;

      // The agent searched the gallery.
      const calls = (name: string) =>
        messages()
          .filter((m) => m?.type === "assistant")
          .flatMap((m) => m.message.content)
          .filter((c: { type: string; name?: string }) => c.type === "tool_use" && c.name === name)
          .map((c: { input: unknown }) => c.input);
      const searches = calls("mcp__upstart__find_blocks");
      report.searches = searches;
      expect(searches.length).toBeGreaterThanOrEqual(1);
      // It put the blocks in with use_block (Q213), and replaced every sample record (Q217).
      report.placed = calls("mcp__upstart__use_block");
      expect((report.placed as unknown[]).length).toBeGreaterThanOrEqual(1);
      const samples = (() => {
        try {
          return JSON.parse(readFileSync(join(path, ".upstart/gallery-samples.json"), "utf8"));
        } catch {
          return {};
        }
      })();
      report.samplesLeft = Object.entries(samples as Record<string, string>)
        .filter(([file, sum]) => {
          try {
            return (
              createHash("sha256")
                .update(readFileSync(join(path, file), "utf8"))
                .digest("hex") === sum
            );
          } catch {
            return false;
          }
        })
        .map(([file]) => file);
      expect(report.samplesLeft).toEqual([]);

      // A part of the project started from a block: most of its classes are the block's.
      const blocks = readdirSync(gallery, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .flatMap((kind) =>
          readdirSync(join(gallery, kind.name)).map((id) => ({
            id,
            classes: classesOf(readFileSync(join(gallery, kind.name, id, "block.liquid"), "utf8")),
          })),
        );
      const parts = readdirSync(join(path, "parts")).filter((f) => f.endsWith(".liquid"));
      const matches = parts.map((file) => {
        const classes = classesOf(readFileSync(join(path, "parts", file), "utf8"));
        const best = blocks
          .map((b) => ({ id: b.id, score: likeness(classes, b.classes) }))
          .sort((a, b) => b.score - a.score)[0]!;
        return { file, block: best.id, score: Math.round(best.score * 100) / 100 };
      });
      report.parts = matches;
      expect(matches.some((m) => m.score >= 0.5)).toBe(true);
      const home = readFileSync(join(path, "pages/index.liquid"), "utf8");
      expect(home).toMatch(/\{%-?\s*render '/);

      // Written in English (Q88).
      expect(home).toMatch(/<html[^>]*lang="en/);
      const text = await page("document.body.innerText");
      expect(text).toMatch(/\b(the|and|your|our)\b/i);
      expect(text).not.toMatch(/\b(le|les|des|nous|votre|et)\b/);
      writeFileSync(join(runsDir, "real-agent-gallery.png"), await launched.window.screenshot());
    },
    480_000 * SLOW,
  );
});
