import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { AppSettingsStore, DEFAULT_SETTINGS, settingsFrom } from "./app-settings";

let dir: string | undefined;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

test("by default: medium text, short replies, a discreet conversation, a notification", () => {
  expect(DEFAULT_SETTINGS).toMatchObject({
    textSize: "medium",
    replyStyle: "short",
    outputStyle: "discreet",
    notifyDone: true,
  });
});

test("each value is checked; a wrong or missing one is its default", () => {
  expect(settingsFrom(undefined)).toEqual(DEFAULT_SETTINGS);
  expect(
    settingsFrom({
      newModel: "",
      newEffort: "huge",
      statistics: "no",
      textSize: "huge",
      replyStyle: "rude",
      outputStyle: 2,
      notifyDone: "yes",
      appearance: "dim",
      tourSeen: "no",
      projectOrder: "size",
    }),
  ).toEqual(DEFAULT_SETTINGS);
  const chosen = {
    newModel: "claude-opus-5-5",
    newEffort: "high",
    statistics: false,
    appearance: "dark",
    textSize: "large",
    replyStyle: "teaching",
    outputStyle: "detailed",
    notifyDone: false,
    tourSeen: true,
    projectOrder: "name",
  };
  expect(settingsFrom(chosen)).toEqual(chosen);
});

test("the settings are kept in their file, and an unreadable file gives the defaults", () => {
  dir = mkdtempSync(join(tmpdir(), "upstart-settings-"));
  const file = join(dir, "settings.json");
  writeFileSync(file, "{ not json");
  const store = new AppSettingsStore(file);
  expect(store.get()).toEqual(DEFAULT_SETTINGS);
  expect(store.set({ statistics: false }).statistics).toBe(false);
  expect(JSON.parse(readFileSync(file, "utf8")).statistics).toBe(false);
  expect(new AppSettingsStore(file).get()).toMatchObject({ statistics: false, newEffort: "medium" });
});

test("the first start with the tour: seen if a website already exists, and kept once settled (Q340)", () => {
  dir = mkdtempSync(join(tmpdir(), "upstart-settings-"));
  const file = join(dir, "settings.json");
  // A new maker: no settings yet, no website.
  new AppSettingsStore(file).settleTour(false);
  expect(JSON.parse(readFileSync(file, "utf8")).tourSeen).toBe(false);
  // Settled: a website made since does not change it.
  const store = new AppSettingsStore(file);
  store.settleTour(true);
  expect(store.get().tourSeen).toBe(false);
  // A maker of an earlier version, with settings and websites already.
  writeFileSync(file, JSON.stringify({ statistics: false }));
  const earlier = new AppSettingsStore(file);
  earlier.settleTour(true);
  expect(earlier.get()).toMatchObject({ tourSeen: true, statistics: false });
});
