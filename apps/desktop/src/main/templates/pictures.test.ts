// The shoot's preloads (template:shoot): the clock a template is photographed
// at, read from the command's --clock or the template's own template.json, and
// the script that sets it in each page before the page's own; every image
// loaded at once; a page held still for its whole picture.
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { eagerImagesScript, fixedClockScript, shootClock, stillPageScript } from "./pictures";

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

/** An element as the scripts read it: its attributes, and the images inside it. */
const element = (name: string, attributes: Record<string, string> = {}, inside: unknown[] = []) => {
  const values = new Map(Object.entries(attributes));
  return {
    nodeType: 1,
    localName: name,
    getAttribute: (key: string) => values.get(key) ?? null,
    setAttribute: (key: string, value: string) => values.set(key, value),
    getElementsByTagName: () => inside,
  };
};

describe("every image loaded at once", () => {
  test("a lazy image is made eager as it arrives, inside what arrives, or once it is marked lazy", () => {
    const watching: { changes: (records: unknown[]) => void; options: unknown }[] = [];
    class MutationObserver {
      constructor(changes: (records: unknown[]) => void) {
        watching.push({ changes, options: undefined });
      }
      observe(_target: unknown, options: unknown) {
        watching.at(-1)!.options = options;
      }
    }
    runInNewContext(eagerImagesScript(), { MutationObserver, document: {} });
    expect(watching).toHaveLength(1);
    expect(watching[0]!.options).toMatchObject({ subtree: true, childList: true, attributes: true });

    const below = element("img", { loading: "lazy", src: "/media/a.jpg" });
    const inCard = element("img", { loading: "lazy" });
    const plain = element("img", { src: "/media/b.jpg" });
    const later = element("img", { loading: "lazy" });
    watching[0]!.changes([
      { type: "childList", addedNodes: [below, element("figure", {}, [inCard, plain]), { nodeType: 3 }] },
      { type: "attributes", target: later },
    ]);
    expect(below.getAttribute("loading")).toBe("eager");
    expect(inCard.getAttribute("loading")).toBe("eager");
    expect(later.getAttribute("loading")).toBe("eager");
    expect(plain.getAttribute("loading")).toBeNull();
  });
});

describe("a page held still for its whole picture", () => {
  /** The page's world: its animations, frames and timers, and the screen's observer, run by hand. */
  const world = () => {
    const frames: (() => void)[] = [];
    const timers: (() => void)[] = [];
    class DocumentTimeline {}
    class ScrollTimeline {}
    class ViewTimeline extends ScrollTimeline {}
    const animations: Record<string, unknown>[] = [];
    const created: { callback: (entries: unknown[], observer: unknown) => void; options: unknown }[] = [];
    class IntersectionObserver {
      observed = new Set<unknown>();
      constructor(callback: (entries: unknown[], observer: unknown) => void, options?: unknown) {
        created.push({ callback, options });
      }
      observe(target: unknown) {
        this.observed.add(target);
      }
      unobserve(target: unknown) {
        this.observed.delete(target);
      }
      disconnect() {
        this.observed.clear();
      }
    }
    const context = {
      document: { getAnimations: () => animations },
      DocumentTimeline,
      ScrollTimeline,
      ViewTimeline,
      IntersectionObserver,
      CSS: { percent: (value: number) => ({ value, unit: "percent" }) },
      requestAnimationFrame: (f: () => void) => frames.push(f),
      setTimeout: (f: () => void) => timers.push(f),
      performance: { now: () => 1 },
      DOMRect: class {
        constructor(
          readonly x: number,
          readonly y: number,
          readonly width: number,
          readonly height: number,
        ) {}
      },
      innerWidth: 1440,
      innerHeight: 2400,
    };
    runInNewContext(stillPageScript(), context);
    const animation = (timeline: unknown, startTime: { value: number } | null) => {
      const a: Record<string, unknown> = { timeline, startTime, currentTime: null, playbackRate: 1, paused: false };
      a.pause = () => {
        a.paused = true;
      };
      animations.push(a);
      return a;
    };
    const frame = () => {
      for (const f of frames.splice(0)) f();
    };
    const tick = () => {
      for (const f of timers.splice(0)) f();
    };
    return { context, animation, frame, tick, created, DocumentTimeline, ScrollTimeline, ViewTimeline };
  };

  test("an animation driven by scrolling is held: an element's in the middle of the screen, the page's at its top", () => {
    const w = world();
    // An element's rise (view()), the start of its timeline at 0%.
    const rise = w.animation(new w.ViewTimeline(), { value: 0 });
    // The page's (scroll()), its range starting at 9% of the page's scroll.
    const seal = w.animation(new w.ScrollTimeline(), { value: 9 });
    // One in time, not driven by scrolling, and one not started yet.
    const timed = w.animation(new w.DocumentTimeline(), { value: 120 });
    const pending = w.animation(new w.ViewTimeline(), null);
    w.frame();
    expect(rise).toMatchObject({ paused: true, currentTime: { value: 50, unit: "percent" } });
    expect(seal).toMatchObject({ paused: true, currentTime: { value: -9, unit: "percent" } });
    expect(timed).toMatchObject({ paused: false, currentTime: null });
    expect(pending.paused).toBe(false);
    // Held once: a later frame leaves it as it is, and holds the one started since.
    rise.currentTime = "moved";
    pending.startTime = { value: 20 };
    w.frame();
    expect(rise.currentTime).toBe("moved");
    expect(pending).toMatchObject({ paused: true, currentTime: { value: 30, unit: "percent" } });
  });

  test("an observer on the screen sees what it watches wholly in view, once; one on a scroller is left as it is", () => {
    const w = world();
    const Observer = w.context.IntersectionObserver as unknown as new (
      callback: (entries: { target: unknown; isIntersecting: boolean; intersectionRatio: number }[]) => void,
      options?: unknown,
    ) => { observe(t: unknown): void; unobserve(t: unknown): void };
    const seen: unknown[] = [];
    const reveal = new Observer(
      (entries) => {
        for (const e of entries) if (e.isIntersecting && e.intersectionRatio === 1) seen.push(e.target);
      },
      { threshold: 0.1 },
    );
    const box = { x: 0, y: 3000, width: 600, height: 200 };
    const heading = { getBoundingClientRect: () => box };
    const card = { getBoundingClientRect: () => box };
    reveal.observe(heading);
    reveal.observe(heading);
    reveal.observe(card);
    reveal.unobserve(card);
    w.tick();
    expect(seen).toEqual([heading]);
    // The browser's own word on it is not passed on.
    w.created[0]!.callback([{ target: heading, isIntersecting: false }], reveal);
    expect(seen).toEqual([heading]);

    const scroller = {};
    const slides: unknown[] = [];
    const track = new Observer((entries) => slides.push(...entries), { root: scroller });
    track.observe(heading);
    w.tick();
    expect(slides).toEqual([]);
    w.created[1]!.callback([{ target: heading, isIntersecting: false }], track);
    expect(slides).toEqual([{ target: heading, isIntersecting: false }]);
  });
});
