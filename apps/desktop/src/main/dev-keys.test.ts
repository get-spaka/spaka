import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { checkouts, devKey } from "./dev-keys";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "spaka-dev-keys-"));
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, "pnpm-workspace.yaml"), "");
  mkdirSync(join(root, "apps/desktop"), { recursive: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

/** A worktree of the checkout at `root`, inside it as Claude's are. */
function worktree(): string {
  const dir = join(root, ".claude/worktrees/w");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "");
  writeFileSync(join(dir, ".git"), `gitdir: ${root}/.git/worktrees/w\n`);
  return dir;
}

test("a key set in the terminal wins over the .env", () => {
  writeFileSync(join(root, ".env"), "SPAKA_TEST_KEY=from-file\n");
  vi.stubEnv("SPAKA_TEST_KEY", "from-terminal");
  expect(devKey("SPAKA_TEST_KEY", join(root, "apps/desktop"))).toBe("from-terminal");
});

test("the .env at the checkout's root is read from any folder of it", () => {
  vi.stubEnv("SPAKA_TEST_KEY", "");
  writeFileSync(join(root, ".env"), '# the author\'s keys\nSPAKA_TEST_KEY="from-file"\nOTHER=\n');
  expect(devKey("SPAKA_TEST_KEY", join(root, "apps/desktop"))).toBe("from-file");
  expect(devKey("OTHER", root)).toBeUndefined();
  expect(devKey("MISSING", root)).toBeUndefined();
});

test("a worktree reads its own .env, else its main checkout's", () => {
  vi.stubEnv("SPAKA_TEST_KEY", "");
  const dir = worktree();
  expect(checkouts(dir)).toEqual([dir, root]);
  writeFileSync(join(root, ".env"), "SPAKA_TEST_KEY=main\n");
  expect(devKey("SPAKA_TEST_KEY", dir)).toBe("main");
  writeFileSync(join(dir, ".env"), "SPAKA_TEST_KEY=worktree\n");
  expect(devKey("SPAKA_TEST_KEY", dir)).toBe("worktree");
});

test("outside a checkout there is no .env to read", () => {
  vi.stubEnv("SPAKA_TEST_KEY", "");
  expect(checkouts(tmpdir())).toEqual([]);
  expect(devKey("SPAKA_TEST_KEY", tmpdir())).toBeUndefined();
});
