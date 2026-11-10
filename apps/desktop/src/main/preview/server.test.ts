import { createRequire } from "node:module";
import { VENDOR } from "@upstart/runtime";
import { expect, test } from "vitest";
import { safeJoin } from "./server";

test("every library the preview serves resolves from the app", () => {
  const appRequire = createRequire(import.meta.url);
  for (const vendor of Object.values(VENDOR)) expect(() => appRequire.resolve(vendor.module)).not.toThrow();
});

test("a project file is served only from inside the project, never from a hidden folder", () => {
  expect(safeJoin("/p", "/img/a.png")).toBe("/p/img/a.png");
  expect(safeJoin("/p", "/../etc/passwd")).toBe("/p/etc/passwd");
  expect(safeJoin("/p", "/.upstart/project.json")).toBeUndefined();
  expect(safeJoin("/p", "/a/../../b")).toBe("/p/b");
});

test("a page whose body has not started does not replace the page shown", async () => {
  const { hasVisibleBody } = await import("./preview");
  expect(hasVisibleBody('<html><head><title>x</title></head><body data-up-src="a">\n</body></html>')).toBe(false);
  expect(hasVisibleBody("<html><head><title>x</title></head>")).toBe(false);
  expect(hasVisibleBody('<html><body><script>var a = 1</script><div class="hero"></div></body>')).toBe(false);
  expect(hasVisibleBody("<html><body><header><a>Fleur</a></header>")).toBe(true);
  expect(hasVisibleBody('<html><body><svg viewBox="0 0 1 1"></svg>')).toBe(true);
});
