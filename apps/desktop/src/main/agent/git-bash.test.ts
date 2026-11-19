import { join } from "node:path";
import { expect, test } from "vitest";
import { findGitBash, gitBashEnv } from "./git-bash";

const lookup = (present: string[], where: string[] = [], env: Record<string, string> = {}) => ({
  env: { ProgramFiles: "C:/Program Files", LOCALAPPDATA: "C:/Users/x/AppData/Local", ...env },
  exists: (p: string) => present.includes(p),
  whereGit: () => where,
});

test("Git Bash is found where Git for Windows installs it, for every user or for this user", () => {
  const forAll = join("C:/Program Files", "Git", "bin", "bash.exe");
  expect(findGitBash(lookup([forAll]))).toBe(forAll);
  const forMe = join("C:/Users/x/AppData/Local", "Programs", "Git", "bin", "bash.exe");
  expect(findGitBash(lookup([forMe]))).toBe(forMe);
});

test("else next to the git on the PATH; nothing when Git for Windows is not installed", () => {
  const bash = join("D:/tools/Git/cmd", "..", "bin", "bash.exe");
  expect(findGitBash(lookup([bash], ["D:/tools/Git/cmd/git.exe"]))).toBe(bash);
  expect(findGitBash(lookup([], ["D:/tools/Git/cmd/git.exe"]))).toBeUndefined();
  expect(findGitBash(lookup([]))).toBeUndefined();
});

test("the agent gets Git Bash as its shell and no PowerShell tool", () => {
  expect(gitBashEnv("C:/Program Files/Git/bin/bash.exe")).toEqual({
    CLAUDE_CODE_GIT_BASH_PATH: "C:/Program Files/Git/bin/bash.exe",
    CLAUDE_CODE_USE_POWERSHELL_TOOL: "0",
  });
  expect(gitBashEnv(undefined)).toEqual({});
});
