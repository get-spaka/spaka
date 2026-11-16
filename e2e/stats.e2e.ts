import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// The anonymous statistics (Q331, Q334), read from the log the checks get in
// place of Aptabase: the closed list of events, with nothing of the maker's
// words, files or addresses; none once switched off in Privacy.
describe("anonymous statistics", () => {
  let launched: LaunchedApp;
  const { invoke, until } = previewDriver(() => launched);
  const w = () => launched.window;
  const log = join(mkdtempSync(join(tmpdir(), "upstart-stats-")), "events.log");
  const events = () =>
    existsSync(log)
      ? readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as { eventName: string; props: Record<string, string> })
      : [];
  const names = () => events().map((e) => e.eventName);

  beforeAll(async () => {
    launched = await launchApp({ tour: true, env: { UPSTART_STATS_LOG: log } });
    await w().getByTestId("message-input").waitFor();
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("the day's launch", () => {
    expect(names()).toEqual(["launch"]);
  });

  test("a website created from no template, its message, the tour skipped", async () => {
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await w().getByTestId("tour").waitFor({ timeout: 30_000 });
    await w().keyboard.press("Escape");
    await until(async () => names().includes("tour_skipped"));
    expect(names()).toEqual(["launch", "site_created", "message_sent", "tour_skipped"]);
    expect(events()[1]!.props).toEqual({ template: "none" });
    expect(events()[2]!.props).toEqual({ provider: "claude" });
  });

  test("a block added and a publication, with how", async () => {
    const [block] = (await invoke("gallery:list")) as { id: string }[];
    await invoke("gallery:add", block!.id);
    const out = mkdtempSync(join(tmpdir(), "upstart-stats-export-"));
    await invoke("export:run", out, "static");
    expect(names().slice(-2)).toEqual(["block_dropped", "published"]);
    expect(events().at(-1)!.props).toEqual({ way: "static" });
  });

  test("never the maker's words, a file name or an address", () => {
    const text = readFileSync(log, "utf8");
    expect(text).not.toMatch(/Lyon|bakery|\.liquid|\/Users\/|http/i);
    for (const e of events()) for (const value of Object.values(e.props)) expect(value).toMatch(/^[a-z_]+$/);
  });

  test("the Privacy page lists what is sent; switched off, nothing more is", async () => {
    await invoke("settings:open", "privacy");
    // The page is drawn after settings:open answers: wait for its list.
    await until(async () => (await w().getByTestId("statistics-events").locator("li").count()) === 10);
    await expect(w().getByText("This copy of Upstart sends nothing.").count()).resolves.toBe(1);
    await launched.capture("settings-privacy");
    await w().getByTestId("statistics-switch").click();
    await until(async () => (await w().getByTestId("statistics-switch").getAttribute("aria-checked")) === "false");
    await w().keyboard.press("Escape");
    const before = names().length;
    const [block] = (await invoke("gallery:list")) as { id: string }[];
    await invoke("gallery:add", block!.id);
    await new Promise((r) => setTimeout(r, 300));
    expect(names().length).toBe(before);
  });
});
