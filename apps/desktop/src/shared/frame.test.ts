import { expect, test } from "vitest";
import {
  cleanFrame,
  dragged,
  formatAt,
  frameClasses,
  frameDeclarations,
  frameOf,
  frameUtilities,
  readFrame,
  readFrameClasses,
  shownRect,
} from "./frame";

const style = (values: Record<string, string>) => ({ getPropertyValue: (name: string) => values[name] ?? "" });

test("a frame without zoom is a fit, a position and proportions; nothing scales or cuts", () => {
  expect(frameDeclarations({ x: 50, y: 0, zoom: 1, fit: "cover", ratio: [4, 3] })).toEqual([
    ["object-fit", "cover"],
    ["object-position", "50% 0%"],
    ["aspect-ratio", "4 / 3"],
  ]);
  expect(frameDeclarations({ x: 50, y: 50, zoom: 1 })).toEqual([["object-position", "50% 50%"]]);
});

test("a zoomed image is scaled from where it is held and cut to its frame, its corners kept", () => {
  expect(frameDeclarations({ x: 0, y: 100, zoom: 2, radius: "8px 50%" })).toEqual([
    ["object-position", "0% 100%"],
    ["transform", "scale(2)"],
    ["transform-origin", "0% 100%"],
    // Half of the image shows: all of the cut is on the sides away from the point held.
    ["clip-path", "inset(50% 50% 0% 0% round 4px 50%)"],
  ]);
  expect(frameDeclarations({ x: 50, y: 50, zoom: 1.25 }).at(-1)).toEqual(["clip-path", "inset(10% 10% 10% 10%)"]);
});

test("where nothing was set, an image's frame is the fit and the position the page gives it", () => {
  expect(readFrame(style({ "object-fit": "cover", "object-position": "0% 100%" }))).toEqual({
    x: 0,
    y: 100,
    zoom: 1,
    fit: "cover",
  });
  // A position in pixels is taken as the middle.
  expect(readFrame(style({ "object-fit": "fill", "object-position": "10px 20px" }))).toEqual({ x: 50, y: 50, zoom: 1 });
});

test("a frame is written as important utilities, and read back from them", () => {
  const frame = {
    x: 25,
    y: 50,
    zoom: 1.4,
    fit: "cover" as const,
    ratio: [4, 3] as [number, number],
    radius: "8px 4px",
  };
  const utilities = frameUtilities(frame);
  expect(utilities).toEqual([
    "object-cover",
    "object-[25%_50%]",
    "aspect-[4/3]",
    "[transform:scale(1.4)]",
    "[transform-origin:25%_50%]",
    "[clip-path:inset(14.29%_21.43%_14.29%_7.14%_round_5.71px_2.86px)]",
  ]);
  const { radius: _, ...shown } = frame;
  expect(frameOf(utilities)).toEqual(shown);
});

test("neighbouring screens set alike share a variant; all three need none", () => {
  const a = frameUtilities({ x: 0, y: 0, zoom: 1 });
  const b = frameUtilities({ x: 100, y: 0, zoom: 1, fit: "contain" });
  expect(frameClasses({ phone: a, tablet: a, desktop: a })).toEqual(["object-[0%_0%]!"]);
  expect(frameClasses({ phone: b, tablet: a, desktop: a })).toEqual([
    "max-md:object-contain!",
    "max-md:object-[100%_0%]!",
    "md:object-[0%_0%]!",
  ]);
  expect(frameClasses({ phone: a, tablet: a })).toEqual(["max-lg:object-[0%_0%]!"]);
  expect(frameClasses({ tablet: a })).toEqual(["md:max-lg:object-[0%_0%]!"]);
  // The phone and the desktop are not neighbours: each has its own.
  expect(frameClasses({ phone: a, desktop: a })).toEqual(["max-md:object-[0%_0%]!", "lg:object-[0%_0%]!"]);
  expect(frameClasses({})).toEqual([]);
});

test("an image's classes are read apart: each screen's frame, and the template's own", () => {
  const classes =
    "hero md:object-top  object-cover max-md:object-[100%_0%]! md:aspect-[16/9]! lg:[transform:scale(2)]! w-full!";
  const { utilities, rest } = readFrameClasses(classes);
  // The template's own classes are left, an important one of another kind among them.
  expect(rest).toEqual(["hero", "md:object-top", "object-cover", "w-full!"]);
  expect(utilities).toEqual({
    phone: ["object-[100%_0%]"],
    tablet: ["aspect-[16/9]"],
    desktop: ["aspect-[16/9]", "[transform:scale(2)]"],
  });
  expect(frameClasses(utilities)).toEqual([
    "max-md:object-[100%_0%]!",
    "md:max-lg:aspect-[16/9]!",
    "lg:aspect-[16/9]!",
    "lg:[transform:scale(2)]!",
  ]);
  expect([formatAt(393), formatAt(767), formatAt(820), formatAt(1024)]).toEqual([
    "phone",
    "phone",
    "tablet",
    "desktop",
  ]);
});

test("a dragged image follows the pointer as far as it has room", () => {
  const box = { width: 200, height: 100 };
  // Covering, an image twice as tall as its frame has 100px of room in height, none in width.
  const tall = { width: 400, height: 400 };
  expect(dragged({ x: 50, y: 50, zoom: 1, fit: "cover" }, 30, 25, box, tall)).toMatchObject({ x: 50, y: 25 });
  expect(dragged({ x: 50, y: 50, zoom: 1, fit: "cover" }, 0, 500, box, tall)).toMatchObject({ y: 0 });
  // Shown whole, it moves in the room left around it, the way the pointer goes.
  expect(dragged({ x: 50, y: 50, zoom: 1, fit: "contain" }, 25, 0, box, tall)).toMatchObject({ x: 75, y: 50 });
  // Zoomed, an image stretched to its frame has room on both sides.
  expect(dragged({ x: 50, y: 50, zoom: 2 }, -50, 0, box, tall)).toMatchObject({ x: 75 });
  expect(dragged({ x: 50, y: 50, zoom: 1 }, 40, 40, box, tall)).toMatchObject({ x: 50, y: 50 });
});

test("a zoomed image shows where its frame was before the scaling", () => {
  expect(shownRect({ left: 0, top: -100, width: 400, height: 200 }, { x: 0, y: 100, zoom: 2 })).toEqual({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
    right: 200,
    bottom: 100,
  });
});

test("a frame from the preview is kept within what a frame can be", () => {
  expect(cleanFrame({ x: -5, y: 120, zoom: 9, fit: "fill", ratio: [4, 3], radius: "8px" })).toEqual({
    x: 0,
    y: 100,
    zoom: 3,
    ratio: [4, 3],
    radius: "8px",
  });
  expect(cleanFrame({ x: 1, y: 2, zoom: 1, radius: "0px", ratio: [0, 1] })).toEqual({ x: 1, y: 2, zoom: 1 });
  expect(cleanFrame({ x: 1, y: 2, zoom: 1, radius: "8px; color: red" })).toEqual({ x: 1, y: 2, zoom: 1 });
  expect(() => cleanFrame({ x: "1", y: 2, zoom: 1 })).toThrow();
});
