// A template's adaptation, page type by page type (Q302-Q313), on a made-up
// recording (fixtures/adaptation-recording.ts) whose card of pages runs for
// real: the card first, checked as the agent suggests and changed by the
// maker; the list under the conversation, each page type in its turn after
// Continue, one taken off by the maker; the end of the adaptation after the
// last one.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SHOWN, SLOW } from "./app.ts";
import { ENDS, writeAdaptationRecording } from "./fixtures/adaptation-recording.ts";

// Not on Windows' CI runners: there, one run in two, the window stops drawing
// once the card of pages is shown (it answers, but no frame comes, so no wait
// for a visible element ends). The card itself is checked there by
// start.e2e.ts; the adaptation is to see on a Windows computer.
describe.skipIf(SHOWN)("a template's adaptation, page by page", () => {
  let launched: LaunchedApp;
  let root = "";
  const main = <T>(code: string): Promise<T> =>
    launched.app.evaluate(
      // biome-ignore lint/security/noGlobalEval: the step, written by the check itself
      (_electron, code) => eval(code),
      code,
    ) as Promise<T>;
  const until = async <T>(read: () => Promise<T>, timeout = 20_000): Promise<T> => {
    timeout *= SLOW;
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const received = () => main<string[]>("globalThis.upstart.replayed");
  const state = () => JSON.parse(readFileSync(join(root, ".upstart/adaptation/state.json"), "utf8"));
  const status = (route: string) =>
    launched.window.locator(`[data-testid="adaptation-step"][data-route="${route}"]`).getAttribute("data-status");
  const turnsDone = (n: number) =>
    until(
      async () => (await launched.window.locator('[data-testid="agent-message"][data-status="done"]').count()) >= n,
    );

  beforeAll(async () => {
    const file = join(mkdtempSync(join(tmpdir(), "upstart-adaptation-")), "adaptation.jsonl");
    writeAdaptationRecording(file);
    // A new maker: the tour waits for the adaptation's end (Q328).
    launched = await launchApp({ tour: true, env: { UPSTART_AGENT_REPLAY: file } });
    await launched.window.getByTestId("start").waitFor();
  });
  afterAll(async () => {
    await launched?.close();
  });

  test("the first turn shows the card of pages before anything else; the maker's checks are kept (Q302, Q310)", async () => {
    const w = launched.window;
    await w.locator('[data-testid="template-card"][data-template="reel"] button[aria-pressed]').click();
    await w.getByTestId("message-input").fill("A website for Terra Lenta, a ceramics studio in Lisbon, with a shop.");
    await w.getByTestId("message-input").press("Enter");
    const card = w.locator('[data-testid="pages-card"][data-state="waiting"]');
    await card.waitFor().catch(async (error) => {
      // From the main process, which answers even when the interface does not.
      const ui = await launched.app.evaluate(async ({ BrowserWindow }) => {
        // The interface's window, not one of the hidden ones that draw thumbnails.
        const contents = BrowserWindow.getAllWindows().find((w) =>
          /index\.html|localhost:5\d{3}/.test(w.webContents.getURL()),
        )!.webContents;
        const answers = await Promise.race([
          contents.executeJavaScript("document.body.innerText.slice(0, 600)").catch((e: Error) => `error ${e.message}`),
          new Promise((r) => setTimeout(() => r("no answer in 5 seconds"), 5000)),
        ]);
        return { crashed: contents.isCrashed(), loading: contents.isLoading(), answers };
      });
      throw new Error(
        `${error.message}; the interface: ${JSON.stringify(ui)}; the app's log ends with: ${launched.logs.join("").slice(-3000)}`,
      );
    });
    root = (
      await w.evaluate(() =>
        // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
        (window as any).upstart.invoke("projects:current"),
      )
    ).path;
    // Reel's page types in the guide's order, then the new page; the agent's checks.
    const choices = card.getByTestId("pages-choice");
    await expect(choices.evaluateAll((els) => els.map((el) => el.getAttribute("data-route")))).resolves.toEqual([
      "/",
      "/work",
      "/studio",
      "/contact",
      "/shop",
    ]);
    const pressed = (route: string) =>
      card.locator(`[data-testid="pages-choice"][data-route="${route}"]`).getAttribute("aria-pressed");
    await expect(pressed("/")).resolves.toBe("true");
    await expect(pressed("/studio")).resolves.toBe("false");
    await expect(card.textContent()).resolves.toContain("Pieces");
    await expect(card.textContent()).resolves.toContain("New");
    // Each page type pictured by its first screen; the new one has none yet.
    await until(() => card.locator('[data-route="/work"] img').count());
    await expect(card.locator('[data-route="/shop"] img').count()).resolves.toBe(0);
    await launched.capture("adaptation-pages-card");
    // Nothing changed yet but the template's copy.
    expect(existsSync(join(root, ".upstart/adaptation/TEMPLATE.md"))).toBe(true);
    expect(state().chosen).toBe(false);

    // The home page cannot be unchecked; the maker keeps the studio after all.
    await card.locator('[data-testid="pages-choice"][data-route="/"]').click();
    await expect(pressed("/")).resolves.toBe("true");
    await card.locator('[data-testid="pages-choice"][data-route="/studio"]').click();
    await expect(pressed("/studio")).resolves.toBe("true");
    await w.getByTestId("pages-keep").click();
    await turnsDone(1);
    // The card folds to the pages kept; the agent read them, in order.
    const settled = w.locator('[data-testid="pages-card"][data-state="answered"]');
    await expect(settled.textContent()).resolves.toMatch(/5 pages kept: Home, Pieces, Studio, Contact, Shop/);
    const answer = (await received()).find((r) => r.startsWith("[mcp__upstart__choose_pages]"));
    expect(answer).toMatch(
      /The maker kept these pages, adapted one at a time in this order: Home \(\/\), Pieces \(\/work\), Studio \(\/studio\), Contact \(\/contact\), Shop \(\/shop, new\)\./,
    );
    expect(answer).not.toMatch(/Not kept/);
    expect(state().chosen).toBe(true);
    await expect(w.getByTestId("agent-message").last().textContent()).resolves.toContain(ENDS[0]);
  });

  test("the list shows the home page to look at; a page to do is taken off; Continue goes to the next (Q303, Q307)", async () => {
    const w = launched.window;
    await w.getByTestId("adaptation-bar").waitFor();
    await expect(status("/")).resolves.toBe("ready");
    await expect(status("/shop")).resolves.toBe("todo");
    await expect(w.getByTestId("adaptation-continue").textContent()).resolves.toBe("Continue: Pieces");
    await launched.capture("adaptation-bar");
    // The maker takes the contact page off; the agent removes its files with the next page.
    await w.locator('[data-testid="adaptation-step"][data-route="/contact"] [data-testid="adaptation-remove"]').click();
    await until(async () => (await status("/contact")) === "removed");
    await w.getByTestId("adaptation-continue").click();
    await turnsDone(2);
    const sent = (await received()).at(-1) ?? "";
    expect(sent).toMatch(
      /Next page of the adaptation: Pieces \(\/work\)\. Adapted already: Home\. Still to do after it: Studio, Shop\./,
    );
    expect(sent).toContain("<template-guide-section>\n### Work (`/work`)");
    expect(sent).toMatch(
      /Also remove these page types, which the maker took off the website: Contact \(pages\/contact\.liquid\)/,
    );
    await expect(status("/")).resolves.toBe("done");
    await expect(status("/work")).resolves.toBe("ready");
    // Pages are left to do: no tour yet.
    expect(await w.getByTestId("tour").count()).toBe(0);
    // The agent removed the contact page in that turn, as it was told.
    rmSync(join(root, "pages/contact.liquid"));
  });

  test("a message during the adaptation is about the page looked at; the last page type ends it (Q307, Q308)", async () => {
    const w = launched.window;
    await w.getByTestId("adaptation-continue").click();
    await turnsDone(3);
    expect((await received()).at(-1)).toMatch(/Next page of the adaptation: Studio \(\/studio\)/);
    // The new page last, built from the gallery.
    await expect(w.getByTestId("adaptation-continue").textContent()).resolves.toBe("Continue: Shop");
    await w.getByTestId("adaptation-continue").click();
    await turnsDone(4);
    const last = (await received()).at(-1) ?? "";
    expect(last).toMatch(/Next page of the adaptation: Shop \(\/shop\), a new page\. .* It is the last\./s);
    expect(last).toMatch(/find_blocks, then use_block into pages\/shop\.liquid/);
    // Over: the list goes, a notice says so, the adaptation's folder is gone.
    await until(async () => (await w.getByTestId("adaptation-bar").count()) === 0);
    await expect(w.locator('[data-testid="notice"]').last().textContent()).resolves.toMatch(/Your website is adapted/);
    expect(existsSync(join(root, ".upstart/adaptation"))).toBe(false);
    // Then the tour, from its first step; Skip ends it.
    await w.getByTestId("tour").waitFor();
    await expect(w.getByTestId("tour").getAttribute("data-step")).resolves.toBe("conversation");
    await launched.capture("adaptation-done");
    await w.getByTestId("tour-skip").click();
    await w.getByTestId("tour").waitFor({ state: "detached" });
  });
});
