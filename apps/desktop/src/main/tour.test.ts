import { describe, expect, test } from "vitest";
import { opensTour, type TourMoment } from "./tour";

const built: TourMoment = {
  seen: false,
  done: true,
  shown: true,
  adapting: false,
  adaptationFinished: false,
  hasPage: true,
};

describe("when the tour opens by itself (Q328, Q333, Q336, Q340)", () => {
  test("a first website built from nothing: at the end of its turn", () => {
    expect(opensTour(built)).toBe(true);
  });

  test("a template whose adaptation is not over: never between two pages", () => {
    expect(opensTour({ ...built, adapting: true })).toBe(false);
  });

  test("a template whose adaptation is over, its pages adapted or the rest removed", () => {
    expect(opensTour({ ...built, adapting: true, adaptationFinished: true })).toBe(true);
    // Finished by removing the pages left, outside a turn of the agent.
    expect(opensTour({ ...built, done: false, adapting: true, adaptationFinished: true })).toBe(true);
  });

  test("a maker who already had websites, or saw or skipped it: never", () => {
    expect(opensTour({ ...built, seen: true })).toBe(false);
    expect(opensTour({ ...built, seen: true, adapting: true, adaptationFinished: true })).toBe(false);
  });

  test("a turn that failed or was stopped, a website not on screen, or no page yet: nothing", () => {
    expect(opensTour({ ...built, done: false })).toBe(false);
    expect(opensTour({ ...built, shown: false })).toBe(false);
    expect(opensTour({ ...built, hasPage: false })).toBe(false);
  });
});
