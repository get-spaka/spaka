import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";

// Windows (Q375): until Git for Windows is installed, the window asks for it.
// Shown on any system for this check (UPSTART_GIT_BASH_MISSING).
describe("Git for Windows still to install", () => {
  let launched: LaunchedApp;

  beforeAll(async () => {
    launched = await launchApp({ env: { UPSTART_GIT_BASH_MISSING: "1" } });
  });
  afterAll(async () => {
    await launched?.close();
  });

  test("the window asks for it, with its download and Check again, and nothing else", async () => {
    const { window } = launched;
    await window.getByTestId("git-for-windows").waitFor();
    await expect(window.getByTestId("sidebar").count()).resolves.toBe(0);
    await launched.capture("git-for-windows");
    await window.getByTestId("git-check").click();
    await window.getByTestId("git-missing").waitFor();
  });
});
