import { expect, test } from "vitest";
import { cleanEnv, confinement, grantedInSandbox } from "./confinement";

test("the agent's environment keeps nothing of the session that launched the app", () => {
  const env = cleanEnv({
    PATH: "/usr/bin",
    HOME: "/Users/x",
    ANTHROPIC_API_KEY: "k",
    CLAUDE_CONFIG_DIR: "/c",
    CLAUDECODE: "1",
    ELECTRON_RUN_AS_NODE: "1",
    UPSTART_BACKGROUND: "1",
  });
  expect(env).toEqual({ PATH: "/usr/bin", HOME: "/Users/x" });
});

test("the agent writes only in the project and the temporary folder, and never asks", () => {
  const options = confinement({ projectDir: "/Users/x/Documents/Upstart/site", readable: ["/Users/x/bin"] });
  expect(options.cwd).toBe("/Users/x/Documents/Upstart/site");
  expect(options.permissionMode).toBe("acceptEdits");
  // Where the sandbox is not known to hold, auto mode stays (Q221).
  expect(confinement({ projectDir: "/p", readable: [], platform: "win32" }).permissionMode).toBe("auto");
  expect(options.settingSources).toEqual([]);
  expect(options.settings.permissions).toMatchObject({
    blockWritesOutsideWorkingDirectories: true,
    denyInsteadOfPrompting: true,
  });
  expect(options.settings.sandbox).toMatchObject({
    enabled: true,
    failIfUnavailable: true,
    allowUnsandboxedCommands: false,
  });
  expect(options.settings.sandbox.filesystem.allowRead).toEqual(["/Users/x/Documents/Upstart/site", "/Users/x/bin"]);
});

test("without auto mode, a sandboxed command, a connector's tool or a skill is granted; nothing else (Q221)", () => {
  const ok = (tool: string, input: Record<string, unknown> = {}) => grantedInSandbox(tool, input, "darwin");
  expect(grantedInSandbox("Bash", { command: "ls" }, "linux")).toBe(false);
  expect(ok("Bash", { command: "cd data && rm team/emma-clarke.md" })).toBe(true);
  expect(ok("Bash", { command: "rm data/menu/*.md\nsed -i '' 's/a/b/' parts/header.liquid" })).toBe(true);
  expect(ok("Bash", { command: "cd data && git status" })).toBe(true);
  // Out of the sandbox, or a file tool asking (it writes outside the project): refused.
  expect(ok("Bash", { command: "rm x", dangerouslyDisableSandbox: true })).toBe(false);
  expect(ok("Bash", {})).toBe(false);
  expect(ok("Write", { file_path: "/Users/x/escape.txt" })).toBe(false);
  expect(ok("Edit", { file_path: "/Users/x/.zshrc" })).toBe(false);
  expect(ok("mcp__upstart__use_block", { page: "pages/index.liquid" })).toBe(true);
  expect(ok("mcp__notion__search", { query: "x" })).toBe(true);
  expect(ok("Skill", { skill: "upstart:gallery" })).toBe(true);
});
