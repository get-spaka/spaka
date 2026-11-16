// What drives the real agents' checks like a maker: sends messages, answers
// the agent's cards, waits for its turns, reads the conversation back.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LaunchedApp } from "./app.ts";

/** Shown even when the checks pass. */
export const say = (line: string) => process.stdout.write(`${line}\n`);

export const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.name.startsWith(".") ? [] : e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      )
    : [];

export type Card = { kind: "question" | "plan" | "pages"; card: Record<string, unknown> };

/** What drives a launched app's conversation like a maker, and reads it back. */
export function maker(get: () => LaunchedApp) {
  const w = () => get().window;
  const invoke = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
    w().evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...(args as unknown[])),
      [channel, args] as const,
    ) as Promise<T>;
  const send = async (text: string) => {
    await w().getByTestId("message-input").fill(text);
    await w().getByTestId("message-input").press("Enter");
  };
  const waitingQuestion = () => w().locator('[data-testid="question-card"][data-state="waiting"]');
  const proposedPlan = () => w().locator('[data-testid="plan-card"][data-state="proposed"]');
  const waitingPages = () => w().locator('[data-testid="pages-card"][data-state="waiting"]');
  /** The cards of the conversation, as the main process keeps them. */
  const cards = async (): Promise<Card[]> => {
    const { items } = await invoke<{ items: { kind: string; parts?: { kind: string; card?: object }[] }[] }>(
      "conversation:get",
    );
    return items
      .filter((i) => i.kind === "agent")
      .flatMap((i) => i.parts ?? [])
      .filter((p) => p.kind === "question" || p.kind === "plan" || p.kind === "pages")
      .map((p) => ({ kind: p.kind as Card["kind"], card: p.card as Record<string, unknown> }));
  };
  /** Clicks each question's recommended choice, then Answer when there is one. */
  const answerRecommended = async () => {
    const card = waitingQuestion();
    const sets = card.locator("fieldset");
    const answer = card.getByTestId("question-answer");
    if (!(await answer.count())) return card.getByTestId("question-choice").first().click();
    for (let i = 0; i < (await sets.count()); i++) await sets.nth(i).getByTestId("question-choice").first().click();
    await answer.click();
  };
  /**
   * Waits for the agent's turn to end, handing each question and plan it waits
   * on to `on`, which answers it; a turn longer than `timeout` fails.
   */
  const drive = async (
    on: { question?: () => Promise<void>; plan?: (index: number) => Promise<void>; pages?: () => Promise<void> },
    timeout = 1_800_000,
  ) => {
    const started = Date.now();
    let plans = 0;
    let questions = 0;
    for (;;) {
      const { items } = await invoke<{ items: { kind: string; status?: string }[] }>("conversation:get");
      // Upstart's own lines (a notice, as when an adaptation ends) come after the turn.
      const last = items.filter((i) => i.kind !== "notice").at(-1);
      if (last?.kind === "agent" && last.status !== "working") return { ms: Date.now() - started, last };
      if (await waitingQuestion().count()) {
        questions++;
        await (on.question ?? answerRecommended)();
        await waitingQuestion().waitFor({ state: "detached", timeout: 30_000 });
      } else if (await waitingPages().count()) {
        await (on.pages ?? (() => waitingPages().getByTestId("pages-keep").click()))();
        await waitingPages().waitFor({ state: "detached", timeout: 30_000 });
      } else if (await proposedPlan().count()) {
        await get().capture(`real-plan-${plans}`);
        if (!on.plan) throw new Error("a plan the check did not expect");
        await on.plan(plans++);
        await proposedPlan().waitFor({ state: "detached", timeout: 30_000 });
      }
      if (Date.now() - started > timeout) throw new Error(`the agent did not finish in ${timeout / 60_000} minutes`);
      if (questions > 6) throw new Error("more than six cards in one turn");
      await new Promise((r) => setTimeout(r, 1000));
    }
  };
  /** Clicks Continue under the conversation and drives the turn it starts (Q303). */
  const continueAdaptation = async (timeout?: number) => {
    const turns = async () =>
      (await invoke<{ items: { kind: string }[] }>("conversation:get")).items.filter((i) => i.kind === "agent").length;
    const before = await turns();
    await w().getByTestId("adaptation-continue").click();
    for (const started = Date.now(); (await turns()) === before; ) {
      if (Date.now() - started > 30_000) throw new Error("Continue started no turn");
      await new Promise((r) => setTimeout(r, 200));
    }
    return drive({}, timeout);
  };
  return {
    w,
    invoke,
    send,
    waitingQuestion,
    proposedPlan,
    waitingPages,
    cards,
    answerRecommended,
    drive,
    continueAdaptation,
  };
}

/** The site's own files: its pages, parts, records and theme. */
export function siteText(path: string): string {
  return walk(path)
    .filter((f) => /\.(liquid|md|css|yaml)$/.test(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
}
