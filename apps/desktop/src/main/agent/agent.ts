// The app's side of the agent: one session per open project, the
// conversations as shown (kept in the app's data, ADR 0001), the sign-in and
// the models on offer.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk";
import { applyEvent, type ConversationEvent, type ConversationItem } from "../../shared/conversation";
import type { AgentStatus, Effort, ModelChoice, ProjectInfo, SignInMethod } from "../../shared/ipc";
import type { AgentAuth, AuthState } from "./auth";
import { AgentSession, type SessionDeps } from "./session";
import type { AgentEvent } from "./stream";

export type AgentOptions = {
  auth: AgentAuth;
  /** The session's dependencies; `env` is filled in from the sign-in. */
  session: Omit<SessionDeps, "env">;
  dataFor: (projectId: string) => string;
  emitConversation: (projectId: string, event: ConversationEvent) => void;
  emitStatus: (status: AgentStatus) => void;
  onAgentEvent?: (projectId: string, event: AgentEvent) => void;
};

export class Agent {
  private readonly sessions = new Map<string, AgentSession>();
  private readonly logs = new Map<string, ConversationItem[]>();
  private current: ProjectInfo | undefined;
  private authState: AuthState | undefined;
  private models: ModelChoice[] = [];

  constructor(private readonly o: AgentOptions) {}

  /** The project shown; its agent starts now so that the first message does not wait. */
  open(project: ProjectInfo | undefined) {
    this.current = project;
    for (const [id, session] of this.sessions)
      if (id !== project?.id && !session.busy) {
        session.close();
        this.sessions.delete(id);
      }
    if (project) {
      const session = this.session(project);
      session.update(project);
      session.start();
      if (!this.models.length) void this.loadModels(session);
    }
  }

  conversation(projectId: string): ConversationItem[] {
    let items = this.logs.get(projectId);
    if (!items) {
      items = readLog(this.logFile(projectId));
      this.logs.set(projectId, items);
    }
    return items;
  }

  send(project: ProjectInfo, text: string, forAgent?: string) {
    this.session(project).send(text, forAgent);
  }

  /** A line in the conversation from Upstart itself. */
  notice(projectId: string, text: string) {
    this.record(projectId, { type: "notice", id: `${Date.now().toString(36)}-n`, text, at: Date.now() });
  }

  isWorking(projectId: string) {
    return !!this.sessions.get(projectId)?.busy;
  }

  async stop(projectId: string) {
    await this.sessions.get(projectId)?.stop();
  }

  startOver(project: ProjectInfo) {
    this.session(project).startOver();
  }

  async setModel(project: ProjectInfo, model: string) {
    await this.sessions.get(project.id)?.setModel(model);
  }

  async setEffort(project: ProjectInfo, effort: Effort) {
    await this.sessions.get(project.id)?.setEffort(effort);
  }

  status(): AgentStatus {
    const auth = this.o.auth;
    return {
      auth: auth.signingIn
        ? "signing-in"
        : !this.authState
          ? "unknown"
          : this.authState.loggedIn
            ? "signed-in"
            : "signed-out",
      method: this.authState?.loggedIn ? this.authState.method : undefined,
      hasApiKey: auth.hasApiKey,
      signInUrl: auth.signInUrl,
      signInFailed: auth.signInFailed || undefined,
      models: this.models,
    };
  }

  /** Asks the binary whether it is signed in, then tells the interface. */
  async checkSignIn() {
    this.authState = await this.o.auth.status();
    this.o.emitStatus(this.status());
    return this.authState;
  }

  signIn(method: SignInMethod) {
    this.o.auth.signIn(method);
  }

  cancelSignIn() {
    this.o.auth.cancelSignIn();
  }

  setApiKey(key: string | null) {
    this.o.auth.setApiKey(key);
    this.restartIdle();
  }

  /** The sign-in changed (signed in, key added or removed): idle agents start again with it. */
  async signInChanged() {
    const before = this.authState?.loggedIn;
    await this.checkSignIn();
    if (this.authState?.loggedIn && !before) this.restartIdle();
  }

  close() {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
    this.o.auth.cancelSignIn();
  }

  private restartIdle() {
    for (const [id, session] of this.sessions)
      if (!session.busy) {
        session.close();
        if (id === this.current?.id) session.start();
      }
  }

  private session(project: ProjectInfo): AgentSession {
    let session = this.sessions.get(project.id);
    if (session) return session;
    const id = project.id;
    session = new AgentSession(
      project,
      this.o.dataFor(id),
      { ...this.o.session, env: () => this.o.auth.env() },
      {
        onConversation: (event) => this.record(id, event),
        onAgentEvent: this.o.onAgentEvent && ((event) => this.o.onAgentEvent!(id, event)),
        onSignInNeeded: () => void this.checkSignIn(),
        onIdle: () => {
          // An agent left working in a project that is no longer shown stops once its turn is over.
          if (id !== this.current?.id) {
            this.sessions.get(id)?.close();
            this.sessions.delete(id);
          }
        },
      },
    );
    this.sessions.set(id, session);
    return session;
  }

  private record(projectId: string, event: ConversationEvent) {
    const items = applyEvent(this.conversation(projectId), event);
    this.logs.set(projectId, items);
    // Kept at the start and the end of each turn, not on every word.
    if (event.type !== "text" && event.type !== "activity") writeLog(this.logFile(projectId), items);
    this.o.emitConversation(projectId, event);
  }

  private async loadModels(session: AgentSession) {
    const infos = await session.supportedModels().catch(() => undefined);
    if (!infos) return;
    this.models = modelChoices(infos);
    this.o.emitStatus(this.status());
  }

  private logFile(projectId: string) {
    return join(this.o.dataFor(projectId), "conversation.json");
  }
}

/** The models the maker can pick from, as the binary lists them, without its "default" entry. */
export function modelChoices(infos: ModelInfo[]): ModelChoice[] {
  const out: ModelChoice[] = [];
  for (const info of infos) {
    if (info.value === "default") continue;
    const id = info.resolvedModel ?? info.value;
    if (out.some((m) => m.id === id)) continue;
    out.push({ id, name: info.displayName, efforts: info.supportedEffortLevels ?? [] });
  }
  return out;
}

/** A name for a project created from the maker's first message. */
export function projectNameFrom(text: string): string {
  const first = text
    .trim()
    .split(/[\n.!?]/)[0]!
    .trim();
  const words = first.split(/\s+/).filter(Boolean);
  const name = words.slice(0, 6).join(" ");
  const short = name.length > 40 ? `${name.slice(0, 39).trimEnd()}…` : name;
  return short ? short[0]!.toUpperCase() + short.slice(1) : "Untitled website";
}

function readLog(file: string): ConversationItem[] {
  try {
    const items = JSON.parse(readFileSync(file, "utf8")) as ConversationItem[];
    if (!Array.isArray(items)) return [];
    // A turn under way when the app quit did not finish.
    return items.map((item) =>
      item.kind === "agent" && item.status === "working" ? { ...item, status: "stopped" as const } : item,
    );
  } catch {
    return [];
  }
}

function writeLog(file: string, items: ConversationItem[]) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(items));
  renameSync(tmp, file);
}
