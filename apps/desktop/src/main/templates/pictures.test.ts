// The clock a template is photographed at (template:shoot): read from the
// command's --clock or the template's own template.json, and the script that
// sets it in each page before the page's own.
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { fixedClockScript, shootClock } from "./pictures";

const WEDNESDAY = "2027-04-14T09:30:00-05:00";

describe("the shoot's clock", () => {
  test("the real clock unless the command or the template sets one", () => {
    expect(shootClock({ id: "corner" })).toBeUndefined();
    expect(shootClock(null)).toBeUndefined();
    expect(shootClock({ shoot: { clock: WEDNESDAY } })).toBe(Date.parse(WEDNESDAY));
    // --clock wins over the template's.
    expect(shootClock({ shoot: { clock: WEDNESDAY } }, "2027-04-17T20:00:00Z")).toBe(
      Date.parse("2027-04-17T20:00:00Z"),
    );
  });

  test("an instant with its offset, nothing vaguer", () => {
    expect(() => shootClock({ shoot: { clock: "2027-04-14T09:30" } })).toThrow(/offset/);
    expect(() => shootClock({}, "next Wednesday")).toThrow(/offset/);
  });

  test("a page's Date starts at it and goes on; dates it is given stay as they are", () => {
    const at = Date.parse(WEDNESDAY);
    const read = runInNewContext(
      `${fixedClockScript(at)}
      ({
        made: new Date().getTime(),
        now: Date.now(),
        called: Date(),
        given: new Date(0).getTime(),
        parsed: Date.parse("2020-01-01T00:00:00Z"),
        isDate: new Date() instanceof Date,
        day: new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long", hour: "numeric", minute: "numeric", hourCycle: "h23" }).format(new Date()),
      })`,
      { Intl },
    );
    expect(Math.abs(read.made - at)).toBeLessThan(1000);
    expect(Math.abs(read.now - at)).toBeLessThan(1000);
    expect(read.called).toContain("2027");
    expect(read.given).toBe(0);
    expect(read.parsed).toBe(Date.parse("2020-01-01T00:00:00Z"));
    expect(read.isDate).toBe(true);
    expect(read.day).toBe("Wednesday 09:30");
  });
});
