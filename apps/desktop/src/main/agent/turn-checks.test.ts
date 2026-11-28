import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { TurnChecks } from "./turn-checks";

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

test("after a call that wrote a datasource file that does not read, the agent is told, whichever tool wrote it", () => {
  dir = mkdtempSync(join(tmpdir(), "spaka-checks-"));
  mkdirSync(join(dir, "data/events"), { recursive: true });
  writeFileSync(join(dir, "data/events/_datasource.yaml"), "label: Events\nfields:\n  - name: title\n    kind: text\n");
  writeFileSync(join(dir, "data/events/jazz.md"), "---\ntitle: [Jazz and wine\n---\n");
  const checks = new TurnChecks(dir);
  for (const tool of ["Write", "Edit", "Append"])
    expect(checks.afterTool(tool, { file_path: join(dir, "data/events/jazz.md") })).toMatch(/data\/events\/jazz\.md/);
  expect(checks.afterTool("Read", { file_path: join(dir, "data/events/jazz.md") })).toBeUndefined();
  expect(checks.afterTool("Write", { file_path: join(dir, "pages/index.liquid") })).toBeUndefined();
});

test("an agent that left nothing behind may stop", () => {
  dir = mkdtempSync(join(tmpdir(), "spaka-checks-"));
  const checks = new TurnChecks(dir);
  expect(checks.beforeStop(false)).toBeUndefined();
  expect(checks.beforeStop(true)).toBeUndefined();
});
