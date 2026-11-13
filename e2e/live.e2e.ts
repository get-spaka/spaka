import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";

// ADR 0009: the preview shows what the agent is writing before it reaches the
// disk. Played back slowly from fixtures/bakery.jsonl, the page's heading must
// appear while pages/index.liquid does not exist yet.
describe("the preview follows what the agent writes", () => {
  let launched: LaunchedApp;

  beforeAll(async () => {
    launched = await launchApp({ env: { UPSTART_AGENT_REPLAY_SPEED: "0.5" } });
    await launched.window.getByTestId("message-input").waitFor();
  });
  afterAll(async () => {
    await launched?.close();
  });

  test("the page takes shape before the file is written", async () => {
    // Samples, in the main process, what the disk has and what the preview shows.
    await launched.app.evaluate(() => {
      const { existsSync } = process.getBuiltinModule("node:fs");
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const u = (globalThis as any).upstart;
      const samples: { t: number; onDisk: boolean; visible: boolean; heading: string | null; sections: number }[] = [];
      const started = Date.now();
      u.samples = samples;
      u.sampler = setInterval(async () => {
        const project = u.preview.project;
        if (!project) return;
        const onDisk = existsSync(`${project.path}/pages/index.liquid`);
        const page = await u.preview.view.webContents
          .executeJavaScript(
            "({ h: document.querySelector('h1')?.textContent ?? null, s: document.querySelectorAll('section').length })",
          )
          .catch(() => ({ h: null, s: 0 }));
        samples.push({
          t: Date.now() - started,
          onDisk,
          visible: u.preview.view.getVisible(),
          heading: page.h,
          sections: page.s,
        });
      }, 25);
    });
    await launched.window.getByTestId("message-input").fill("A bakery in Lyon");
    await launched.window.getByTestId("message-input").press("Enter");
    await launched.window.locator('[data-testid="agent-message"][data-status="done"]').waitFor({ timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 300));
    const samples = await launched.app.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: idem
      const u = (globalThis as any).upstart;
      clearInterval(u.sampler);
      return u.samples as { t: number; onDisk: boolean; visible: boolean; heading: string | null; sections: number }[];
    });
    const before = samples.filter((s) => !s.onDisk);
    // The page in the theme's colours is shown before any text (decisions, Q87).
    expect(before.find((s) => s.visible)?.heading).toBeNull();
    // The heading, then sections one after the other, all before the file exists.
    expect(before.some((s) => s.heading === "Chez Margot")).toBe(true);
    const counts = [...new Set(before.map((s) => s.sections))];
    expect(counts).toContain(1);
    expect(samples.some((s) => s.onDisk && s.heading === "Chez Margot" && s.sections === 2)).toBe(true);
    // Then it moved on to the next page the agent wrote.
    expect(samples.at(-1)).toMatchObject({ heading: "Chez Margot · Menu" });
    // The page was never reloaded: the same document all along.
    await expect(
      launched.app.evaluate(() =>
        // biome-ignore lint/suspicious/noExplicitAny: idem
        (globalThis as any).upstart.preview.view.webContents.executeJavaScript(
          "performance.getEntriesByType('navigation').length",
        ),
      ),
    ).resolves.toBe(1);
  });
});
