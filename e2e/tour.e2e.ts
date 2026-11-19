import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, PICTURES, runsDir, SLOW } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// The tour (Q328-Q340), for a new maker, on the recorded bakery: it opens once
// the first website is built, goes through its five steps (the page's own drawn
// in the page, ADR 0008) and closes; it does not open again by itself, and the
// Help menu starts it again, Escape ending it.
describe("the tour", () => {
  let launched: LaunchedApp;
  const { invoke, until, page } = previewDriver(() => launched);
  const w = () => launched.window;
  const shadow = "document.querySelector('upstart-editor').shadowRoot";
  const inPage = (testid: string) => `${shadow}.querySelector('[data-testid="${testid}"]')`;
  const shownInPage = (testid: string) =>
    page(`(() => { const el = ${inPage(testid)}; return !!el && getComputedStyle(el).display !== "none"; })()`);
  const step = () => w().getByTestId("tour").getAttribute("data-step");
  const settings = () => JSON.parse(readFileSync(join(launched.dataDir, "settings.json"), "utf8"));
  const helpTour = () =>
    launched.app.evaluate(({ Menu }) => {
      const help = Menu.getApplicationMenu()?.items.find((m) => m.role === "help");
      help?.submenu?.items.find((i) => i.label === "Tour of Upstart")?.click();
    });

  /** The page alone, which the interface's capture does not hold (a native view over it). */
  const capturePage = async (name: string) => {
    if (!PICTURES) return;
    const png = await launched.app.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const image = await (globalThis as any).upstart.preview.view.webContents.capturePage();
      return image.toPNG().toString("base64") as string;
    });
    writeFileSync(join(runsDir, `${name}.png`), Buffer.from(png, "base64"));
  };

  beforeAll(async () => {
    launched = await launchApp({ tour: true });
    await w().getByTestId("message-input").waitFor();
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test("a new maker has not seen it, and nothing opens before the first website is built", async () => {
    expect(settings().tourSeen).toBe(false);
    expect(await w().getByTestId("tour").count()).toBe(0);
  });

  test("the first website built: the tour opens at the conversation, the page dimmed", async () => {
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => w().locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    await w().getByTestId("tour").waitFor();
    expect(await step()).toBe("conversation");
    expect(await w().getByTestId("tour-count").textContent()).toBe("1 of 5");
    await until(() => shownInPage("page-tour-veil"));
    expect(await shownInPage("page-tour-bubble")).toBe(false);
    await launched.capture("tour-conversation");
  });

  test("Next goes through the five steps; the page's own and Publish's bubbles are drawn in the page", async () => {
    await w().getByTestId("tour-next").click();
    expect(await step()).toBe("page");
    await until(() => shownInPage("page-tour-bubble"));
    expect(await page(`${inPage("page-tour-bubble")}.textContent`)).toContain("2 of 5");
    await launched.capture("tour-page");
    await capturePage("tour-page-in-page");
    // The bubble's Next, in the page, goes back to the interface.
    await page(`${inPage("page-tour-next")}.click(), true`);
    await until(async () => (await step()) === "blocks");
    expect(await shownInPage("page-tour-bubble")).toBe(false);
    expect(await shownInPage("page-tour-veil")).toBe(true);
    await w().getByTestId("tour-next").click();
    expect(await step()).toBe("theme");
    await w().getByTestId("tour-next").click();
    expect(await step()).toBe("publish");
    await until(() => shownInPage("page-tour-bubble"));
    expect(await page(`${inPage("page-tour-next")}.textContent`)).toBe("Done");
    await launched.capture("tour-publish");
    await capturePage("tour-publish-in-page");
    await page(`${inPage("page-tour-next")}.click(), true`);
    await w().getByTestId("tour").waitFor({ state: "detached" });
    await until(async () => !(await shownInPage("page-tour-veil")));
    await until(async () => settings().tourSeen === true);
  });

  test("seen, it does not open again by itself", async () => {
    await invoke("conversation:send", "Make the title larger.");
    await until(
      () =>
        w()
          .locator('[data-testid="agent-message"][data-status="done"]')
          .count()
          .then((n) => n >= 2),
      30_000,
    );
    await new Promise((r) => setTimeout(r, 500));
    expect(await w().getByTestId("tour").count()).toBe(0);
  });

  test("the Help menu starts it again; Escape ends it", async () => {
    await helpTour();
    await w().getByTestId("tour").waitFor();
    expect(await step()).toBe("conversation");
    await w().keyboard.press("Escape");
    await w().getByTestId("tour").waitFor({ state: "detached" });
    await until(async () => !(await shownInPage("page-tour-veil")));
  });
});
