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

test("after the agent wrote package.json, or ran a command, its dependencies are put back (Q536)", () => {
  dir = mkdtempSync(join(tmpdir(), "spaka-checks-"));
  const asked: string[] = [];
  const checks = new TurnChecks(dir, () => {
    asked.push("put back");
    return "Spaka put package.json's dependencies back as installed.";
  });
  for (const tool of ["Write", "Edit", "Append"])
    expect(checks.afterTool(tool, { file_path: join(dir, "package.json") })).toMatch(/^Spaka put package\.json/);
  expect(checks.afterTool("Bash", { command: "npm pkg set dependencies.x=1" })).toMatch(/^Spaka put package\.json/);
  expect(checks.afterTool("Write", { file_path: join(dir, "pages/package.json") })).toBeUndefined();
  expect(checks.afterTool("Read", { file_path: join(dir, "package.json") })).toBeUndefined();
  expect(asked).toHaveLength(4);
});

test("a script it wrote that imports a package not installed is told at once (ADR 0013)", () => {
  dir = mkdtempSync(join(tmpdir(), "spaka-checks-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "node_modules/motion"), { recursive: true });
  writeFileSync(join(dir, "node_modules/motion/package.json"), JSON.stringify({ name: "motion", version: "14.14.0" }));
  writeFileSync(
    join(dir, "scripts/reveal.js"),
    'import { animate } from "motion";\nimport Lenis from "lenis";\nexport function start() {}\n',
  );
  const checks = new TurnChecks(dir);
  expect(checks.afterTool("Write", { file_path: join(dir, "scripts/reveal.js") })).toBe(
    "scripts/reveal.js imports lenis, which is not installed: add it with add_package first.",
  );
  writeFileSync(join(dir, "scripts/reveal.js"), 'import { animate } from "motion";\nexport function start() {}\n');
  expect(checks.afterTool("Edit", { file_path: "scripts/reveal.js" })).toBeUndefined();
  expect(checks.afterTool("Read", { file_path: join(dir, "scripts/reveal.js") })).toBeUndefined();
});
