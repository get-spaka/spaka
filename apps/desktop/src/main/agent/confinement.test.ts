import { expect, test } from "vitest";
import { cleanEnv, confinement, grantedInSandbox, ruleDir, withPathFirst } from "./confinement";

test("the agent's environment keeps nothing of the session that launched the app", () => {
  const env = cleanEnv({
    PATH: "/usr/bin",
    HOME: "/Users/x",
    ANTHROPIC_API_KEY: "k",
    CLAUDE_CONFIG_DIR: "/c",
    CLAUDECODE: "1",
    ELECTRON_RUN_AS_NODE: "1",
    SPAKA_BACKGROUND: "1",
  });
  expect(env).toEqual({ PATH: "/usr/bin", HOME: "/Users/x" });
});

test("the agent writes only in the project and the temporary folder, and never asks", () => {
  const options = confinement({
    projectDir: "/Users/x/Documents/Spaka/site",
    readable: ["/Users/x/bin"],
    platform: "darwin",
  });
  expect(options.cwd).toBe("/Users/x/Documents/Spaka/site");
  expect(options.permissionMode).toBe("acceptEdits");
  // Where the sandbox is not known to hold, auto mode stays (Q221).
  expect(confinement({ projectDir: "/p", readable: [], platform: "win32" }).permissionMode).toBe("auto");
  expect(options.settingSources).toEqual([]);
  expect(options.settings.permissions).toMatchObject({
    blockWritesOutsideWorkingDirectories: true,
  });
  // It would take AskUserQuestion away: canUseTool refuses instead.
  expect(options.settings.permissions).not.toHaveProperty("denyInsteadOfPrompting");
  expect(options.settings.sandbox).toMatchObject({
    enabled: true,
    failIfUnavailable: true,
    allowUnsandboxedCommands: false,
  });
  expect(options.settings.sandbox).toMatchObject({
    filesystem: { allowRead: ["/Users/x/Documents/Spaka/site", "/Users/x/bin"] },
  });
});

test("on Windows, which has no sandbox for the shell, auto mode guards it, and the rules take Windows paths", () => {
  const options = confinement({
    projectDir: "C:\\Users\\x\\Documents\\Spaka\\site",
    readable: [],
    skillsDir: "C:\\Users\\x\\AppData\\Roaming\\Spaka\\skills\\site",
    platform: "win32",
  });
  expect(options.permissionMode).toBe("auto");
  expect(options.settings.sandbox).toEqual({ enabled: false });
  expect(options.settings.permissions.deny).toEqual([
    "Edit(//c/Users/x/AppData/Roaming/Spaka/skills/site/**)",
    "Edit(//c/Users/x/Documents/Spaka/site/node_modules/**)",
  ]);
  expect(ruleDir("/Users/x/skills", "darwin")).toBe("//Users/x/skills");
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
  expect(ok("mcp__spaka__use_block", { page: "pages/index.liquid" })).toBe(true);
  expect(ok("mcp__notion__search", { query: "x" })).toBe(true);
  expect(ok("Skill", { skill: "spaka:gallery" })).toBe(true);
});

test("the app's node launcher comes first on the search path, under one key", () => {
  expect(withPathFirst({ PATH: "/usr/bin:/bin", HOME: "/h" }, "/data/bin", "darwin")).toEqual({
    PATH: "/data/bin:/usr/bin:/bin",
    HOME: "/h",
  });
  expect(withPathFirst({ Path: "C:\\Windows" }, "C:\\data\\bin", "win32")).toEqual({
    Path: "C:\\data\\bin;C:\\Windows",
  });
  expect(withPathFirst({}, "/data/bin", "linux")).toEqual({ PATH: "/data/bin" });
});
