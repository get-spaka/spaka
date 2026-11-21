// Run by `pnpm install` (prepare) and after a checkout or a pull: installs the
// Git hooks of lefthook.yml here and, once it is checked out, in the
// templates' submodule, whose lefthook.yml runs its own lint. Quiet when
// there is nothing to do; outside a Git checkout, in the CI, it does nothing.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

if (process.env.CI) process.exit(0);
const root = join(import.meta.dirname, "..");
const lefthook = join(root, "node_modules/.bin", process.platform === "win32" ? "lefthook.cmd" : "lefthook");
if (!existsSync(lefthook)) process.exit(0);

for (const dir of [root, join(root, "apps/desktop/templates")]) {
  if (!existsSync(join(dir, ".git")) || !existsSync(join(dir, "lefthook.yml"))) continue;
  try {
    const hooksDir = execFileSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: dir }).toString().trim();
    const hook = resolve(dir, hooksDir, "pre-commit");
    if (existsSync(hook) && readFileSync(hook, "utf8").includes("lefthook")) continue;
    execFileSync(lefthook, ["install"], { cwd: dir, stdio: "ignore", shell: process.platform === "win32" });
    console.log(`Git hooks installed in ${dir === root ? "the repository" : "apps/desktop/templates"} (lefthook.yml)`);
  } catch {
    // Not a Git checkout, or Lefthook could not install: the CI still runs the lint.
  }
}
