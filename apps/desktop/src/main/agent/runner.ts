// One project's agent, whichever layer runs it (ADR 0012): Claude through the
// Agent SDK (session.ts), or Upstart's own harness on Pi's libraries.
import type { Effort, ProjectInfo } from "../../shared/ipc";
import type { TurnChecks } from "./turn-checks";
import type { UpstartTools } from "./upstart-tools";

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
  setModel(model: string): Promise<void>;
  setEffort(effort: Effort): Promise<void>;
  /** Clears the agent's memory of the conversation; what is shown stays. */
  startOver(): void;
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
