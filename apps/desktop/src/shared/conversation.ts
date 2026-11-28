// What the conversation column shows, and how it changes as the agent works.
// The main process turns the agent's stream into ConversationEvents; the same
// reducer builds the displayed items in the main process (to keep them) and in
// the interface (to show them).

export type ActivityState = "running" | "done" | "failed" | "refused";

/**
 * One short line about what the agent does: "Writing pages/index.liquid". The
 * detailed output style (Q127) also shows what was run or searched, and why a
 * step failed.
 */
export type Activity = {
  id: string;
  label: string;
  state: ActivityState;
  detail?: string;
  error?: string;
  /** What a web search with Google Search found, shown to the maker in every style (Q424, Q437). */
  grounded?: Grounded;
};

/**
 * A Google Search's results as the agent read them, and Google's Search
 * Suggestions: its terms ask that both be shown, together and unchanged, to
 * whoever asked (Q424, Q437).
 */
export type Grounded = { text: string; suggestions: string };

/** One choice of a question; `preview` is `block:<id>` or an image of the site (Q291). */
export type QuestionOption = { label: string; description: string; preview?: string };

/** A question of the agent's, in AskUserQuestion's form (Q285): its first choice is the one it recommends. */
export type AgentQuestion = { question: string; header: string; options: QuestionOption[]; multiSelect: boolean };

/**
 * What the maker did with a card of questions: chose for each question (the
 * labels, or their own words for one of them), answered all of it in their own
 * words in the message box, or skipped it (Q284, Q295).
 */
export type QuestionAnswer =
  | { kind: "choices"; answers: Record<string, string | string[]> }
  | { kind: "words"; text: string }
  | { kind: "skipped" }
  /** The card of pages (Q302): the routes of the page types kept, new pages included. */
  | { kind: "pages"; kept: string[] }
  /** The card of a secret (Q559): the maker gave it. Its value never enters the conversation. */
  | { kind: "secret" };

/** Waiting for the maker; answered or skipped; or left when the turn ended (Stop, the app closed). */
export type QuestionState = "waiting" | "answered" | "skipped" | "unanswered";

/** One to four questions the agent asks at once, its turn waiting for the answer (Q283). */
export type QuestionCard = { id: string; questions: AgentQuestion[]; state: QuestionState; answer?: QuestionAnswer };

/**
 * One page type in the card of pages of a template's adaptation (Q302, Q310):
 * named and described for the maker's business, checked as the agent
 * suggests; `new` for a page the template lacks.
 */
export type PageChoice = { route: string; name: string; line: string; checked: boolean; new?: boolean };

/** The card of pages the first turn of an adaptation waits on (Q302). */
export type PagesCard = { id: string; pages: PageChoice[]; state: QuestionState; answer?: QuestionAnswer };

/**
 * A secret the agent asks the maker for (Q501, Q559): its name, what it is
 * for and where to find it. The value goes straight to Spaka's keeping.
 */
export type SecretCard = {
  id: string;
  name: string;
  purpose: string;
  where?: string;
  state: QuestionState;
  answer?: QuestionAnswer;
};

/** Handed in, approved with Build, replaced by a new one after the maker asked for changes, or left when the turn ended. */
export type PlanState = "proposed" | "approved" | "replaced" | "unanswered";

/** The plan the agent hands in in plan mode (Q286, Q290); `changes` are the maker's words when they asked for another. */
export type PlanCard = { id: string; text: string; state: PlanState; changes?: string };

export type AgentPart =
  | { kind: "text"; text: string }
  | { kind: "activity"; activity: Activity }
  /** The agent's thinking, when the model gives it; shown in the detailed style only. */
  | { kind: "thinking"; text: string }
  | { kind: "question"; card: QuestionCard }
  | { kind: "pages"; card: PagesCard }
  | { kind: "secret"; card: SecretCard }
  | { kind: "plan"; card: PlanCard };

export type TurnStatus = "working" | "done" | "stopped" | "failed";

/** A notice's button (Q538): its label and tooltip, and the message it sends to the agent as the maker's. */
export type NoticeAction = { label: string; tip: string; message: string };

export type ConversationItem =
  | { kind: "maker"; id: string; text: string; at: number }
  | {
      kind: "agent";
      id: string;
      /** The agent's words and its activity, in the order they came. */
      parts: AgentPart[];
      status: TurnStatus;
      error?: string;
      at: number;
    }
  | { kind: "notice"; id: string; text: string; at: number; action?: NoticeAction };

export type ConversationEvent =
  | { type: "turn-start"; id: string; text: string; at: number }
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "activity"; activity: Activity }
  | { type: "turn-end"; status: Exclude<TurnStatus, "working">; error?: string }
  | { type: "notice"; id: string; text: string; at: number; action?: NoticeAction }
  /** The agent asks; its turn waits for the answer. */
  | { type: "question"; card: QuestionCard }
  /** The card of pages of a template's adaptation (Q302); settled as a question is. */
  | { type: "pages"; card: PagesCard }
  /** A secret Spaka asks the maker for, for the agent (Q559); settled as a question is. */
  | { type: "secret"; card: SecretCard }
  | { type: "question-settled"; id: string; state: Exclude<QuestionState, "waiting">; answer?: QuestionAnswer }
  /** The agent hands in a plan; its turn waits for Build or the maker's changes. */
  | { type: "plan"; card: PlanCard }
  | { type: "plan-settled"; id: string; state: Exclude<PlanState, "proposed">; changes?: string };

export function applyEvent(items: ConversationItem[], event: ConversationEvent): ConversationItem[] {
  if (event.type === "turn-start")
    return [
      ...items,
      { kind: "maker", id: `${event.id}-m`, text: event.text, at: event.at },
      { kind: "agent", id: `${event.id}-a`, parts: [], status: "working", at: event.at },
    ];
  if (event.type === "notice")
    return [
      ...items,
      {
        kind: "notice",
        id: event.id,
        text: event.text,
        at: event.at,
        ...(event.action ? { action: event.action } : {}),
      },
    ];

  const last = items.at(-1);
  if (last?.kind !== "agent" || last.status !== "working") return items;
  const parts = [...last.parts];
  if (event.type === "text" || event.type === "thinking") {
    const kind = event.type;
    const tail = parts.at(-1);
    if (tail?.kind === kind) parts[parts.length - 1] = { kind, text: tail.text + event.text };
    else parts.push({ kind, text: event.text });
    return [...items.slice(0, -1), { ...last, parts }];
  }
  if (event.type === "activity") {
    const at = parts.findIndex((p) => p.kind === "activity" && p.activity.id === event.activity.id);
    if (at >= 0) parts[at] = { kind: "activity", activity: event.activity };
    else parts.push({ kind: "activity", activity: event.activity });
    return [...items.slice(0, -1), { ...last, parts }];
  }
  if (event.type === "question" || event.type === "plan" || event.type === "pages" || event.type === "secret") {
    parts.push(
      event.type === "question"
        ? { kind: "question", card: event.card }
        : event.type === "pages"
          ? { kind: "pages", card: event.card }
          : event.type === "secret"
            ? { kind: "secret", card: event.card }
            : { kind: "plan", card: event.card },
    );
    return [...items.slice(0, -1), { ...last, parts }];
  }
  if (event.type === "question-settled") {
    const at = parts.findIndex(
      (p) => (p.kind === "question" || p.kind === "pages" || p.kind === "secret") && p.card.id === event.id,
    );
    const part = parts[at];
    if (part?.kind === "question")
      parts[at] = { kind: "question", card: { ...part.card, state: event.state, answer: event.answer } };
    else if (part?.kind === "pages")
      parts[at] = { kind: "pages", card: { ...part.card, state: event.state, answer: event.answer } };
    else if (part?.kind === "secret")
      parts[at] = { kind: "secret", card: { ...part.card, state: event.state, answer: event.answer } };
    else return items;
    return [...items.slice(0, -1), { ...last, parts }];
  }
  if (event.type === "plan-settled") {
    const at = parts.findIndex((p) => p.kind === "plan" && p.card.id === event.id);
    const part = parts[at];
    if (part?.kind !== "plan") return items;
    parts[at] = { kind: "plan", card: { ...part.card, state: event.state, changes: event.changes } };
    return [...items.slice(0, -1), { ...last, parts }];
  }
  // turn-end: whatever was still running did not finish, and whatever still
  // waited for the maker was not answered.
  const settled = parts.map((p): AgentPart => {
    if (p.kind === "activity" && p.activity.state === "running")
      return { ...p, activity: { ...p.activity, state: event.status !== "done" ? "failed" : "done" } };
    if (p.kind === "question" && p.card.state === "waiting") return { ...p, card: { ...p.card, state: "unanswered" } };
    if (p.kind === "pages" && p.card.state === "waiting") return { ...p, card: { ...p.card, state: "unanswered" } };
    if (p.kind === "secret" && p.card.state === "waiting") return { ...p, card: { ...p.card, state: "unanswered" } };
    if (p.kind === "plan" && p.card.state === "proposed") return { ...p, card: { ...p.card, state: "unanswered" } };
    return p;
  });
  return [...items.slice(0, -1), { ...last, parts: settled, status: event.status, error: event.error }];
}

/** Whether the agent is in the middle of a turn, waiting for the maker or not. */
export function isWorking(items: ConversationItem[]): boolean {
  const last = items.at(-1);
  return last?.kind === "agent" && last.status === "working";
}

/** What the agent's turn waits for: a card of questions or of pages, or a plan to approve (Q283, Q286, Q302). */
export function waitingFor(items: ConversationItem[]): QuestionCard | PagesCard | SecretCard | PlanCard | undefined {
  const last = items.at(-1);
  if (last?.kind !== "agent" || last.status !== "working") return undefined;
  for (const part of last.parts) {
    if ((part.kind === "question" || part.kind === "pages" || part.kind === "secret") && part.card.state === "waiting")
      return part.card;
    if (part.kind === "plan" && part.card.state === "proposed") return part.card;
  }
  return undefined;
}

/** Whether the agent's turn waits for the maker: editing by hand comes back meanwhile (Q294). */
/**
 * Whether a working turn's parts leave nothing moving at their end: no step
 * under way, no card waiting. Words still arriving are the caller's to see,
 * by the parts changing (Q548).
 */
export function isQuiet(parts: AgentPart[]): boolean {
  const last = parts.at(-1);
  if (!last) return true;
  if (last.kind === "activity") return last.activity.state !== "running";
  return last.kind === "text" || last.kind === "thinking";
}

export function isWaiting(items: ConversationItem[]): boolean {
  return waitingFor(items) !== undefined;
}

/** Whether a card the turn waits on is a plan, which the message box changes rather than answers (Q290). */
export function isPlan(card: QuestionCard | PagesCard | SecretCard | PlanCard | undefined): card is PlanCard {
  return !!card && "text" in card;
}

/** A settled card in a few words, for summaries: "Which color? → Blue". */
export function answerText(card: QuestionCard): string {
  const { answer } = card;
  if (card.state === "skipped" || answer?.kind === "skipped") return "skipped";
  if (card.state === "unanswered" || card.state === "waiting" || !answer) return "not answered";
  if (answer.kind === "words") return answer.text;
  if (answer.kind === "pages") return answer.kept.join(", ");
  if (answer.kind === "secret") return "given";
  return card.questions
    .map((q) => {
      const a = answer.answers[q.question];
      return `${q.question} → ${a === undefined ? "not answered" : Array.isArray(a) ? a.join(", ") : a}`;
    })
    .join("; ");
}
