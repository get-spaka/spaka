// Before a push (Lefthook's pre-push, Q446): the types and the unit tests,
// then the whole-app checks the pushed change calls for (e2e/changed.ts),
// after building the app, as the CI will. The change is what the branch has
// that its remote branch has not, or main's when it has none yet.
// `git push --no-verify` skips it once; `--list` only says what it would run.
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checksFor } from "../e2e/changed.ts";

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

const remote =
  attempt("rev-parse", "--verify", "--quiet", "@{push}") || attempt("rev-parse", "--verify", "--quiet", "origin/main");
const base = remote && attempt("merge-base", "HEAD", remote);
const changed = base ? git("diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean) : [];

// packaged.e2e.ts checks the packaged app, which the CI builds in its own job.
const checks = readdirSync(e2e)
  .filter((f) => f.endsWith(".e2e.ts") && f !== "packaged.e2e.ts")
  .sort();
const imports = (file: string) =>
  [...readFileSync(join(e2e, file), "utf8").matchAll(/from "\.\/([^"/]+\.ts)"/g)].map((m) => m[1]!);
const chosen = base ? checksFor(changed, checks, imports) : checks;

const run = (what: string, args: string[]) => {
  console.log(`\npre-push: ${what}`);
  const done = spawnSync("pnpm", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (done.status !== 0) {
    console.error(`\npre-push: ${what} failed; fix it, or push with --no-verify to skip the checks once.`);
    process.exit(done.status ?? 1);
  }
};

console.log(
  `pre-push: ${changed.length} files changed${base ? ` since ${base.slice(0, 7)}` : ""}; ${chosen.length ? `whole-app checks: ${chosen.join(", ")}` : "no whole-app check"}.`,
);
// `node scripts/pre-push.ts --list` says what a push would check, and checks nothing.
if (process.argv.includes("--list")) process.exit(0);
run("types", ["typecheck"]);
run("unit tests", ["exec", "vitest", "run", "--bail", "1"]);
if (chosen.length) {
  run("build", ["--filter", "@upstart/desktop", "build"]);
  run("background Electron", ["background-electron"]);
  // Vitest takes a name as part of a path: gallery.e2e.ts also runs agent-gallery.e2e.ts, which without a real
  // agent skips at once.
  run("whole-app checks", ["exec", "vitest", "run", "--config", "e2e/vitest.config.ts", "--bail", "1", ...chosen]);
}
