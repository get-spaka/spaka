import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// The agent's words as Markdown in the conversation, rendered while they
// stream in: the recorded bakery, then a turn whose answer comes in pieces,
// with bold cut in the middle, a list, code, a table and two links.
const PIECES = [
  "The menu page is **upd",
  "ated**. Here is what changed:\n\n",
  "- The prices of the `croissant` and the baguette\n",
  "- A new section, *Pastries*\n\n",
  "| Item | Price |\n|---|---|\n| Croissant | 1.40 € |\n\n",
  "See [the menu](/menu), or [daisyUI](https://daisyui.com).",
];

function fixture(): string {
  const bakery = readFileSync(join(import.meta.dirname, "fixtures/bakery.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean);
  const firstTurn = bakery.slice(0, bakery.findIndex((l) => JSON.parse(l).m.type === "result") + 1);
  const lines = bakery.map((l) => JSON.parse(l));
  const start = lines.find((l) => l.m.type === "stream_event" && l.m.event.type === "message_start")!.m;
  const block = lines.find((l) => l.m.type === "stream_event" && l.m.event.type === "content_block_start")!.m;
  const event = (t: number, e: object) => JSON.stringify({ t, m: { ...start, event: e } });
  const turn = [
    JSON.stringify({ t: 50, m: start }),
    JSON.stringify({ t: 80, m: block }),
    ...PIECES.map((text, i) =>
      event(400 + i * 500, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }),
    ),
    event(400 + PIECES.length * 500, { type: "content_block_stop", index: 0 }),
    JSON.stringify({
      t: 450 + PIECES.length * 500,
      m: {
        type: "result",
        subtype: "success",
        is_error: false,
        result: PIECES.join(""),
        duration_ms: 3000,
        total_cost_usd: 0,
      },
    }),
  ];
  const file = join(runsDir, "markdown-replay.jsonl");
  writeFileSync(file, `${[...firstTurn, ...turn].join("\n")}\n`);
  return file;
}

describe("the agent's Markdown in the conversation", () => {
  let launched: LaunchedApp;
  const { invoke, until } = previewDriver(() => launched);
  const w = () => launched.window;
  const last = () => w().getByTestId("agent-message").last();

  beforeAll(async () => {
    launched = await launchApp({ env: { UPSTART_AGENT_REPLAY: fixture(), UPSTART_AGENT_REPLAY_SPEED: "1" } });
    await w().getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => w().locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test("bold cut in the middle shows as bold while it streams, never as its signs", async () => {
    await invoke("conversation:send", "Update the menu prices.");
    await until(async () => ((await last().textContent()) ?? "").includes("The menu page is upd"), 10_000);
    expect(await last().getAttribute("data-status")).toBe("working");
    expect(await last().textContent()).not.toContain("**");
    expect(await last().locator('[data-streamdown="strong"]').textContent()).toBe("upd");
  });

  test("once done: bold, a list, inline code, a table and links", async () => {
    await until(async () => (await last().getAttribute("data-status")) === "done", 15_000);
    const message = last();
    expect(await message.locator('[data-streamdown="strong"]').textContent()).toBe("updated");
    expect(await message.locator('[data-streamdown="list-item"]').count()).toBe(2);
    expect(await message.locator("code").first().textContent()).toBe("croissant");
    expect(await message.locator("table td").allTextContents()).toEqual(["Croissant", "1.40 €"]);
    expect(await message.textContent()).not.toMatch(/\*\*|\|---|\[the menu\]/);
    await launched.capture("conversation-markdown");
  });

  test("a link to a page of the site opens it in the preview; the window stays", async () => {
    const url = w().url();
    await last().getByTestId("agent-link").filter({ hasText: "the menu" }).click();
    // biome-ignore lint/suspicious/noExplicitAny: the main process's objects, set for checks
    const route = () => launched.app.evaluate(() => (globalThis as any).upstart.preview.state().route as string);
    await until(async () => (await route()) === "/menu", 10_000);
    await last().getByTestId("agent-link").filter({ hasText: "daisyUI" }).click();
    expect(w().url()).toBe(url);
  });
});
