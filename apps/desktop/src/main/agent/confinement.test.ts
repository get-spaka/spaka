import { expect, test } from "vitest";
import { cleanEnv, confinement, sandboxedCdGranted } from "./confinement";

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
  expect(options.permissionMode).toBe("auto");
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

test("a cd joined to a command that writes is granted only inside the sandbox and the project (Q220)", () => {
  const project = "/Users/x/Documents/Upstart/site";
  const ok = (command: string, extra: Record<string, unknown> = {}) =>
    sandboxedCdGranted(project, "Bash", { command, ...extra });
  expect(ok("cd data && rm team/emma-clarke.md team/ravi-shah.md")).toBe(true);
  expect(ok("cd data/menu; perl -pi -e 's/a/b/' x.md")).toBe(true);
  expect(ok(`cd "${project}/data" && rm team/x.md`)).toBe(true);
  expect(ok("cd . && rm data/x.md")).toBe(true);
  // Outside the project, out of the sandbox, a second cd, git, or another tool: refused as before.
  expect(ok("cd .. && rm -rf site")).toBe(false);
  expect(ok("cd /tmp && rm x")).toBe(false);
  expect(ok("cd ~ && rm x")).toBe(false);
  expect(ok("cd data && rm x", { dangerouslyDisableSandbox: true })).toBe(false);
  expect(ok("cd data && cd .. && rm x")).toBe(false);
  expect(ok("cd data && git status")).toBe(false);
  expect(ok("rm data/x.md")).toBe(false);
  expect(ok("cd $HOME && rm x")).toBe(false);
  expect(sandboxedCdGranted(project, "Write", { command: "cd data && rm x" })).toBe(false);
});
