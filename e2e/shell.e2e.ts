import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, watchFront } from "./app.ts";

describe("the app's shell, launched in the background", () => {
  let launched: LaunchedApp;
  let front: ReturnType<typeof watchFront>;
  let frontBefore: string[];

  beforeAll(async () => {
    frontBefore = watchFront().stop();
    front = watchFront();
    launched = await launchApp();
  });
  afterAll(async () => {
    await launched?.close();
  });

  test("shows the three columns", async () => {
    const { window } = launched;
    await window.getByTestId("sidebar").waitFor();
    await expect(window.getByTestId("conversation").isVisible()).resolves.toBe(true);
    await expect(window.getByTestId("preview").isVisible()).resolves.toBe(true);
    const file = await launched.capture("shell");
    expect(file).toMatch(/shell\.png$/);
  });

  test("the sidebar collapses and comes back", async () => {
    const { window } = launched;
    await window.getByTitle("Hide the sidebar").click();
    await expect(window.getByTestId("sidebar").count()).resolves.toBe(0);
    await window.getByTitle("Show the sidebar").click();
    await window.getByTestId("sidebar").waitFor();
  });

  test("the interface reaches the main process only through the contract", async () => {
    const { window } = launched;
    const info = await window.evaluate(() => (window as any).upstart.invoke("app:info"));
    expect(info.background).toBe(true);
    const refused = await window.evaluate(() =>
      (window as any).upstart.invoke("nope:channel").then(
        () => "answered",
        (e: Error) => e.message,
      ),
    );
    expect(refused).toMatch(/not allowed/);
    const hasNode = await window.evaluate(() => typeof (globalThis as any).require);
    expect(hasNode).toBe("undefined");
  });

  test("the window is never shown and never focused", async () => {
    const state = await launched.app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      return { visible: win.isVisible(), focused: win.isFocused() };
    });
    expect(state).toEqual({ visible: false, focused: false });
  });

  test.runIf(process.platform === "darwin")("never comes to the front", async () => {
    await launched.window.waitForTimeout(300);
    const seen = front.stop();
    const fronts = seen.filter((s) => s.startsWith("front:"));
    expect(fronts).toEqual(frontBefore.filter((s) => s.startsWith("front:")));
    expect(seen).not.toContain("electron:Foreground");
  });
});
