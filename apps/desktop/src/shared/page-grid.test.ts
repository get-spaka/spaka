import { expect, test } from "vitest";
import { copyOfPage, gridColumns, thumbnailScreen, thumbnailWidth } from "./page-grid";

test("at most three columns, a column fewer below 220 px each", () => {
  expect(gridColumns(1100)).toBe(3);
  expect(gridColumns(760)).toBe(3);
  expect(gridColumns(740)).toBe(2);
  expect(gridColumns(520)).toBe(2);
  expect(gridColumns(500)).toBe(1);
  expect(gridColumns(480)).toBe(1);
  expect(gridColumns(100)).toBe(1);
  // The thumbnails share the width.
  expect(thumbnailWidth(1048)).toBe(320);
  expect(thumbnailWidth(520)).toBe(226);
});

test("a page is laid out on a laptop's screen, or the device's, sideways when it is", () => {
  expect(thumbnailScreen(undefined, false)).toEqual({ width: 1280, height: 800, mobile: false });
  expect(thumbnailScreen({ width: 393, height: 852 }, false)).toEqual({ width: 393, height: 852, mobile: true });
  expect(thumbnailScreen({ width: 393, height: 852 }, true)).toEqual({ width: 852, height: 393, mobile: true });
});

test("a copy of a page takes the next free address beside it", () => {
  expect(copyOfPage("pages/menu.liquid", ["pages/index.liquid", "pages/menu.liquid"])).toBe("pages/menu-2.liquid");
  expect(copyOfPage("pages/menu.liquid", ["pages/menu.liquid", "pages/menu-2.liquid"])).toBe("pages/menu-3.liquid");
  expect(copyOfPage("pages/menu-2.liquid", ["pages/menu.liquid", "pages/menu-2.liquid"])).toBe("pages/menu-3.liquid");
  expect(copyOfPage("pages/shop/cakes.html", [])).toBe("pages/shop/cakes-2.html");
  expect(copyOfPage("pages/index.liquid", ["pages/index.liquid"])).toBe("pages/index-2.liquid");
});
