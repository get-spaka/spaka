// On Windows, Claude's shell is Git Bash, from Git for Windows, which Upstart
// asks the maker to install at the first launch (Q375): the official binary
// has no sandbox there, and Upstart keeps one shell, bash, as elsewhere.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Where Git for Windows is downloaded from. */
export const GIT_FOR_WINDOWS_URL = "https://git-scm.com/downloads/win";

type Lookup = {
  env: Record<string, string | undefined>;
  exists: (path: string) => boolean;
  /** The paths `where git` prints, or none. */
  whereGit: () => string[];
};

const systemLookup: Lookup = {
  env: process.env,
  exists: existsSync,
  whereGit: () => {
    try {
      return execFileSync("where", ["git"], { encoding: "utf8", windowsHide: true, timeout: 5000 })
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  },
};

/**
 * Git Bash's bash.exe: in Git for Windows' usual folders (for every user, or
 * for this user only), else next to the git that is on the PATH
 * (`Git\cmd\git.exe` has `Git\bin\bash.exe`). Undefined when Git for Windows
 * is not installed.
 */
export function findGitBash(lookup: Lookup = systemLookup): string | undefined {
  const { env } = lookup;
  const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Programs")];
  const candidates = roots.filter((r): r is string => !!r).map((r) => join(r, "Git", "bin", "bash.exe"));
  for (const git of lookup.whereGit()) {
    // Git\cmd\git.exe, Git\bin\git.exe or Git\mingw64\bin\git.exe.
    const dir = dirname(git);
    candidates.push(
      join(dir, "..", "bin", "bash.exe"),
      join(dir, "bash.exe"),
      join(dir, "..", "..", "bin", "bash.exe"),
    );
  }
  return candidates.find((c) => lookup.exists(c));
}

/** The agent's environment for its shell on Windows: Git Bash, and no PowerShell tool beside it. */
export function gitBashEnv(bash: string | undefined): Record<string, string> {
  return bash ? { CLAUDE_CODE_GIT_BASH_PATH: bash, CLAUDE_CODE_USE_POWERSHELL_TOOL: "0" } : {};
}
