import { expect, test } from "vitest";
import { handoverNote } from "../main/agent/handover";
import {
  type Activity,
  type AgentPart,
  type AgentQuestion,
  answerText,
  applyEvent,
  type ConversationEvent,
  type ConversationItem,
  isQuiet,
  isWaiting,
  isWorking,
  type QuestionCard,
  waitingFor,
} from "./conversation";

const color: AgentQuestion = {
  question: "Which color should the site be?",
  header: "Color",
  options: [
    { label: "Terracotta", description: "Warm, like the shop's tiles", preview: "block:hero-split" },
    { label: "Sage", description: "Calm and green" },
  ],
  multiSelect: false,
};
const pages: AgentQuestion = {
  question: "Which pages does the site need?",
  header: "Pages",
  options: [
    { label: "Menu", description: "" },
    { label: "Booking", description: "" },
  ],
  multiSelect: true,
};

const play = (events: ConversationEvent[], items: ConversationItem[] = []) => events.reduce(applyEvent, items);
const agentOf = (items: ConversationItem[]) => items.at(-1) as Extract<ConversationItem, { kind: "agent" }>;
const asked = (id: string, questions = [color]): ConversationEvent => ({
  type: "question",
  card: { id, questions, state: "waiting" },
});

test("a question waits in the agent's turn, then keeps the maker's answer", () => {
  let items = play([
    { type: "turn-start", id: "t1", text: "Un site pour ma boutique", at: 1 },
    { type: "text", text: "Une question d'abord." },
    asked("q1", [color, pages]),
  ]);
  expect(isWorking(items)).toBe(true);
  expect(isWaiting(items)).toBe(true);
  expect(waitingFor(items)).toMatchObject({ id: "q1", state: "waiting" });

  items = play(
    [
      {
        type: "question-settled",
        id: "q1",
        state: "answered",
        answer: { kind: "choices", answers: { [color.question]: "Sage", [pages.question]: ["Menu", "Booking"] } },
      },
    ],
    items,
  );
  expect(isWaiting(items)).toBe(false);
  expect(isWorking(items)).toBe(true);
  const card = (agentOf(items).parts[1] as { card: QuestionCard }).card;
  expect(card.state).toBe("answered");
  expect(answerText(card)).toBe(
    "Which color should the site be? → Sage; Which pages does the site need? → Menu, Booking",
  );
});

test("an answer in the maker's own words, or a skipped card, reads as such", () => {
  const words = play([
    { type: "turn-start", id: "t1", text: "x", at: 1 },
    asked("q1"),
    { type: "question-settled", id: "q1", state: "answered", answer: { kind: "words", text: "Plutôt bleu nuit" } },
  ]);
  expect(answerText((agentOf(words).parts[0] as { card: QuestionCard }).card)).toBe("Plutôt bleu nuit");
  const skipped = play([
    { type: "turn-start", id: "t1", text: "x", at: 1 },
    asked("q1"),
    { type: "question-settled", id: "q1", state: "skipped", answer: { kind: "skipped" } },
  ]);
  expect(answerText((agentOf(skipped).parts[0] as { card: QuestionCard }).card)).toBe("skipped");
});

test("a plan waits for Build; a plan replaced keeps the maker's words", () => {
  let items = play([
    { type: "turn-start", id: "t1", text: "x", at: 1 },
    { type: "plan", card: { id: "p1", text: "Accueil, Carte, Contact", state: "proposed" } },
  ]);
  expect(waitingFor(items)).toMatchObject({ id: "p1" });
  items = play(
    [
      { type: "plan-settled", id: "p1", state: "replaced", changes: "Ajoute une page pour les gâteaux de mariage" },
      { type: "plan", card: { id: "p2", text: "Accueil, Carte, Mariages, Contact", state: "proposed" } },
      { type: "plan-settled", id: "p2", state: "approved" },
      { type: "activity", activity: { id: "a1", label: "Writing pages/index.liquid", state: "running" } },
    ],
    items,
  );
  expect(isWaiting(items)).toBe(false);
  expect(agentOf(items).parts.map((p) => (p.kind === "plan" ? `${p.card.id}:${p.card.state}` : p.kind))).toEqual([
    "p1:replaced",
    "p2:approved",
    "activity",
  ]);
  expect(handoverNote(items)).toContain("which the maker asked to change: Ajoute une page pour les gâteaux de mariage");
});

test("a turn that ends while a card waits leaves it not answered", () => {
  const items = play([
    { type: "turn-start", id: "t1", text: "x", at: 1 },
    asked("q1"),
    { type: "plan", card: { id: "p1", text: "…", state: "proposed" } },
    { type: "turn-end", status: "stopped" },
  ]);
  expect(isWorking(items)).toBe(false);
  expect(isWaiting(items)).toBe(false);
  const parts = agentOf(items).parts;
  expect(parts.map((p) => (p.kind === "question" || p.kind === "plan" ? p.card.state : p.kind))).toEqual([
    "unanswered",
    "unanswered",
  ]);
  expect(handoverNote(items)).toContain("The agent asked: Which color should the site be? The maker: not answered.");
});

test("a settlement for a card the turn does not have changes nothing", () => {
  const items = play([{ type: "turn-start", id: "t1", text: "x", at: 1 }, asked("q1")]);
  expect(play([{ type: "question-settled", id: "nope", state: "skipped" }], items)).toBe(items);
});

test("a turn is quiet when nothing moves at its end: no step under way, no card waiting (Q548)", () => {
  const step = (state: Activity["state"]): AgentPart => ({
    kind: "activity",
    activity: { id: "a", label: "Write theme.css", state },
  });
  expect(isQuiet([])).toBe(true);
  expect(isQuiet([{ kind: "text", text: "Je construis un site météo." }])).toBe(true);
  expect(isQuiet([step("done")])).toBe(true);
  expect(isQuiet([step("failed")])).toBe(true);
  expect(isQuiet([step("running")])).toBe(false);
  expect(isQuiet([{ kind: "question", card: { questions: [] } as unknown as QuestionCard }])).toBe(false);
});
