import { expect, test } from "vitest";
import type { AgentQuestion } from "../../shared/conversation";
import { answerResult, claudeAnswer } from "./questions";

const questions: AgentQuestion[] = [
  {
    question: "Which mood?",
    header: "Mood",
    multiSelect: false,
    options: [
      { label: "Warm (Recommended)", description: "Wood and bread" },
      { label: "Bright", description: "White and blue" },
    ],
  },
  {
    question: "Which pages?",
    header: "Pages",
    multiSelect: true,
    options: [
      { label: "Menu", description: "The cakes" },
      { label: "Contact", description: "The address" },
    ],
  },
];

test("a question skipped among others is marked skipped for Claude; the others keep their answers (Q388)", () => {
  expect(claudeAnswer(questions, { kind: "choices", answers: { "Which mood?": "Warm (Recommended)" } })).toEqual({
    questions,
    answers: { "Which mood?": "Warm (Recommended)" },
    annotations: { "Which pages?": { unanswered: "skipped" } },
  });
  expect(
    claudeAnswer(questions, { kind: "choices", answers: { "Which mood?": "Bright", "Which pages?": ["Menu"] } }),
  ).toEqual({ questions, answers: { "Which mood?": "Bright", "Which pages?": ["Menu"] } });
});

test("the other agents read the answers, an answer of the maker's own, and which questions were skipped", () => {
  expect(
    answerResult(questions, { kind: "choices", answers: { "Which pages?": ["Menu", "A page for weddings"] } }),
  ).toBe(
    'Your questions have been answered: "Which pages?"="Menu,A page for weddings". The user did not answer "Which mood?": take your recommended choice for it. You can now continue with these answers in mind.',
  );
});
