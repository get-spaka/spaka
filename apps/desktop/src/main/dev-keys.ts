// The author's own keys, for the checks with a real model and the template
// command line (Q438): from the terminal first, else from the repository's
// .env, which git ignores. Never printed, and never read by the app itself,
// whose accounts hold the maker's keys.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";

/**
 * The checkout holding `from`, then the main checkout when that one is a git
 * worktree: a .env at the main checkout's root serves all its worktrees.
 */
export function checkouts(from: string): string[] {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      const git = join(dir, ".git");
      // A worktree's .git is a file: "gitdir: <main checkout>/.git/worktrees/<name>".
      const main =
        existsSync(git) && !statSync(git).isDirectory()
          ? /^gitdir: (.+)\/\.git\/worktrees\//m.exec(readFileSync(git, "utf8"))?.[1]
          : undefined;
      return main && main !== dir ? [dir, main] : [dir];
    }
    if (dirname(dir) === dir) return [];
  }
}

/** A key of the author's: set in the terminal, or in the .env of this checkout or of its main checkout. */
export function devKey(name: string, from = process.cwd()): string | undefined {
  const set = process.env[name]?.trim();
  if (set) return set;
  for (const root of checkouts(from)) {
    const file = join(root, ".env");
    if (!existsSync(file)) continue;
    const value = parseEnv(readFileSync(file, "utf8"))[name]?.trim();
    if (value) return value;
  }
  return undefined;
}
