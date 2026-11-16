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

  test("shows the sidebar and the start screen, with no website open (Q245)", async () => {
    const { window } = launched;
    await window.getByTestId("sidebar").waitFor();
    await expect(window.getByTestId("start").isVisible()).resolves.toBe(true);
    await expect(window.getByTestId("conversation").count()).resolves.toBe(0);
    await expect(window.getByTestId("preview").count()).resolves.toBe(0);
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

  // The macOS menus (Q335): each item with its shortcut, done by the interface as its button would.
  const menuItem = (accelerator: string) =>
    launched.app.evaluate(({ Menu }, accelerator) => {
      const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
        for (const i of items) {
          if (i.accelerator === accelerator) return i;
          const inner = i.submenu && find(i.submenu.items);
          if (inner) return inner;
        }
      };
      const item = find(Menu.getApplicationMenu()?.items ?? []);
      item?.click();
      return item?.label;
    }, accelerator);

  test("the menus list the commands with their shortcuts", async () => {
    const menus = await launched.app.evaluate(({ Menu }) =>
      (Menu.getApplicationMenu()?.items ?? []).map((m) => ({
        label: m.label,
        items: (m.submenu?.items ?? []).filter((i) => i.type !== "separator").map((i) => [i.label, i.accelerator]),
      })),
    );
    expect(menus.map((m) => m.label).slice(1)).toEqual(["File", "Edit", "View", "Window", "Help"]);
    const file = menus.find((m) => m.label === "File")!.items;
    expect(file.slice(0, 3)).toEqual([
      ["New Website", "CommandOrControl+N"],
      ["Open Folder…", "CommandOrControl+O"],
      ["Publish…", "Shift+CommandOrControl+P"],
    ]);
    expect(menus.find((m) => m.label === "Help")!.items.map(([label]) => label)).toEqual([
      "Tour of Upstart",
      "Ask the Agent",
      "Keyboard Shortcuts",
    ]);
  });

  test("Keyboard Shortcuts opens the sheet, which Escape closes; the sidebar's item hides and shows it", async () => {
    const { window } = launched;
    expect(await menuItem("CommandOrControl+/")).toBe("Keyboard Shortcuts");
    await window.getByTestId("shortcuts").waitFor();
    const publish = window.getByTestId("shortcuts-file").locator("div", { hasText: "Publish…" });
    expect(await publish.locator("kbd").textContent()).toBe("⇧⌘P");
    await launched.capture("shortcuts");
    await window.keyboard.press("Escape");
    await window.getByTestId("shortcuts").waitFor({ state: "detached" });
    await menuItem("Control+CommandOrControl+S");
    await window.getByTestId("sidebar").waitFor({ state: "detached" });
    await menuItem("Control+CommandOrControl+S");
    await window.getByTestId("sidebar").waitFor();
  });

  test("the interface reaches the main process only through the contract", async () => {
    const { window } = launched;
    // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge and the page's globals, untyped here
    const info = await window.evaluate(() => (window as any).upstart.invoke("app:info"));
    expect(info.background).toBe(true);
    const refused = await window.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge, untyped here
      (window as any).upstart.invoke("nope:channel").then(
        () => "answered",
        (e: Error) => e.message,
      ),
    );
    expect(refused).toMatch(/not allowed/);
    // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge and the page's globals, untyped here
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
    // Another app coming to the front meanwhile (the maker switching apps) also fails this: the message says which.
    expect(fronts, `apps seen in front: ${fronts.join(", ")}`).toEqual(
      frontBefore.filter((s) => s.startsWith("front:")),
    );
    // The app under test was seen, and never as an app of the foreground.
    expect(
      seen.some((s) => s.startsWith("electron:")),
      seen.join(", "),
    ).toBe(true);
    expect(seen).not.toContain("electron:Foreground");
  });
});
