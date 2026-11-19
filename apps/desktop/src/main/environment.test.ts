import { describe, expect, test } from "vitest";
import { readEnvironment } from "./environment";

describe("readEnvironment", () => {
  test("defaults to a normal run that creates projects in Documents/Upstart", () => {
    const env = readEnvironment({ HOME: "/Users/someone" });
    expect(env.background).toBe(false);
    expect(env.dataDir).toBeUndefined();
    expect(env.projectsDir).toMatch(/Documents[\\/]Upstart$/);
  });

  test("a check runs in the background with its own folders", () => {
    const env = readEnvironment({
      UPSTART_BACKGROUND: "1",
      UPSTART_DATA_DIR: "/tmp/d",
      UPSTART_PROJECTS_DIR: "/tmp/p",
    });
    expect(env).toMatchObject({ background: true, dataDir: "/tmp/d", projectsDir: "/tmp/p", agentReplay: undefined });
  });
});
