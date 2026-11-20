// The app's side of the agent: one session per open project, on Claude or in
// Upstart's own harness after the project's model (ADR 0012), the
// conversations as shown (kept in the app's data, ADR 0001), the sign-ins and
// the models on offer.
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk";
import { clampThinkingLevel } from "@earendil-works/pi-ai";
import {
  applyEvent,
  type ConversationEvent,
  type ConversationItem,
  type PageChoice,
  type QuestionAnswer,
  waitingFor,
} from "../../shared/conversation";
import {
  type AgentMode,
  type AgentStatus,
  accountOf,
  type Effort,
  type KeyAccount,
  type ModelChoice,
  type ProjectInfo,
  type SignInMethod,
} from "../../shared/ipc";
import { en } from "../../shared/strings/en";
import { replaceFile } from "../replace-file";
import type { AgentAuth, AuthState } from "./auth";
import { CLAUDE_MODELS, claudeChoices } from "./claude-models";
import { handoverNote } from "./handover";
import { NAMING_INSTRUCTIONS, nameFromReply } from "./naming";
import type { PiAccounts } from "./pi/accounts";
import { PI_MODELS, parseModelId, piEfforts, piModel, piModelId } from "./pi/models";
import type { PiReplay } from "./pi/replay";
import { type PiDeps, PiSession } from "./pi/session";
import { Waits } from "./questions";
import type { AgentRunner, PlanDecision } from "./runner";
import { AgentSession, type SessionDeps, type SessionHandlers, userMessage } from "./session";
import type { AgentEvent } from "./stream";

export type AgentOptions = {
  auth: AgentAuth;
  /** The session's dependencies; `env` is filled in from the sign-in. */
  session: Omit<SessionDeps, "env">;
  /** Upstart's own harness: its accounts, and what its sessions need besides them. */
  pi?: {
    accounts: PiAccounts;
    deps: Omit<PiDeps, "models" | "apiKey">;
    /** Recorded replies played back in place of the providers (pi/replay.ts). */
    replay?: PiReplay;
  };
  /** Where the models Claude offers are kept between launches. */
  modelsFile?: string;
  dataFor: (projectId: string) => string;
  emitConversation: (projectId: string, event: ConversationEvent) => void;
  emitStatus: (status: AgentStatus) => void;
  onAgentEvent?: (projectId: string, event: AgentEvent) => void;
  /**
   * How a new website is named (Q407): by default, a request of its own to the
   * model; the checks give a reply here, or none while the agent is replayed.
   */
  nameWith?: (model: string, description: string) => Promise<string | undefined>;
};

/** How long a website's name may take before the one from the first sentence is kept. */
const NAMING_TIMEOUT = 30_000;

export class Agent {
  private readonly sessions = new Map<string, AgentRunner>();
  /** What a new agent is told at its first message, after a switch between Claude and the harness (Q274). */
  private readonly handovers = new Map<string, string>();
  private readonly logs = new Map<string, ConversationItem[]>();
  private current: ProjectInfo | undefined;
  private authState: AuthState | undefined;
  /** The models Claude offers, as the binary last listed them. */
  private claudeModels: ModelChoice[] = [];
  /** The cards of pages a turn waits on, whichever agent shows them (Q302), and each project's. */
  private readonly pagesWaits = new Waits<{ answer: QuestionAnswer; note?: string }>();
  private readonly pagesCards = new Map<string, Set<string>>();

  constructor(private readonly o: AgentOptions) {
    try {
      // What the binary offered last time, of the models listed now (Q398).
      if (o.modelsFile)
        this.claudeModels = (JSON.parse(readFileSync(o.modelsFile, "utf8")) as ModelChoice[]).flatMap((m) => {
          const listed = CLAUDE_MODELS.find((l) => l.id === m.id);
          return listed ? [{ ...m, name: listed.name }] : [];
        });
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

  /** A name for a new website from the maker's description, by `model` (Q407); none if the request fails. */
  async nameWebsite(model: string, description: string): Promise<string | undefined> {
    const signal = AbortSignal.timeout(NAMING_TIMEOUT);
    try {
      if (this.o.nameWith) return nameFromReply(await this.o.nameWith(model, description));
      const { account, model: id } = parseModelId(model);
      if (account === "claude") {
        const abortController = new AbortController();
        signal.addEventListener("abort", () => abortController.abort());
        const q = this.o.session.query({
          prompt: (async function* () {
            yield userMessage(description);
          })(),
          options: {
            pathToClaudeCodeExecutable: this.o.session.binary,
            env: this.o.auth.env(),
            cwd: tmpdir(),
            model,
            systemPrompt: NAMING_INSTRUCTIONS,
            tools: [],
            settingSources: [],
            maxTurns: 1,
            persistSession: false,
            abortController,
          },
        });
        for await (const m of q as AsyncIterable<{ type: string; subtype?: string; result?: string }>)
          if (m.type === "result") return m.subtype === "success" ? nameFromReply(m.result) : undefined;
        return undefined;
      }
      const pi = this.o.pi;
      const piM = piModel(account, id);
      if (!pi || !piM) return undefined;
      const level = clampThinkingLevel(piM, "minimal");
      const reply = await pi.accounts.models.completeSimple(
        piM,
        {
          systemPrompt: NAMING_INSTRUCTIONS,
          messages: [{ role: "user", content: description, timestamp: Date.now() }],
        },
        {
          apiKey: await pi.accounts.apiKey(account),
          identity: pi.deps.identity,
          signal,
          ...(level !== "off" ? { reasoning: level } : {}),
        },
      );
      if (reply.stopReason === "error" || reply.stopReason === "aborted") return undefined;
      return nameFromReply(reply.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join(""));
    } catch {
      return undefined;
    }
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

  /** What a project's agent waits for: a card of questions or a plan (Q283, Q286). */
  waitingFor(projectId: string) {
    return this.isWorking(projectId) ? waitingFor(this.conversation(projectId)) : undefined;
  }

  /** The websites whose agent waits for the maker (Q292). */
  waiting(): string[] {
    return [...this.sessions.keys()].filter((id) => this.waitingFor(id));
  }

  /**
   * Shows the card of pages of a template's adaptation in the turn under way
   * and waits for the maker's answer, or for the turn to end (Q302).
   */
  async askPages(
    projectId: string,
    pages: PageChoice[],
    signal?: AbortSignal,
  ): Promise<{ answer: QuestionAnswer; note?: string } | undefined> {
    const id = `${Date.now().toString(36)}-p${Math.random().toString(36).slice(2, 6)}`;
    const cards = this.pagesCards.get(projectId) ?? new Set<string>();
    cards.add(id);
    this.pagesCards.set(projectId, cards);
    this.record(projectId, { type: "pages", card: { id, pages, state: "waiting" } });
    const got = await this.pagesWaits.wait(id, signal);
    cards.delete(id);
    if (got)
      this.record(projectId, {
        type: "question-settled",
        id,
        state: got.answer.kind === "skipped" ? "skipped" : "answered",
        answer: got.answer,
      });
    return got;
  }

  /** The cards of pages of a project no longer wait: its turn ended or stopped. */
  private endPages(projectId: string) {
    for (const id of this.pagesCards.get(projectId) ?? []) this.pagesWaits.settle(id, undefined);
  }

  /** The maker's answer to a card of questions or of pages; `note` says what they changed by hand meanwhile (Q294). */
  answer(projectId: string, cardId: string, answer: QuestionAnswer, note?: string) {
    if (this.pagesWaits.settle(cardId, { answer, ...(note ? { note } : {}) })) return;
    this.sessions.get(projectId)?.answer(cardId, answer, note);
  }

  /** Build, or the maker's changes to the plan the agent waits on (Q290). */
  settlePlan(projectId: string, cardId: string, decision: PlanDecision, note?: string) {
    this.sessions.get(projectId)?.settlePlan(cardId, decision, note);
  }

  async stop(projectId: string) {
    this.endPages(projectId);
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

  /** The Build / Plan selector (Q286, Q296), for the next message. */
  async setMode(project: ProjectInfo, mode: AgentMode) {
    const session = this.sessions.get(project.id);
    session?.update(project);
    await session?.setMode(mode);
  }

  status(): AgentStatus {
    const auth = this.o.auth;
    const connected = this.o.pi?.accounts.connected() ?? [];
    const chatgpt = this.o.pi?.accounts.chatgptState();
    const vertexGcloud = this.o.pi?.accounts.vertexGcloud();
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
        vertex: connected.includes("vertex"),
      },
      ...(vertexGcloud ? { vertexGcloud: { project: vertexGcloud.project, signedIn: vertexGcloud.signedIn } } : {}),
      chatgpt: { signingIn: !!chatgpt?.signingIn, ...(chatgpt?.failed ? { failed: chatgpt.failed } : {}) },
      models: [...(this.authState?.loggedIn !== false ? this.claudeModels : []), ...piChoices(connected)],
    };
  }

  /** An OpenAI, Gemini or Vertex AI key for Upstart's own harness; null removes it. */
  setKey(account: KeyAccount, key: string | null) {
    this.o.pi?.accounts.setKey(account, key);
  }

  /** Vertex AI on gcloud's sign-in, for a project; null stops using it (Q280). */
  setVertexGcloud(project: string | null) {
    this.o.pi?.accounts.setVertexGcloud(project);
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
            {
              ...pi.deps,
              models: pi.replay?.models ?? pi.accounts.models,
              ...(pi.replay ? { search: pi.replay.search } : {}),
              apiKey: (account) => pi.accounts.apiKey(account),
              // On gcloud's sign-in, the maker signs in again in a terminal, not in Upstart.
              signInHelp: (account) =>
                account === "vertex" && pi.accounts.vertexGcloud() && !pi.accounts.hasVertexKey()
                  ? en.errors.gcloudSignInNeeded
                  : undefined,
            },
            handlers,
          )
        : new AgentSession(project, this.o.dataFor(id), { ...this.o.session, env: () => this.o.auth.env() }, handlers);
    this.sessions.set(id, session);
    return session;
  }

  private record(projectId: string, event: ConversationEvent) {
    if (event.type === "turn-end") this.endPages(projectId);
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

/** The Claude models the maker can pick from: those listed (Q398) that the binary offers. */
export function modelChoices(infos: ModelInfo[]): ModelChoice[] {
  return claudeChoices(infos);
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
/** Words that lead to what follows them, in English and French: a name does not end on one. */
const LEADING = new Set(
  "a an the and or of for with in on at to by from my our de du des la le les un une et ou pour avec en au aux à sur par mon ma mes notre nos".split(
    " ",
  ),
);

export function projectNameFrom(text: string): string {
  const first = text
    .trim()
    .split(/[\n.!?]/)[0]!
    .trim();
  // A clause cut short reads as a mistake: the words before a comma when they make a name,
  // never ending on a word that leads to the next ("Terra Lenta, a" → "Terra Lenta").
  const clause = first.split(/[,;:–—(]/)[0]!.trim();
  const words = (clause.split(/\s+/).length >= 2 ? clause : first).split(/\s+/).filter(Boolean).slice(0, 6);
  while (
    words.length > 1 &&
    LEADING.has(
      words
        .at(-1)!
        .toLowerCase()
        .replace(/[^\p{L}]/gu, ""),
    )
  )
    words.pop();
  const name = words.join(" ").replace(/[,;:–—-]+$/, "");
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
  replaceFile(tmp, file);
}
