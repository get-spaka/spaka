import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { diskSource } from "./node.ts";

test("reads a project folder, skipping hidden folders, and never outside it", () => {
  const root = mkdtempSync(join(tmpdir(), "upstart-runtime-"));
  mkdirSync(join(root, "pages/blog"), { recursive: true });
  mkdirSync(join(root, ".upstart/skills"), { recursive: true });
  writeFileSync(join(root, "pages/index.liquid"), "home");
  writeFileSync(join(root, "pages/blog/a.liquid"), "a");
  writeFileSync(join(root, ".upstart/project.json"), "{}");
  writeFileSync(join(root, "secret.txt"), "s");
  const source = diskSource(root);
  expect(source.list("pages")).toEqual(["pages/blog/a.liquid", "pages/index.liquid"]);
  expect(source.read("pages/index.liquid")).toBe("home");
  expect(source.read("pages/../secret.txt")).toBeUndefined();
  expect(source.read("nope.liquid")).toBeUndefined();
  expect(source.list("nope")).toEqual([]);
});
