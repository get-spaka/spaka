import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Runtime } from "./runtime.ts";
import { memorySource } from "./source.ts";

// Both sides of UTC, the ends of the world, and zones whose clocks change at midnight (Santiago, Cairo).
const ZONES = [
  ["UTC", 0],
  ["America/Los_Angeles", 480],
  ["Pacific/Pago_Pago", 660],
  ["Europe/Paris", -60],
  ["Pacific/Auckland", -780],
  ["Pacific/Kiritimati", -840],
  ["America/Santiago", 180],
  ["Africa/Cairo", -120],
] as const;

const print = (liquid: string, record: Record<string, string> = {}) => {
  const runtime = new Runtime(
    memorySource({
      "pages/index.liquid": `{% assign record = data.events.first %}${liquid}`,
      "data/events/_datasource.yaml":
        "fields:\n  - name: title\n    kind: text\n  - name: date\n    kind: date\n  - name: note\n    kind: text\n",
      "data/events/one.md": `---\ntitle: One\n${Object.entries(record)
        .map(([name, value]) => `${name}: ${value}\n`)
        .join("")}---\n`,
    }),
    { repair: false, trace: false },
  );
  return runtime.renderRoute("/").html;
};

describe.each(ZONES)("dates in %s", (zone, offset) => {
  const before = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = zone;
    expect(new Date("2027-01-12").getTimezoneOffset()).toBe(offset);
  });
  afterEach(() => {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  });

  test("a record's date with no time is the day written", () => {
    expect(print(`{{ record.date | date: "%Y-%m-%d %u" }}`, { date: "2027-01-12" })).toContain("2027-01-12 2");
    expect(print(`{{ record.date | date: "%B %-d" }}`, { date: `"2027-01-12"` })).toContain("January 12");
    expect(print(`{{ record.date | date: "%Y-%m-%d", "Asia/Tokyo" }}`, { date: "2027-01-12" })).toContain("2027-01-12");
    expect(print(`{{ record.date | date: "%Y-%m-%d", 480 }}`, { date: "2027-01-12" })).toContain("2027-01-12");
  });

  test("every day of two years, with its clock changes", () => {
    for (let at = Date.UTC(2026, 0, 1); at < Date.UTC(2028, 0, 1); at += 86_400_000) {
      const day = new Date(at).toISOString().slice(0, 10);
      expect(print(`{{ "${day}" | date: "%Y-%m-%d" }}`)).toContain(day);
    }
  });

  test("a month with no day is the month written", () => {
    expect(print(`{{ "2027-01" | date: "%Y-%m" }}`)).toContain("2027-01");
  });

  test("it stays midnight UTC once a timestamp", () => {
    expect(print(`{{ "2027-01-12" | date: "%s" }}`)).toContain("1799712000");
  });

  test("the other filters print the same day", () => {
    expect(print(`{{ "2027-01-12" | date_to_string }}`)).toContain("12 Jan 2027");
    expect(print(`{{ "2027-01-12" | date_to_long_string: "ordinal" }}`)).toContain("12th January 2027");
    expect(print(`{{ "2027-01-12" | date_to_xmlschema }}`)).toContain("2027-01-12T00:00:00");
    expect(print(`{{ "2027-01-12" | date_to_rfc822 }}`)).toContain("Tue, 12 Jan 2027 00:00:00");
  });

  test("a date with a time, now and a timestamp are said in the machine's zone", () => {
    const local = (at: Date) =>
      [at.getFullYear(), at.getMonth() + 1, at.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
    const at = new Date("2027-01-12T23:30:00Z");
    expect(print(`{{ "2027-01-12T23:30:00Z" | date: "%Y-%m-%d %H:%M" }}`)).toContain(
      `${local(at)} ${String(at.getHours()).padStart(2, "0")}:30`,
    );
    expect(print(`{{ ${at.getTime() / 1000} | date: "%Y-%m-%d" }}`)).toContain(local(at));
    expect(print(`{{ "${at.getTime() / 1000}" | date: "%Y-%m-%d" }}`)).toContain(local(at));
    expect(print(`{{ "now" | date: "%Y-%m-%d" }}`)).toContain(local(new Date()));
    expect(print(`{{ "2027-01-12T12:00:00" | date: "%Y-%m-%d %H" }}`)).toContain("2027-01-12 12");
    expect(print(`{{ "2027-01-12T23:30:00Z" | date: "%d %H", 0 }}`)).toContain("12 23");
  });

  test("what is no date is left as written", () => {
    expect(print(`{{ "2027-13-45" | date: "%Y" }}`)).toContain("2027-13-45");
    expect(print(`{{ "2027-13-45" | date_to_string }}`)).toContain("2027-13-45");
    expect(print(`{{ record.note | date: "%Y" }}`, { note: "soon" })).toContain("soon");
    expect(print(`[{{ record.note | date: "%Y" }}]`)).toContain("[]");
  });
});
