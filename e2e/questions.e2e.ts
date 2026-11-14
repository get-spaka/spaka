import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";
import { writeQuestionsRecording } from "./fixtures/questions-recording.ts";

// The agent's questions to the maker (Q283-Q295), on a made-up recording
// (fixtures/questions-recording.ts): a card in the agent's turn, the turn
// waiting for its answer, given by a click, by choices then Answer, in the
// maker's own words in the message box, or skipped; Stop leaves it
// unanswered. Editing by hand comes back while it waits (Q294), the sidebar
// marks the website (Q292). The notification is not checked: a background
// launch never shows one.
describe("the agent's questions", () => {
  let launched: LaunchedApp;
  const until = async (read: () => Promise<unknown>, timeout = 15_000) => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const invoke = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...(args as unknown[])),
      [channel, args] as const,
    ) as Promise<T>;
  const replayed = () =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      () => (globalThis as any).upstart.replayed as string[],
    );
  const answerOf = async (index = -1) => {
    const line = (await replayed()).filter((l) => l.startsWith("[AskUserQuestion] ")).at(index)!;
    return JSON.parse(line.slice("[AskUserQuestion] ".length));
  };
  const waitingCard = () => launched.window.locator('[data-testid="question-card"][data-state="waiting"]');
  const lastTurn = () => launched.window.getByTestId("agent-message").last();
  const send = async (text: string) => {
    await launched.window.getByTestId("message-input").fill(text);
    await launched.window.getByTestId("message-input").press("Enter");
  };

  beforeAll(async () => {
    const file = join(mkdtempSync(join(tmpdir(), "upstart-questions-")), "questions.jsonl");
    writeQuestionsRecording(file);
    launched = await launchApp({ env: { UPSTART_AGENT_REPLAY: file } });
    await launched.window.getByTestId("message-input").waitFor();
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("a question waits with its choices, the recommended first; editing comes back; one click answers", async () => {
    const w = launched.window;
    await send("A bakery in Lyon.");
    await until(() => waitingCard().count());
    const choices = waitingCard().getByTestId("question-choice");
    expect(await choices.count()).toBe(2);
    await expect(choices.first().textContent()).resolves.toMatch(/^WarmRecommended/);
    expect(await waitingCard().getByTestId("question-recommended").count()).toBe(1);
    // The block of the gallery the agent showed with its choice (Q291).
    await until(() => waitingCard().locator('[data-testid="choice-preview"] img').count());
    await expect(w.getByTestId("message-input").getAttribute("placeholder")).resolves.toBe("Answer in your own words…");
    // The website is marked in the sidebar while the agent waits (Q292).
    expect(await w.getByTestId("project-waiting").count()).toBe(1);
    await launched.capture("question-waiting");

    // Editing by hand comes back meanwhile (Q294), and the agent hears of it with the answer.
    const { path } = await invoke<{ path: string }>("projects:current");
    const home = readFileSync(join(path, "pages/index.liquid"), "utf8");
    await expect(
      invoke("editing:apply", {
        type: "text",
        file: "pages/index.liquid",
        at: home.indexOf("<h1"),
        texts: ["Chez Margot & fils"],
      }),
    ).resolves.toMatchObject({ label: "Text changed" });

    await choices.first().click();
    await until(() => w.locator('[data-testid="agent-message"][data-status="done"]').count());
    await expect(lastTurn().getByTestId("question-card").textContent()).resolves.toContain(
      "Which mood should the bakery's site have? → Warm",
    );
    expect(await answerOf()).toEqual({
      behavior: "allow",
      updatedInput: expect.objectContaining({
        answers: { "Which mood should the bakery's site have?": "Warm (Recommended)" },
      }),
    });
    expect((await replayed()).find((l) => l.startsWith("[PostToolUse]"))).toMatch(
      /the maker changed by hand: text changed \(pages\/index\.liquid\)/,
    );
    await until(async () => (await w.getByTestId("project-waiting").count()) === 0);
  });

  test("several questions: choices, then Answer", async () => {
    const w = launched.window;
    await send("Add a page for weddings");
    await until(() => waitingCard().count());
    const answer = w.getByTestId("question-answer");
    await expect(answer.isDisabled()).resolves.toBe(true);
    await waitingCard()
      .getByRole("button", { name: /Tiered cakes/ })
      .click();
    await waitingCard()
      .getByRole("button", { name: /Croquembouche/ })
      .click();
    await waitingCard()
      .getByRole("button", { name: /No, on request/ })
      .click();
    await answer.click();
    await until(() => w.locator('[data-testid="agent-message"][data-status="done"]').nth(1).count());
    expect((await answerOf()).updatedInput.answers).toEqual({
      "Which wedding cakes do you make?": ["Tiered cakes", "Croquembouche"],
      "Should the page show prices?": "No, on request (Recommended)",
    });
  });

  test("an answer in the maker's own words, typed in the message box", async () => {
    const w = launched.window;
    await send("Change the tagline");
    await until(() => waitingCard().count());
    const makers = await w.getByTestId("maker-message").count();
    await send("Fresh bread every morning");
    await until(() => w.locator('[data-testid="agent-message"][data-status="done"]').nth(2).count());
    expect(await w.getByTestId("maker-message").count()).toBe(makers);
    await expect(lastTurn().getByTestId("question-card").textContent()).resolves.toContain("Fresh bread every morning");
    expect((await answerOf()).updatedInput).toMatchObject({ answers: {}, response: "Fresh bread every morning" });
  });

  test("Skip, then Stop while a question waits", async () => {
    const w = launched.window;
    await send("Anything else?");
    await until(() => waitingCard().count());
    await w.getByTestId("question-skip").click();
    await until(() => w.locator('[data-testid="question-card"][data-state="skipped"]').count());
    expect((await answerOf()).updatedInput.annotations).toEqual({
      "Add a link to your Instagram?": { unanswered: "skipped" },
    });
    await until(() => w.locator('[data-testid="agent-message"][data-status="done"]').nth(3).count());

    await send("Sunday hours");
    await until(() => waitingCard().count());
    await w.getByTestId("stop").click();
    await until(() => w.locator('[data-testid="agent-message"][data-status="stopped"]').count());
    expect(await lastTurn().locator('[data-testid="question-card"][data-state="unanswered"]').count()).toBe(1);
    expect(await answerOf()).toMatchObject({ behavior: "deny" });
    await launched.capture("questions-settled");
  });
});
