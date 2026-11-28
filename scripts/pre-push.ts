// Before a push (Lefthook's pre-push, Q446): the types and the unit tests,
// then the whole-app checks the pushed change calls for (e2e/changed.ts),
// after building the app, as the CI will. The change is what the push brings:
// for each branch it sends (Git says which on the hook's input, Lefthook's
// use_stdin), the difference from the commit GitHub has of it, or from main
// for a new branch. Run by hand, it is the current branch's, from its remote
// branch or main. `git push --no-verify` skips it once; `--list` only says
// what it would run.
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checksFor, pushed } from "../e2e/changed.ts";

const root = join(import.meta.dirname, "..");
const e2e = join(root, "e2e");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const attempt = (...args: string[]) => {
  try {
    return git(...args);
  } catch {
    return "";
  }
};

const has = (sha: string) => {
  try {
    git("cat-file", "-e", `${sha}^{commit}`);
    return true;
  } catch {
    return false;
  }
};
const main = attempt("rev-parse", "--verify", "--quiet", "origin/main");
const files = (from: string, to: string) => git("diff", "--name-only", from, to).split("\n").filter(Boolean);

/**
 * The files the push changes, or undefined when it cannot tell (no main to
 * compare with): then every check runs. A branch GitHub has is compared with
 * GitHub's commit, so a stack rebased on a fix below brings that fix alone.
 */
function change(): { changed: string[]; since: string } | undefined {
  const input = process.stdin.isTTY ? "" : readFileSync(0, "utf8");
  const sent = pushed(input);
  if (!input.trim()) {
    const remote = attempt("rev-parse", "--verify", "--quiet", "@{push}") || main;
    const base = remote && attempt("merge-base", "HEAD", remote);
    return base ? { changed: files(base, "HEAD"), since: `since ${base.slice(0, 7)}` } : undefined;
  }
  const changed = new Set<string>();
  for (const { local, remote } of sent) {
    const from = remote && has(remote) ? remote : main && attempt("merge-base", local, main);
    if (!from) return undefined;
    for (const file of files(from, local)) changed.add(file);
  }
  const names = sent.map((s) => s.ref.replace("refs/heads/", "")).join(", ");
  return { changed: [...changed].sort(), since: names ? `in ${names}` : "(branches deleted only)" };
}
const found = change();
const changed = found?.changed ?? [];

// packaged.e2e.ts checks the packaged app, which the CI builds in its own job.
const checks = readdirSync(e2e)
  .filter((f) => f.endsWith(".e2e.ts") && f !== "packaged.e2e.ts")
  .sort();
const imports = (file: string) =>
  [...readFileSync(join(e2e, file), "utf8").matchAll(/from "\.\/([^"/]+\.ts)"/g)].map((m) => m[1]!);
const chosen = found ? checksFor(changed, checks, imports) : checks;

const run = (what: string, args: string[]) => {
  console.log(`\npre-push: ${what}`);
  const done = spawnSync("pnpm", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (done.status !== 0) {
    console.error(`\npre-push: ${what} failed; fix it, or push with --no-verify to skip the checks once.`);
    process.exit(done.status ?? 1);
  }
};

console.log(
  `pre-push: ${found ? `${changed.length} files changed ${found.since}` : "no main to compare with"}; ${chosen.length ? `whole-app checks: ${chosen.join(", ")}` : "no whole-app check"}.`,
);
// `node scripts/pre-push.ts --list` says what a push would check, and checks nothing.
if (process.argv.includes("--list")) process.exit(0);
// A push that changes no file (a branch deleted, or sent as GitHub has it) has nothing to check.
if (found && !changed.length) process.exit(0);
run("types", ["typecheck"]);
run("unit tests", ["exec", "vitest", "run", "--bail", "1"]);
if (chosen.length) {
  run("build", ["--filter", "@spaka/desktop", "build"]);
  run("background Electron", ["background-electron"]);
  // Vitest takes a name as part of a path: gallery.e2e.ts also runs agent-gallery.e2e.ts, which without a real
  // agent skips at once.
  run("whole-app checks", ["exec", "vitest", "run", "--config", "e2e/vitest.config.ts", "--bail", "1", ...chosen]);
}
