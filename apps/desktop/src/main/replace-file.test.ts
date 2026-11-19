import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { replaceFile } from "./replace-file";

test("a file written beside its place is moved over it whole", () => {
  const dir = mkdtempSync(join(tmpdir(), "replace-"));
  writeFileSync(join(dir, "a.json"), "old");
  writeFileSync(join(dir, "a.json.tmp"), "new");
  replaceFile(join(dir, "a.json.tmp"), join(dir, "a.json"));
  expect(readFileSync(join(dir, "a.json"), "utf8")).toBe("new");
});

test("an error other than a held file is not tried again", () => {
  const dir = mkdtempSync(join(tmpdir(), "replace-"));
  expect(() => replaceFile(join(dir, "missing"), join(dir, "a.json"), 10, "win32")).toThrow(/ENOENT/);
});
