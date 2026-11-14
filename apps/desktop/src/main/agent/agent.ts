// The app's side of the agent: one session per open project, on Claude or in
// Upstart's own harness after the project's model (ADR 0012), the
// conversations as shown (kept in the app's data, ADR 0001), the sign-ins and
// the models on offer.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk";
import { applyEvent, type ConversationEvent, type ConversationItem } from "../../shared/conversation";
import {
  type AgentStatus,
  accountOf,
  type Effort,
  type KeyAccount,
  type ModelChoice,
  type ProjectInfo,
  type SignInMethod,
} from "../../shared/ipc";
import { en } from "../../shared/strings/en";
import type { AgentAuth, AuthState } from "./auth";
import { handoverNote } from "./handover";
import type { PiAccounts } from "./pi/accounts";
import { PI_MODELS, piEfforts, piModel, piModelId } from "./pi/models";
import { type PiDeps, PiSession } from "./pi/session";
import type { AgentRunner } from "./runner";
import { AgentSession, type SessionDeps, type SessionHandlers } from "./session";
import type { AgentEvent } from "./stream";

export type AgentOptions = {
  auth: AgentAuth;
  /** The session's dependencies; `env` is filled in from the sign-in. */
  session: Omit<SessionDeps, "env">;
  /** Upstart's own harness: its accounts, and what its sessions need besides them. */
  pi?: { accounts: PiAccounts; deps: Omit<PiDeps, "models" | "apiKey"> };
  /** Where the models Claude offers are kept between launches. */
  modelsFile?: string;
  dataFor: (projectId: string) => string;
  emitConversation: (projectId: string, event: ConversationEvent) => void;
  emitStatus: (status: AgentStatus) => void;
  onAgentEvent?: (projectId: string, event: AgentEvent) => void;
};

export class Agent {
  private readonly sessions = new Map<string, AgentRunner>();
  /** What a new agent is told at its first message, after a switch between Claude and the harness (Q274). */
  private readonly handovers = new Map<string, string>();
  private readonly logs = new Map<string, ConversationItem[]>();
  private current: ProjectInfo | undefined;
  private authState: AuthState | undefined;
  /** The models Claude offers, as the binary last listed them. */
  private claudeModels: ModelChoice[] = [];

  constructor(private readonly o: AgentOptions) {
    try {
      if (o.modelsFile) this.claudeModels = JSON.parse(readFileSync(o.modelsFile, "utf8"));
    } catch {}
  }

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
      if (!this.modelsLoaded && session instanceof AgentSession) void this.loadModels(session);
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

  send(project: ProjectInfo, text: string, forAgent = text) {
    const handover = this.handovers.get(project.id);
    this.session(project).send(text, handover ? `${handover}\n\n${forAgent}` : forAgent);
    this.handovers.delete(project.id);
  }

  /** A line in the conversation from Upstart itself. */
  notice(projectId: string, text: string) {
    this.record(projectId, { type: "notice", id: `${Date.now().toString(36)}-n`, text, at: Date.now() });
  }

  /** Skills or connectors may have changed: an idle agent starts again with them, a working one at its next message. */
  refreshExtensions() {
    for (const session of this.sessions.values()) session.refreshExtensions();
  }

  /** The open project's connectors as its agent's kit sees them. */
  async connectorStatus(projectId: string) {
    return (await this.sessions.get(projectId)?.connectorStatus()) ?? [];
  }

  /** Starts signing in to a connector of the open project; the address to open in the browser, if any. */
  async signInConnector(projectId: string, name: string) {
    const session = this.sessions.get(projectId);
    if (!session) throw new Error(en.connectors.signInNotReady);
    return session.signInConnector(name);
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

  /**
   * A model of the same layer is switched to in the same conversation; one of
   * the other layer starts with a fresh memory, told what was said so far (Q274).
   */
  async setModel(project: ProjectInfo, model: string) {
    const session = this.sessions.get(project.id);
    const layer = (m: string) => (accountOf(m) === "claude" ? "claude" : "pi");
    const before = session instanceof PiSession ? "pi" : session ? "claude" : undefined;
    if (!session || before === layer(model)) return void (await session?.setModel(model));
    if (session.busy) await session.stop();
    session.close();
    this.sessions.delete(project.id);
    const next = this.session({ ...project, model });
    next.forget();
    const note = handoverNote(this.conversation(project.id));
    if (note) this.handovers.set(project.id, note);
    if (project.id === this.current?.id) next.start();
  }

  async setEffort(project: ProjectInfo, effort: Effort) {
    await this.sessions.get(project.id)?.setEffort(effort);
  }

  status(): AgentStatus {
    const auth = this.o.auth;
    const connected = this.o.pi?.accounts.connected() ?? [];
    const chatgpt = this.o.pi?.accounts.chatgptState();
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
      accounts: {
        chatgpt: connected.includes("chatgpt"),
        openai: connected.includes("openai"),
        gemini: connected.includes("gemini"),
      },
      chatgpt: { signingIn: !!chatgpt?.signingIn, ...(chatgpt?.failed ? { failed: chatgpt.failed } : {}) },
      models: [...(this.authState?.loggedIn !== false ? this.claudeModels : []), ...piChoices(connected)],
    };
  }

  /** An OpenAI or Gemini key for Upstart's own harness; null removes it. */
  setKey(account: KeyAccount, key: string | null) {
    this.o.pi?.accounts.setKey(account, key);
  }

  signInChatGPT() {
    void this.o.pi?.accounts.signInChatGPT();
  }

  cancelChatGPT() {
    this.o.pi?.accounts.cancelChatGPT();
  }

  async signOutChatGPT() {
    await this.o.pi?.accounts.signOutChatGPT();
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

  /** The agent's instructions changed (the reply style): idle agents start again with them. */
  instructionsChanged() {
    this.restartIdle();
  }

  private restartIdle() {
    for (const [id, session] of this.sessions)
      if (!session.busy) {
        session.close();
        if (id === this.current?.id) session.start();
      }
  }

  private session(project: ProjectInfo): AgentRunner {
    let session = this.sessions.get(project.id);
    if (session) return session;
    const id = project.id;
    const handlers: SessionHandlers = {
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
    };
    const pi = this.o.pi;
    session =
      accountOf(project.model) !== "claude" && pi
        ? new PiSession(
            project,
            this.o.dataFor(id),
            { ...pi.deps, models: pi.accounts.models, apiKey: (account) => pi.accounts.apiKey(account) },
            handlers,
          )
        : new AgentSession(project, this.o.dataFor(id), { ...this.o.session, env: () => this.o.auth.env() }, handlers);
    this.sessions.set(id, session);
    return session;
  }

  private record(projectId: string, event: ConversationEvent) {
    const items = applyEvent(this.conversation(projectId), event);
    this.logs.set(projectId, items);
    // Kept at the start and the end of each turn, not on every word.
    if (event.type !== "text" && event.type !== "thinking" && event.type !== "activity")
      writeLog(this.logFile(projectId), items);
    this.o.emitConversation(projectId, event);
  }

  private modelsLoaded = false;

  private async loadModels(session: AgentSession) {
    this.modelsLoaded = true;
    const infos = await session.supportedModels().catch(() => undefined);
    if (!infos) {
      this.modelsLoaded = false;
      return;
    }
    this.claudeModels = modelChoices(infos);
    if (this.o.modelsFile) writeFileSync(this.o.modelsFile, JSON.stringify(this.claudeModels));
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
    out.push({ id, name: info.displayName, efforts: info.supportedEffortLevels ?? [], account: "claude" });
  }
  return out;
}

/** The models of Upstart's own harness for the accounts connected (Q270, Q275). */
export function piChoices(connected: string[]): ModelChoice[] {
  return PI_MODELS.filter((m) => connected.includes(m.account)).flatMap((m) => {
    const model = piModel(m.account, m.id);
    return model
      ? [{ id: piModelId(m.account, m.id), name: m.name, efforts: piEfforts(model), account: m.account }]
      : [];
  });
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
