import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// Comments for the agent (Q95), with the recorded agent: written on several
// elements of several pages, kept across a navigation, sent together as one
// message showing them as a list, the agent getting where each element is.
describe("comments on the page", () => {
  let launched: LaunchedApp;
  const { invoke, until, page, click, typeText, drawn, picture } = previewDriver(() => launched);
  const inShadow = (code: string) =>
    page(`(() => { const root = document.querySelector('upstart-editor').shadowRoot; return ${code}; })()`);
  const comment = async (selector: string, text: string) => {
    await click(selector);
    await until(() => drawn('[data-testid="comment-card"]'));
    await typeText(text);
    await click('.card [data-act="save"]', true);
    await until(async () => !(await drawn('[data-testid="comment-card"]')));
  };

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    // The bakery has two pages: the preview went to all of them (Q131); these checks are on one.
    await invoke("preview:set-view", "page");
    await invoke("preview:navigate", "/");
    await until(() => page("!!document.querySelector('upstart-editor') && location.pathname === '/'"));
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test("comments are pinned on several elements, on several pages", async () => {
    await launched.window.getByTestId("mode-comment").click();
    await comment("h1", "Warmer, please");
    await comment("section p", "Say we open at 7");
    expect(await inShadow("root.querySelectorAll('[data-testid=comment-pin]').length")).toBe(2);
    await until(() => drawn('[data-testid="comment-bar"]'));
    expect(await inShadow("root.querySelector('[data-testid=comment-bar] .count').textContent")).toBe("2 comments");
    await picture("comments-pinned");
    await invoke("preview:navigate", "/menu");
    await until(() => page("location.pathname === '/menu' && !!document.querySelector('upstart-editor')"));
    // The bar counts every page's comments; this page has no pin yet.
    await until(
      async () =>
        (await inShadow("root.querySelector('[data-testid=comment-bar] .count').textContent")) === "2 comments",
    );
    expect(await inShadow("root.querySelectorAll('[data-testid=comment-pin]').length")).toBe(0);
    await comment("h1", "Add prices");
    expect((await invoke("comments:list")).map((c: { route: string }) => c.route)).toEqual(["/", "/", "/menu"]);
  });

  test("a comment is opened again from its pin, changed, and survives a navigation", async () => {
    await invoke("preview:navigate", "/");
    await until(async () => (await inShadow("root.querySelectorAll('[data-testid=comment-pin]').length")) === 2);
    await click('[data-testid="comment-pin"]', true);
    await until(() => drawn('[data-testid="comment-card"]'));
    expect(await inShadow("root.querySelector('textarea').value")).toBe("Warmer, please");
    await typeText(" and bigger");
    await click('.card [data-act="save"]', true);
    await until(async () => (await invoke("comments:list"))[0].text === "Warmer, please and bigger");
  });

  test("sending makes one message, a list for the maker, places for the agent", async () => {
    await launched.app.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const u = (globalThis as any).upstart;
      const send = u.agent.send.bind(u.agent);
      u.sent = [];
      u.agent.send = (project: unknown, text: string, forAgent?: string) => {
        u.sent.push({ text, forAgent });
        return send(project, text, forAgent);
      };
    });
    await click('[data-act="send"]', true);
    await until(async () => (await invoke("comments:list")).length === 0);
    // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
    const [sent] = (await launched.app.evaluate(() => (globalThis as any).upstart.sent)) as {
      text: string;
      forAgent: string;
    }[];
    expect(sent!.text.split("\n")).toEqual([
      "1. heading “Chez Margot” (/): Warmer, please and bigger",
      expect.stringMatching(/^2\. paragraph “.+” \(\/\): Say we open at 7$/),
      expect.stringMatching(/^3\. heading “.+” \(\/menu\): Add prices$/),
    ]);
    expect(sent!.forAgent).toMatch(/On page \/, the element at pages\/index\.liquid:\d+:\n {3}<h1/);
    const shown = await launched.window.getByTestId("maker-message").last().textContent();
    expect(shown).toContain("1. heading “Chez Margot”");
    expect(await drawn('[data-testid="comment-bar"]')).toBe(false);
    await launched.window.getByTestId("mode-edit").click();
  });
});
