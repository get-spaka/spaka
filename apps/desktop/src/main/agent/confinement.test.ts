import { expect, test } from "vitest";
import { cleanEnv, confinement } from "./confinement";

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
