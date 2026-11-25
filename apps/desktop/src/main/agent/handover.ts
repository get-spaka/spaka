// What a new agent is told when the maker switches between Claude and a model
// of Spaka's own harness (Q274): a fresh memory, from a summary of the
// conversation as shown. What the maker changed by hand since reaches it
// through the usual notes (editing/notes.ts).
import { answerText, type ConversationItem } from "../../shared/conversation";
import { clip } from "./activity";

const TURNS = 12;

export function handoverNote(items: ConversationItem[]): string | undefined {
  const turns: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.kind !== "maker") continue;
    const reply =
      items[i + 1]?.kind === "agent" ? (items[i + 1] as Extract<ConversationItem, { kind: "agent" }>) : undefined;
    const words = reply?.parts
      .filter((p) => p.kind === "text")
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join("\n");
    const steps = reply?.parts.flatMap((p) =>
      p.kind === "activity" && p.activity.state === "done" && /^(Writing|Editing) /.test(p.activity.label)
        ? [p.activity.label]
        : [],
    );
    // Its questions and plans, with what the maker made of them (Q283, Q286).
    const asked = reply?.parts.flatMap((p) => {
      if (p.kind === "question")
        return [
          `The agent asked: ${p.card.questions.map((q) => q.question).join(" ")} The maker: ${clip(answerText(p.card), 600)}.`,
        ];
      if (p.kind === "plan")
        return [
          `The agent handed in a plan, ${p.card.state === "approved" ? "which the maker approved" : p.card.state === "replaced" ? `which the maker asked to change: ${clip(p.card.changes ?? "", 600)}` : "which the maker did not approve"}:\n${clip(p.card.text, 1500)}`,
        ];
      return [];
    });
    turns.push(
      [
        `The maker: ${clip(item.text.trim(), 1500)}`,
        ...(asked ?? []),
        ...(steps?.length ? [`The agent: ${[...new Set(steps)].join("; ")}.`] : []),
        ...(words ? [`The agent said: ${clip(words, 1500)}`] : []),
        ...(reply && reply.status !== "done"
          ? [`(That turn ${reply.status === "working" ? "did not finish" : reply.status}.)`]
          : []),
      ].join("\n"),
    );
  }
  if (!turns.length) return undefined;
  const shown = turns.slice(-TURNS);
  return [
    "You are taking over this website's conversation from another model, with the maker's agreement. What was said and done so far" +
      (turns.length > shown.length ? ` (the last ${shown.length} exchanges)` : "") +
      ":",
    shown.join("\n\n"),
    "The project's files are as that work left them: read what you need rather than rely on this summary. The maker's message follows.",
  ].join("\n\n");
}
