// The agent's questions to the maker (Q282-Q295), whichever agent asks
// (ADR 0012): Claude with the binary's AskUserQuestion, the Pi harness with a
// tool of the same form. The turn waits for the maker's answer, then goes on.
import { z } from "zod";
import type { AgentQuestion, QuestionAnswer } from "../../shared/conversation";
import {
  FIND_BLOCKS_TOOL,
  FIND_IMAGES_TOOL,
  LOOK_TOOL,
  PAGES_TOOL,
  UPSTART_SERVER,
  USE_BLOCK_TOOL,
  USE_IMAGE_TOOL,
} from "./upstart-tools";

/** The tool the agent asks with, under Claude's name for every agent. */
export const ASK_TOOL = "AskUserQuestion";
/** The tool the agent hands its plan in with, in plan mode (Q286). */
export const PLAN_TOOL = "ExitPlanMode";
/** Tools the conversation shows as cards rather than activity lines; the card of pages too (Q302). */
export const CARD_TOOLS = new Set([ASK_TOOL, PLAN_TOOL, PAGES_TOOL]);

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
  if (answer.kind === "pages") return `The maker kept these pages: ${answer.kept.join(", ")}.`;
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

/** Said to the agent, at its next message, of a question left when Upstart closed. */
export const CLOSED_UNANSWERED = "The maker did not answer: Upstart was closed while it waited.";

/** Said to the agent when its questions do not have the tool's form. */
export const BAD_FORM =
  "These questions do not have AskUserQuestion's form: 1 to 4 questions, each with 2 to 4 choices.";

/**
 * AskUserQuestion's description for the models of Upstart's own harness, in
 * the terms of Claude's own tool, so that every model asks alike (ADR 0012).
 */
export const ASK_DESCRIPTION = [
  "Asks the maker 1 to 4 questions and waits for the answer: the turn goes on once they answered.",
  "Each question has a short header (a word or two), 2 to 4 choices, each with a label and a description of what it means, and multiSelect when several choices can go together.",
  "Put the choice you recommend first, its label ending with (Recommended).",
  "A choice's preview, optional, is shown with it: block:<id> for a block of the gallery, or the path of an image in the project.",
  "The maker may also answer in their own words, or skip the questions: then decide by yourself and say what you chose.",
].join(" ");

/**
 * Plan mode (Q286, Q290): what the agent is told, whichever agent it is.
 * Claude gets it as its plan-mode instructions, the Pi harness in its own.
 */
export const PLAN_INSTRUCTIONS = [
  "The maker chose plan mode: they want a plan before you build. Write nothing in the project until they approve it.",
  "Read what helps: the project's files, the template it started from, the gallery with find_blocks and find_images, a page the maker points you to with WebFetch.",
  "When a choice is the maker's and costly to guess, ask it with AskUserQuestion.",
  "Then hand in your plan with ExitPlanMode: short formatted text written for the maker, who reads no code, in their language: the pages and their sections, each named by what it shows (no addresses, file names, block ids or datasources), the style (colors, fonts, mood), and what you will invent because the maker did not say it.",
  "Once the maker approves it, build it at once. If they ask for changes, hand in a new plan.",
].join(" ");

/** The Pi harness's tool to hand the plan in with, under Claude's name. */
export const PLAN_DESCRIPTION =
  "In plan mode only: hands in your plan to the maker and waits. They approve it, and you build it at once, or they ask for changes, and you hand in a new plan.";

/** Said to the agent of a tool that writes, in plan mode. */
export const PLAN_REFUSED =
  "Plan mode: nothing is written until the maker approves your plan. Read, ask, then hand in your plan with ExitPlanMode.";

/** Said to the agent that hands in a plan outside plan mode. */
export const NOT_PLANNING = "Not in plan mode: do what the maker asked.";

/** Said to the Pi harness's agent when the maker approves its plan. */
export const PLAN_APPROVED = "The maker approved your plan. Build it now, as planned.";

/** The maker's changes to the plan, said to the agent. */
export function planChanges(words: string, note?: string): string {
  return `The maker wants changes to the plan: ${words}\n\nHand in a new plan with ExitPlanMode.${note ? `\n\n${note}` : ""}`;
}

/** The plan's text from ExitPlanMode's input. */
export function readPlan(input: unknown): string | undefined {
  const plan = (input as { plan?: unknown } | undefined)?.plan;
  return typeof plan === "string" && plan.trim() ? plan.trim() : undefined;
}

/** The tools that only read, which plan mode lets through: Claude's names, Upstart's under the SDK's. */
const PLAN_READS = new Set([
  "Read",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Skill",
  ASK_TOOL,
  PLAN_TOOL,
  LOOK_TOOL,
  FIND_BLOCKS_TOOL,
  FIND_IMAGES_TOOL,
]);

/** Whether plan mode lets a tool through: those that only read, and the maker's connectors (ADR 0010). */
export function readsOnly(name: string): boolean {
  return PLAN_READS.has(name) || (name.startsWith("mcp__") && !name.startsWith(`mcp__${UPSTART_SERVER}__`));
}

/** The tools that change the project, which plan mode refuses in the Pi harness: canonical names. */
export const PLAN_WRITERS = new Set(["Write", "Edit", "Append", "Bash", USE_BLOCK_TOOL, USE_IMAGE_TOOL]);

/** What the agent of the Pi harness reads with the maker's message in plan mode. */
export function planMessage(text: string): string {
  return `[Upstart: plan mode. ${PLAN_INSTRUCTIONS}]\n\n${text}`;
}
