// Run by `pnpm install` (prepare): turns on the hooks committed in .githooks,
// here and in the templates' submodule once it is checked out, so that a
// commit runs the lint the CI runs. Outside a git checkout it does nothing.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();

for (const dir of [root, join(root, "apps/desktop/templates")]) {
  if (!existsSync(join(dir, ".git")) || !existsSync(join(dir, ".githooks/pre-commit"))) continue;
  try {
    if (git(dir, "config", "--get", "core.hooksPath") === ".githooks") continue;
  } catch {
    // Not set yet.
  }
  try {
    git(dir, "config", "core.hooksPath", ".githooks");
    console.log(`git hooks on in ${dir === root ? "the repository" : "apps/desktop/templates"} (.githooks)`);
  } catch {
    // Not a git checkout.
  }
}
