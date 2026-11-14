// One project's agent, whichever layer runs it (ADR 0012): Claude through the
// Agent SDK (session.ts), or Upstart's own harness on Pi's libraries.
import type { QuestionAnswer } from "../../shared/conversation";
import type { AgentMode, Effort, ProjectInfo } from "../../shared/ipc";
import type { TurnChecks } from "./turn-checks";
import type { UpstartTools } from "./upstart-tools";

/** What the maker made of a plan: approved with Build, or changes asked for in their own words (Q290). */
export type PlanDecision = { approved: true } | { changes: string };

export interface AgentRunner {
  readonly projectId: string;
  /** A turn is under way. */
  readonly busy: boolean;
  /** What went wrong, for the logs. */
  readonly problems: string[];
  /** Gets ready, so that the first message does not wait. */
  start(): void;
  /** `forAgent` is what the agent receives, when it differs from what the maker typed. */
  send(text: string, forAgent?: string): void;
  stop(): Promise<void>;
  /**
   * Answers the card of questions the turn waits on (Q283); a card it does not
   * wait on is left alone. `note` says what the maker changed by hand meanwhile (Q294).
   */
  answer(cardId: string, answer: QuestionAnswer, note?: string): void;
  /** Settles the plan the turn waits on (Q286): Build, or the maker's changes, after which the agent hands in another. */
  settlePlan(cardId: string, decision: PlanDecision, note?: string): void;
  setModel(model: string): Promise<void>;
  setEffort(effort: Effort): Promise<void>;
  /** Build or plan, from the next message (Q286, Q296). */
  setMode(mode: AgentMode): Promise<void>;
  /** Clears the agent's memory of the conversation; what is shown stays. */
  startOver(): void;
  /** Clears its memory without a word in the conversation: another agent took over (Q274). */
  forget(): void;
  /** The project's folder moved or its settings changed while closed. */
  update(project: ProjectInfo): void;
  close(): void;
  /** Whether the skills or connectors changed since the agent started; restarts an idle agent with them. */
  refreshExtensions(): boolean;
  /** The maker's connectors as the agent sees them now. */
  connectorStatus(): Promise<{ name: string; status: string; error?: string }[]>;
  /** Starts signing in to one of the maker's connectors: the address to open in the browser, if any. */
  signInConnector(name: string): Promise<string | undefined>;
}

/** What Upstart gives one project's agent, whichever layer runs it: its tools and its checks. */
export type AgentKit = { tools: UpstartTools; checks: TurnChecks };
