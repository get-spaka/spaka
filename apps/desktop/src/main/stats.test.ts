import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILDERS } from "@upstart/builder";
import { describe, expect, test } from "vitest";
import { en } from "../shared/strings/en";
import { checked, errorType, PUBLISH_WAYS, Stats, type StatsDeps } from "./stats";

function stats(over: Partial<StatsDeps> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "stats-"));
  const sent: { url: string; key: string; body: Record<string, unknown> }[] = [];
  const deps: StatsDeps = {
    allowed: () => true,
    appVersion: "2.0.0",
    osName: "macOS",
    osVersion: "26.1",
    key: "A-EU-0000000000",
    packaged: true,
    templates: () => ["ember", "folio"],
    dayFile: join(dir, "stats.json"),
    send: async (url, key, body) => void sent.push({ url, key, body: JSON.parse(body) }),
    ...over,
  };
  return { stats: new Stats(deps), sent, dir };
}

describe("anonymous statistics (Q331, Q334)", () => {
  test("an event carries the app's version and the system, no language, under a session id", () => {
    const { stats: s, sent } = stats();
    s.track("message_sent", { provider: "gemini" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://eu.aptabase.com/api/v0/event");
    const body = sent[0]!.body as { systemProps: Record<string, unknown>; sessionId: string; props: unknown };
    expect(body.props).toEqual({ provider: "gemini" });
    expect(body.systemProps).toEqual({
      isDebug: false,
      osName: "macOS",
      osVersion: "26.1",
      appVersion: "2.0.0",
      sdkVersion: "upstart@2.0.0",
    });
    expect(body.sessionId).toMatch(/^\d{18}$/);
  });

  test("a value outside its set is dropped; a template not Upstart's is only 'imported'", () => {
    const templates = () => ["ember"];
    // biome-ignore lint/suspicious/noExplicitAny: a value no caller can type, as a page could send
    expect(checked("message_sent", { provider: "My secret prompt" } as any, templates)).toEqual({});
    expect(checked("site_created", { template: "ember" }, templates)).toEqual({ template: "ember" });
    expect(checked("site_created", { template: "none" }, templates)).toEqual({ template: "none" });
    expect(checked("site_created", { template: "my-bakery" }, templates)).toEqual({ template: "imported" });
    // biome-ignore lint/suspicious/noExplicitAny: a property the event does not have
    expect(checked("page_edit", { file: "pages/index.liquid" } as any, templates)).toEqual({});
    expect(checked("published", { way: "cloudflare" }, templates)).toEqual({ way: "cloudflare" });
  });

  test("the ways of publishing are the builders'", () => {
    expect([...PUBLISH_WAYS].sort()).toEqual(BUILDERS.map((b) => b.id).sort());
  });

  test("nothing is sent with statistics off, without the key, or from a development run", () => {
    for (const over of [{ allowed: () => false }, { key: "" }, { packaged: false }]) {
      const { stats: s, sent } = stats(over);
      s.track("page_edit");
      s.launched();
      expect(sent).toEqual([]);
    }
  });

  test("the launch is counted once a day", () => {
    let now = new Date("2026-11-16T09:00:00Z");
    const { stats: s, sent } = stats({ now: () => now });
    s.launched();
    s.launched();
    now = new Date("2026-11-16T22:00:00Z");
    s.launched();
    expect(sent.map((e) => e.body.eventName)).toEqual(["launch"]);
    now = new Date("2026-11-17T08:00:00Z");
    s.launched();
    expect(sent.map((e) => e.body.eventName)).toEqual(["launch", "launch"]);
  });

  test("a session ends after an hour without an event", () => {
    let now = new Date("2026-11-16T09:00:00Z");
    const { stats: s, sent } = stats({ now: () => now });
    s.track("page_edit");
    now = new Date("2026-11-16T09:50:00Z");
    s.track("theme_changed");
    now = new Date("2026-11-16T11:00:00Z");
    s.track("theme_changed");
    const ids = sent.map((e) => e.body.sessionId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[1]);
  });

  test("checks read the events from a log, with or without a key", () => {
    const { dir } = stats();
    const log = join(dir, "events.log");
    const { stats: s, sent } = stats({ key: "", packaged: false, log });
    s.track("tour_finished");
    expect(sent).toEqual([]);
    expect(JSON.parse(readFileSync(log, "utf8").trim()).eventName).toBe("tour_finished");
  });

  test("a failed turn counts by the kind of its reason, never the reason", () => {
    expect(errorType(en.errors.signInNeeded, en.errors)).toBe("sign_in");
    expect(errorType(en.errors.agentLimit, en.errors)).toBe("agent_limit");
    expect(errorType("Gemini said: quota for project my-project exceeded", en.errors)).toBe("agent_other");
  });
});
