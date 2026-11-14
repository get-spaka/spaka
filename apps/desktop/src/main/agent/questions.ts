// The agent's questions to the maker (Q282-Q295), whichever agent asks
// (ADR 0012): Claude with the binary's AskUserQuestion, the Pi harness with a
// tool of the same form. The turn waits for the maker's answer, then goes on.
import { z } from "zod";
import type { AgentQuestion, QuestionAnswer } from "../../shared/conversation";

/** The tool the agent asks with, under Claude's name for every agent. */
export const ASK_TOOL = "AskUserQuestion";
/** The tool the agent hands its plan in with, in plan mode (Q286). */
export const PLAN_TOOL = "ExitPlanMode";
/** Tools the conversation shows as cards rather than activity lines. */
export const CARD_TOOLS = new Set([ASK_TOOL, PLAN_TOOL]);

const Option = z.object({
  label: z.string().min(1),
  description: z.string().default(""),
  preview: z.string().optional(),
});
const Question = z.object({
  question: z.string().min(1),
  header: z.string().default(""),
  options: z.array(Option).min(2).max(4),
  multiSelect: z.boolean().default(false),
});
/** AskUserQuestion's input (Q285): 1 to 4 questions, each with 2 to 4 choices, the recommended one first. */
export const AskInput = z.object({ questions: z.array(Question).min(1).max(4) });

/** The questions of a call, or undefined when they do not have the form. */
export function readQuestions(input: unknown): AgentQuestion[] | undefined {
  const parsed = AskInput.safeParse(input);
  return parsed.success ? parsed.data.questions : undefined;
}

/**
 * The cards a turn waits on, each until the maker answers it or the turn
 * stops. A card whose wait ended answers `undefined`.
 */
export class Waits<T> {
  private readonly waiting = new Map<string, (value: T | undefined) => void>();

  wait(id: string, signal?: AbortSignal): Promise<T | undefined> {
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve(undefined);
      this.waiting.set(id, resolve);
      signal?.addEventListener("abort", () => this.settle(id, undefined), { once: true });
    });
  }

  /** Whether a card of that id was waiting. */
  settle(id: string, value: T | undefined): boolean {
    const resolve = this.waiting.get(id);
    if (!resolve) return false;
    this.waiting.delete(id);
    resolve(value);
    return true;
  }

  has(id: string) {
    return this.waiting.has(id);
  }

  /** The turn stopped or the agent closed: nothing waits any more. */
  cancelAll() {
    for (const id of [...this.waiting.keys()]) this.settle(id, undefined);
  }
}

/**
 * What Claude's AskUserQuestion gets back (the SDK's updatedInput): the
 * chosen labels by question, the maker's own words as one reply, or each
 * question marked skipped (the binary's ask_user_question_unanswered_v1).
 */
export function claudeAnswer(questions: AgentQuestion[], answer: QuestionAnswer): Record<string, unknown> {
  if (answer.kind === "choices") return { questions, answers: answer.answers };
  if (answer.kind === "words") return { questions, answers: {}, response: answer.text };
  return {
    questions,
    answers: {},
    annotations: Object.fromEntries(questions.map((q) => [q.question, { unanswered: "skipped" }])),
  };
}

/** What another agent's tool answers, in the words Claude's own tool uses, so every model reads the same. */
export function answerResult(questions: AgentQuestion[], answer: QuestionAnswer): string {
  if (answer.kind === "words") return `The user responded: ${answer.text}`;
  if (answer.kind === "skipped") return "The user did not answer the questions.";
  const pairs = questions
    .filter((q) => answer.answers[q.question] !== undefined)
    .map((q) => {
      const a = answer.answers[q.question]!;
      return `"${q.question}"="${Array.isArray(a) ? a.join(",") : a}"`;
    });
  return `Your questions have been answered: ${pairs.join(", ")}. You can now continue with these answers in mind.`;
}

/** Said to the agent when its question's wait ended without an answer. */
export const NOT_ANSWERED = "The maker did not answer: the turn was stopped.";
