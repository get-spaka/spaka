import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";

// The app's own update (Q367, Q378). A check in the background never looks
// for one, so the update's state is sent to the interface as main would.
describe("an update ready to restart into", () => {
  let launched: LaunchedApp;

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("sidebar").waitFor();
  });
  afterAll(async () => {
    await launched?.close();
  });

  const send = (state: object) =>
    launched.app.evaluate(({ BrowserWindow }, state) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send("app:update", state);
    }, state);

  test("nothing shows until an update is downloaded", async () => {
    const { window } = launched;
    await send({ state: "downloading", version: "9.9.9" });
    await expect(window.getByTestId("update-note").count()).resolves.toBe(0);
  });

  test("the sidebar's foot says it is ready, with Restart; a dot shows it while the sidebar is hidden", async () => {
    const { window } = launched;
    await send({ state: "ready", version: "9.9.9" });
    await window.getByTestId("update-note").waitFor();
    await expect(window.getByTestId("update-restart").textContent()).resolves.toBe("Restart");
    await launched.capture("update-note");
    await window.getByLabel("Hide the sidebar").click();
    await window.getByTestId("update-dot").waitFor();
    await launched.capture("update-dot");
    await window.getByLabel("Show the sidebar: an update is ready").click();
    await window.getByTestId("update-note").waitFor();
  });

  test("the About page says which version waits for the restart", async () => {
    const { window } = launched;
    await window.evaluate(() =>
      (window as unknown as { upstart: { invoke(c: string, p: string): Promise<void> } }).upstart.invoke(
        "settings:open",
        "about",
      ),
    );
    await expect(window.getByTestId("about-update").textContent()).resolves.toContain("9.9.9");
  });
});
