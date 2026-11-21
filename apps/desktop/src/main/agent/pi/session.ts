// One project's agent in Upstart's own harness (ADR 0012): pi-agent-core's
// loop on a model of the maker's ChatGPT plan or their own key, with Upstart's
// tools. Its stream becomes the same events as Claude's (stream.ts), so that
// the live preview follows what it writes, and the conversation shows it the
// same way. Its memory of the conversation is kept in the app's data, between
// launches; switching between its models keeps it (Q274).
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AgentMessage, Agent as Loop, type AgentEvent as LoopEvent } from "@earendil-works/pi-agent-core";
import {
  type Api,
  type AssistantMessage,
  type ClientIdentity,
  clampThinkingLevel,
  type Model,
  type Models,
  type ToolCall,
} from "@earendil-works/pi-ai";
import type { AgentQuestion, ConversationEvent, Grounded, QuestionAnswer } from "../../../shared/conversation";
import type { AgentMode, Effort, ProjectInfo } from "../../../shared/ipc";
import { en } from "../../../shared/strings/en";
import type { McpConfig } from "../../connectors/connectors";
import { replaceFile } from "../../replace-file";
import { type AssembledSkills, readSkill } from "../../skills/skills";
import { Activities } from "../activity";
import type { InstructionsFamily, SkillListing } from "../instructions";
import { NAMING_DEFAULTS } from "../naming";
import { parsePartialInput } from "../partial-input";
import {
  ASK_TOOL,
  CLOSED_UNANSWERED,
  NOT_ANSWERED,
  NOT_PLANNING,
  PLAN_APPROVED,
  PLAN_REFUSED,
  PLAN_TOOL,
  PLAN_WRITERS,
  planChanges,
  planMessage,
  Waits,
} from "../questions";
import type { AgentKit, AgentRunner, PlanDecision } from "../runner";
import type { SessionDeps, SessionHandlers } from "../session";
import type { AgentEvent } from "../stream";
import { upstartTools } from "../upstart-tools";
import { PiConnectors, type VaultSignIns } from "./connectors";
import {
  compactionCut,
  GO_ON,
  passingError,
  RETRY_WAITS_MS,
  SUMMARY_INSTRUCTIONS,
  transcriptOf,
  withoutSeenPictures,
  withSummary,
} from "./context";
import { familyOf, type PiAccount, parseModelId, piModel, thinkingFor } from "./models";
import type { PiRecorder } from "./replay";
import { sandboxAvailable } from "./shell";
import {
  type Answered,
  canonicalTool,
  type HarnessTool,
  piAskTool,
  piFileTools,
  piPlanTool,
  piUpstartTools,
} from "./tools";
import { FETCH_INSTRUCTIONS, type FetchedPage, PAGE_LIMIT } from "./web-fetch";
import { canSearch, providerSearch, type SearchFound, searchResult } from "./web-search";

export type PiDeps = {
  /** pi-ai's collection, its providers registered and the ChatGPT sign-in kept (accounts.ts). */
  models: Models;
  /** The maker's key for an account; undefined for the sign-in the collection keeps. */
  apiKey(account: PiAccount): Promise<string | undefined> | string | undefined;
  /** Upstart's tools and checks for a project. */
  kit(project: { id: string; path: string }): AgentKit;
  /** The instructions for a family of models, with the skills it may read. */
  instructions(family: InstructionsFamily, skills: SkillListing[], search: boolean): string;
  /** The shell's environment, and the folders it may read although they sit in a denied place. */
  env: () => Record<string, string>;
  readable: string[];
  skills?: SessionDeps["skills"];
  /** How requests name the app to providers. */
  identity?: ClientIdentity;
  /** Whether the agent gets a shell: in Upstart's sandbox on macOS (Q278), in Git Bash behind a gate on Windows (Q381). */
  shell?: boolean;
  /** On Windows, Git Bash's bash.exe, once Git for Windows is found. */
  gitBash?: () => string | undefined;
  /** The maker's connectors that are on for a project (ADR 0010, Q277), with their secrets. */
  connectorServers?: {
    servers(project: { id: string; path: string }): Record<string, McpConfig>;
    fingerprint(project: { id: string; path: string }): string;
  };
  /** Where remote connectors' sign-ins are kept, encrypted. */
  signIns?: VaultSignIns;
  /** A connector's state changed: the interface asks again. */
  onConnectorsChange?: () => void;
  /** Keeps each reply of the model, to play it back in checks (replay.ts). */
  recorder?: PiRecorder;
  /** The waits before each new try after a passing error, in place of RETRY_WAITS_MS: for checks. */
  retryWaits?: number[];
  /** The model's window in place of its own: for checks. */
  contextWindow?: number;
  /** The web search in place of the provider's: a played-back one, in checks. */
  search?: (query: string) => Promise<SearchFound>;
  /** What to tell the maker when an account's sign-in was refused, if not to connect it again in Accounts. */
  signInHelp?: (account: PiAccount) => string | undefined;
};

/** What a project's harness keeps between launches. */
type Saved = { messages: AgentMessage[] };

const SAVED_FILE = "pi-session.json";

export class PiSession implements AgentRunner {
  private loop: Loop | undefined;
  private unsubscribe: (() => void) | undefined;
  private working = false;
  private stopping = false;
  /** The agent was sent back to work once in this turn by the checks before stopping. */
  private sentBack = false;
  private readonly activities: Activities;
  /** The tool calls of the reply being written, by their place in it. */
  private readonly calls = new Map<number, { id: string; name: string; json: string }>();
  private upstartNames = new Set<string>();
  private skills: { fingerprint: string; dir: string } | undefined;
  /** The maker's connectors, connected by Upstart itself, and their fingerprint at the start. */
  private connectors: { set: PiConnectors; fingerprint: string } | undefined;
  /** The tools the agent starts with, before its connectors'. */
  private baseTools: HarnessTool[] = [];
  /** The model changed to one of another family while the agent worked: it gets its tools at the next message. */
  private rebuild = false;
  private turnStart = 0;
  /** What this turn's web searches cost, made as requests of their own (web-search.ts). */
  private searchCost = 0;
  /** What this turn's Google searches found, by tool call, shown on their activity lines (Q424, Q437). */
  private readonly grounded = new Map<string, Grounded>();
  /** The cards of questions the turn waits on (Q283). */
  private readonly waits = new Waits<QuestionAnswer>();
  /** The plans the turn waits on (Q290). */
  private readonly planWaits = new Waits<PlanDecision>();
  /** The calls of questions and plans that wait, with their tool: answered as not answered if Upstart closes. */
  private readonly openCards = new Map<string, string>();
  /** Build, or plan mode (Q286): the tools that change the project are refused until the plan is approved. */
  private mode: AgentMode;
  /** A mode chosen while the agent worked, for when its turn ends (Q436). */
  private nextMode: AgentMode | undefined;
  /** What the maker changed by hand while a question waited, told with its answer (Q294). */
  private answerNote: string | undefined;
  readonly problems: string[] = [];

  constructor(
    private project: ProjectInfo,
    private readonly dataDir: string,
    private readonly deps: PiDeps,
    private readonly handlers: SessionHandlers,
  ) {
    this.mode = project.mode ?? "build";
    this.activities = new Activities(
      () => this.project.path,
      (event) => this.conversation(event),
    );
  }

  get projectId() {
    return this.project.id;
  }

  get busy() {
    return this.working;
  }

  private get account(): PiAccount {
    const parsed = parseModelId(this.project.model);
    if (parsed.account === "claude") throw new Error(`Not a model of Upstart's own harness: ${this.project.model}`);
    return parsed.account;
  }

  private model(): Model<Api> {
    const { model } = parseModelId(this.project.model);
    const found = piModel(this.account, model);
    if (!found) throw new Error(`Unknown model: ${this.project.model}`);
    return found;
  }

  start() {
    if (this.loop) return;
    const model = this.model();
    const family = familyOf(this.account);
    const kit = this.deps.kit(this.project);
    const skills = this.assembleSkills();
    const upstart = upstartTools(kit.tools);
    this.upstartNames = new Set(upstart.map((t) => t.name));
    const tools = [
      ...piFileTools({
        root: this.project.path,
        readable: skills ? [skills.dir] : [],
        family,
        shell: this.shell(skills?.dir),
        search: canSearch(model) ? (query, signal, callId) => this.search(query, signal, callId) : undefined,
        // Played-back models answer only the recorded replies: the page itself then.
        summarize:
          typeof this.deps.models.completeSimple === "function"
            ? (page, prompt, signal) => this.summarize(page, prompt, signal)
            : undefined,
      }),
      ...piUpstartTools(upstart),
      piAskTool((callId, questions, signal) => this.ask(callId, questions, signal)),
      piPlanTool((callId, plan, signal) => this.proposePlan(callId, plan, signal)),
    ];
    this.baseTools = tools;
    this.startConnectors();
    const loop = new Loop({
      initialState: {
        systemPrompt: this.deps.instructions(family, skills?.listing ?? [], canSearch(model)),
        model,
        thinkingLevel: thinkingFor(model, this.project.effort),
        tools,
        messages: this.load().messages,
      },
      streamFn: (m, context, options) => this.deps.models.streamSimple(m, context, options),
      // A picture the model has answered goes as a line from then on (Q434).
      transformContext: async (messages) => withoutSeenPictures(messages),
      getApiKey: () => this.deps.apiKey(this.account),
      // Reads and searches of one reply run together; a reply that changes the project runs in order (tools.ts).
      toolExecution: "parallel",
      sessionId: this.project.id,
      identity: this.deps.identity,
      // Plan mode (Q286): what changes the project waits for the plan's approval.
      beforeToolCall: async ({ toolCall }) =>
        this.mode === "plan" && PLAN_WRITERS.has(canonicalTool(toolCall.name, this.upstartNames))
          ? { block: true, reason: PLAN_REFUSED }
          : undefined,
      afterToolCall: async ({ toolCall, args, result }) => {
        const note = kit.checks.afterTool(canonicalTool(toolCall.name, this.upstartNames), args);
        return note ? { content: [...result.content, { type: "text", text: note }] } : undefined;
      },
      finishTurn: async ({ message }) => {
        // The checks before stopping: what it left behind sends it back to work, once (Q217-Q246).
        if (message.stopReason !== "stop" || this.stopping || !this.working) return;
        const notes = kit.checks.beforeStop(this.sentBack);
        if (!notes) return;
        this.sentBack = true;
        loop.followUp({ role: "user", content: notes, timestamp: Date.now() });
      },
    });
    this.unsubscribe = loop.subscribe((e) => this.onLoopEvent(e));
    this.loop = loop;
    this.rebuild = false;
  }

  send(text: string, forAgent = text) {
    if (this.working) throw new Error("The agent is already working.");
    // Skills changed, or a model of the other family: the agent starts again with them, its memory kept.
    if (this.loop && (this.rebuild || this.skillsChanged() || this.connectorsChanged())) this.close();
    this.start();
    this.working = true;
    this.stopping = false;
    this.sentBack = false;
    this.calls.clear();
    this.activities.clear();
    this.turnStart = Date.now();
    this.searchCost = 0;
    this.grounded.clear();
    this.handlers.onConversation({ type: "turn-start", id: newId(), text, at: Date.now() });
    void this.run(this.loop!, this.mode === "plan" ? planMessage(forAgent) : forAgent);
  }

  async stop() {
    if (!this.working || !this.loop) return;
    this.stopping = true;
    this.waits.cancelAll();
    this.planWaits.cancelAll();
    this.loop.abort();
  }

  /**
   * The agent's shell: in Upstart's sandbox on macOS (Q278); on Windows, Git
   * Bash with no sandbox, a command that is not a plain file command on the
   * project's files asked of the maker first (Q381, Q382); elsewhere none.
   */
  private shell(skillsDir: string | undefined) {
    if (this.deps.shell === false) return undefined;
    const place = { projectDir: this.project.path, readable: this.deps.readable, skillsDir };
    if (sandboxAvailable()) return { place, env: this.deps.env };
    const bash = process.platform === "win32" ? this.deps.gitBash?.() : undefined;
    if (!bash) return undefined;
    return {
      place: { ...place, bash },
      env: this.deps.env,
      gate: (callId: string, command: string, description: string | undefined, signal?: AbortSignal) =>
        this.askToRun(callId, command, description, signal),
    };
  }

  /** Asks the maker before a command (Q382): undefined to run it, else what the agent is told instead. */
  private async askToRun(callId: string, command: string, description: string | undefined, signal?: AbortSignal) {
    const t = en.command;
    const question = t.question(command, description?.trim().replace(/\.$/, ""));
    const got = await this.ask(
      callId,
      [
        {
          question,
          header: t.header,
          options: [
            { label: t.run, description: t.runHint },
            { label: t.dontRun, description: t.dontRunHint },
          ],
          multiSelect: false,
        },
      ],
      signal,
      "Bash",
    );
    if (!got) return NOT_ANSWERED;
    const { answer } = got;
    if (answer.kind === "choices" && answer.answers[question] === t.run) return undefined;
    if (answer.kind === "words") return `The maker did not run this command, and said: ${answer.text}`;
    return "The maker did not run this command. Go on without it, or ask them about it first.";
  }

  /** Shows the agent's questions and waits for the maker's answer, or for the turn to stop (Q283). */
  private async ask(
    callId: string,
    questions: AgentQuestion[],
    signal?: AbortSignal,
    tool = ASK_TOOL,
  ): Promise<Answered | undefined> {
    if (!this.working) return undefined;
    const id = newId();
    this.openCards.set(callId, tool);
    this.conversation({ type: "question", card: { id, questions, state: "waiting" } });
    const answer = await this.waits.wait(id, signal);
    this.openCards.delete(callId);
    if (!answer) return undefined;
    this.conversation({
      type: "question-settled",
      id,
      state: answer.kind === "skipped" ? "skipped" : "answered",
      answer,
    });
    const note = this.answerNote;
    this.answerNote = undefined;
    return { answer, ...(note ? { note } : {}) };
  }

  async setModel(model: string) {
    const before = familyOf(this.account);
    this.project = { ...this.project, model };
    if (!this.loop) return;
    const now = familyOf(this.account);
    if (now !== before) {
      // Other tools and instructions: the agent starts again with them, now or after this turn.
      if (this.working) this.rebuild = true;
      else {
        this.close();
        this.start();
      }
      return;
    }
    const next = this.model();
    this.loop.state.model = next;
    this.loop.state.thinkingLevel = thinkingFor(next, this.project.effort);
  }

  async setEffort(effort: Effort) {
    this.project = { ...this.project, effort };
    if (this.loop) this.loop.state.thinkingLevel = thinkingFor(this.model(), effort);
  }

  /** Shows the agent's plan and waits for Build or the maker's changes (Q290). */
  private async proposePlan(callId: string, text: string, signal?: AbortSignal): Promise<string | undefined> {
    if (!this.working) return undefined;
    if (this.mode !== "plan") return NOT_PLANNING;
    const id = newId();
    this.openCards.set(callId, PLAN_TOOL);
    this.conversation({ type: "plan", card: { id, text, state: "proposed" } });
    const decision = await this.planWaits.wait(id, signal);
    this.openCards.delete(callId);
    if (!decision) return undefined;
    const note = this.answerNote;
    this.answerNote = undefined;
    if ("changes" in decision) {
      this.conversation({ type: "plan-settled", id, state: "replaced", changes: decision.changes });
      return planChanges(decision.changes, note);
    }
    this.conversation({ type: "plan-settled", id, state: "approved" });
    this.mode = "build";
    return PLAN_APPROVED + (note ? `\n\n${note}` : "");
  }

  answer(cardId: string, answer: QuestionAnswer, note?: string) {
    if (!this.waits.has(cardId)) return;
    this.answerNote = note;
    this.waits.settle(cardId, answer);
  }

  settlePlan(cardId: string, decision: PlanDecision, note?: string) {
    if (!this.planWaits.has(cardId)) return;
    this.answerNote = note;
    this.planWaits.settle(cardId, decision);
  }

  /**
   * The Build / Plan selector, for the next message (Q286, Q296): chosen
   * while the agent works, it takes effect when the turn ends (Q436).
   */
  async setMode(mode: AgentMode) {
    if (this.working) this.nextMode = mode === this.mode ? undefined : mode;
    else {
      this.nextMode = undefined;
      this.mode = mode;
    }
  }

  startOver() {
    this.close();
    rmSync(this.savedFile(), { force: true });
    this.handlers.onConversation({ type: "notice", id: newId(), text: en.conversation.startOverDone, at: Date.now() });
    this.start();
  }

  forget() {
    this.close();
    rmSync(this.savedFile(), { force: true });
  }

  update(project: ProjectInfo) {
    this.project = project;
  }

  close() {
    const loop = this.loop;
    this.loop = undefined;
    // What the turn did so far is kept, a question left waiting answered as such.
    if (this.working && loop) this.save([...loop.state.messages, ...this.closedCards()]);
    this.waits.cancelAll();
    this.planWaits.cancelAll();
    this.openCards.clear();
    if (this.working) this.endTurn("stopped");
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    loop?.abort();
    void this.connectors?.set.close();
    this.connectors = undefined;
  }

  refreshExtensions(): boolean {
    if (!this.loop || !(this.skillsChanged() || this.connectorsChanged())) return false;
    if (!this.working) {
      this.close();
      this.start();
    }
    return true;
  }

  /** The maker's connectors as Upstart's client sees them now (Q277). */
  async connectorStatus() {
    return this.connectors?.set.status() ?? [];
  }

  /** Starts signing in to a remote connector: the page to open in the browser, if one is needed. */
  async signInConnector(name: string): Promise<string | undefined> {
    if (!this.connectors) throw new Error(en.connectors.signInNotReady);
    return this.connectors.set.signIn(name);
  }

  private startConnectors() {
    const deps = this.deps.connectorServers;
    if (!deps || !this.deps.signIns) return;
    const set = new PiConnectors({
      servers: deps.servers(this.project),
      signIns: this.deps.signIns,
      cwd: this.project.path,
      env: this.deps.env,
      onChange: () => {
        // A connector signed in or reconnected between messages: its tools are there for the next one.
        if (this.connectors?.set === set && this.loop && !this.working) this.loop.state.tools = this.allTools();
        this.deps.onConnectorsChange?.();
      },
    });
    this.connectors = { set, fingerprint: deps.fingerprint(this.project) };
    void set.connect();
  }

  /** The results of the calls that still wait, for the agent to read at its next message. */
  private closedCards(): AgentMessage[] {
    return [...this.openCards].map(([toolCallId, toolName]) => ({
      role: "toolResult" as const,
      toolCallId,
      toolName,
      content: [{ type: "text" as const, text: CLOSED_UNANSWERED }],
      isError: true,
      timestamp: Date.now(),
    }));
  }

  private allTools(): HarnessTool[] {
    return [...this.baseTools, ...(this.connectors?.set.tools() ?? [])];
  }

  private connectorsChanged() {
    const deps = this.deps.connectorServers;
    return !!deps && !!this.connectors && deps.fingerprint(this.project) !== this.connectors.fingerprint;
  }

  private async run(loop: Loop, text: string) {
    let failure: unknown;
    let retries = 0;
    let goneOn = 0;
    try {
      // The connectors that answer in time are the agent's for this message.
      if (this.connectors) {
        this.connectors.set.reconnect();
        await this.connectors.set.ready();
        if (this.loop === loop) loop.state.tools = this.allTools();
      }
      await this.compact(loop);
      await loop.prompt(text);
      // A passing error is tried again, a reply cut by its length goes on (Q435).
      for (;;) {
        if (this.loop !== loop || this.stopping || !this.working) break;
        const last = lastReply(loop.state.messages);
        if (last?.stopReason === "error" && passingError(last.errorMessage) && retries < RETRY_WAITS_MS.length) {
          retries++;
          loop.state.messages = loop.state.messages.filter((m) => m !== last);
          const id = `retry-${this.turnStart}-${retries}`;
          const label = en.activity.retrying(retries, RETRY_WAITS_MS.length);
          this.conversation({ type: "activity", activity: { id, label, state: "running" } });
          await new Promise((r) => setTimeout(r, this.deps.retryWaits?.[retries - 1] ?? RETRY_WAITS_MS[retries - 1]));
          this.conversation({ type: "activity", activity: { id, label, state: "done" } });
          if (this.loop !== loop || this.stopping || !this.working) break;
          await loop.continue();
          continue;
        }
        if (last?.stopReason === "length" && goneOn < 2) {
          goneOn++;
          await loop.prompt(GO_ON);
          continue;
        }
        break;
      }
    } catch (e) {
      failure = e;
    }
    if (this.loop !== loop) return;
    this.save(loop.state.messages);
    const last = lastReply(loop.state.messages);
    const reason = last?.stopReason;
    const error = failure !== undefined ? String((failure as Error)?.message ?? failure) : last?.errorMessage;
    this.emitAgent({
      kind: "result",
      subtype: reason === "stop" && !failure ? "success" : "error_during_execution",
      isError: reason !== "stop" || failure !== undefined,
      text: error ?? "",
      durationMs: Date.now() - this.turnStart,
      costUsd: turnCost(loop.state.messages, this.turnStart) + this.searchCost || undefined,
    });
    if (!this.working) return;
    if (this.stopping || reason === "aborted") return this.endTurn("stopped");
    if (failure === undefined && reason === "stop") return this.endTurn("done");
    this.problems.push(`pi ${reason ?? "failure"}: ${error ?? ""}`);
    if (error && SIGN_IN.test(error)) {
      this.handlers.onSignInNeeded?.();
      return this.endTurn("failed", this.deps.signInHelp?.(this.account) ?? en.errors.accountNeeded);
    }
    return this.endTurn("failed", en.errors.agentStopped);
  }

  /**
   * Near the model's window, the oldest turns summarized by the model itself,
   * the latest kept whole (Q434); the conversation shown is unchanged, a line
   * says it happened. Without a summary (the model failed), nothing changes.
   */
  private async compact(loop: Loop) {
    if (typeof this.deps.models.completeSimple !== "function") return;
    const model = this.model();
    const messages = loop.state.messages;
    const cut = compactionCut(withoutSeenPictures(messages), this.deps.contextWindow ?? model.contextWindow);
    if (cut === undefined) return;
    const id = `compact-${this.turnStart}`;
    const label = en.activity.summarizing;
    this.conversation({ type: "activity", activity: { id, label, state: "running" } });
    try {
      const level = clampThinkingLevel(model, "low");
      const reply = await this.deps.models.completeSimple(
        model,
        {
          systemPrompt: SUMMARY_INSTRUCTIONS,
          messages: [{ role: "user", content: transcriptOf(messages.slice(0, cut)), timestamp: Date.now() }],
        },
        {
          apiKey: await this.deps.apiKey(this.account),
          identity: this.deps.identity,
          ...(level !== "off" ? { reasoning: level } : {}),
        },
      );
      this.searchCost += reply.usage?.cost?.total ?? 0;
      const summary = reply.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
      if (reply.stopReason !== "stop" || !summary.trim()) throw new Error(reply.errorMessage ?? "no summary");
      // The system's messages (the instructions, tools added on the way) stay, in their order.
      const system = messages.slice(0, cut).filter((m) => m.role === "system");
      if (this.loop === loop) loop.state.messages = [...system, ...withSummary(messages.slice(cut), summary)];
      this.conversation({ type: "activity", activity: { id, label, state: "done" } });
    } catch (e) {
      this.problems.push(`pi summary: ${(e as Error)?.message ?? e}`);
      this.conversation({ type: "activity", activity: { id, label, state: "failed" } });
    }
  }

  /**
   * WebFetch's answer from a page, by the account's small model, as the
   * binary's WebFetch answers with Haiku (Q433); the page itself if it fails.
   */
  private async summarize(page: FetchedPage, prompt: string, signal?: AbortSignal): Promise<string | undefined> {
    const small = piModel(this.account, parseModelId(NAMING_DEFAULTS[this.account]).model) ?? this.model();
    const level = clampThinkingLevel(small, "minimal");
    try {
      const reply = await this.deps.models.completeSimple(
        small,
        {
          systemPrompt: FETCH_INSTRUCTIONS,
          messages: [
            {
              role: "user",
              content: `${prompt}\n\n---\n\nThe page ${page.url}:\n\n${page.markdown.slice(0, PAGE_LIMIT)}`,
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: await this.deps.apiKey(this.account),
          identity: this.deps.identity,
          signal,
          ...(level !== "off" ? { reasoning: level } : {}),
        },
      );
      this.searchCost += reply.usage?.cost?.total ?? 0;
      if (reply.stopReason === "error" || reply.stopReason === "aborted") return undefined;
      return reply.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
    } catch {
      return undefined;
    }
  }

  /** The provider's own search, with the project's current model and account (Q276). */
  private async search(query: string, signal: AbortSignal | undefined, callId: string) {
    const found = this.deps.search ? await this.deps.search(query) : await this.providerSearch(query, signal);
    if (found.suggestions) this.grounded.set(callId, { text: found.text, suggestions: found.suggestions });
    return found.text;
  }

  private async providerSearch(query: string, signal: AbortSignal | undefined): Promise<SearchFound> {
    const found = await providerSearch({
      models: this.deps.models,
      model: this.model(),
      apiKey: await this.deps.apiKey(this.account),
      identity: this.deps.identity,
      query,
      signal,
    });
    this.searchCost += found.cost;
    const result: SearchFound = {
      text: searchResult(found),
      ...(found.suggestions ? { suggestions: found.suggestions } : {}),
    };
    this.deps.recorder?.search(query, result);
    return result;
  }

  private onLoopEvent(e: LoopEvent) {
    if (e.type === "message_start" && e.message.role === "assistant") return this.emitAgent({ kind: "request-start" });
    if (e.type === "message_update") {
      const ev = e.assistantMessageEvent;
      switch (ev.type) {
        case "text_delta":
          if (ev.delta) {
            this.emitAgent({ kind: "text", text: ev.delta });
            if (this.working) this.conversation({ type: "text", text: ev.delta });
          }
          return;
        case "thinking_delta":
          this.emitAgent({ kind: "thinking", text: ev.delta });
          if (this.working && ev.delta) this.conversation({ type: "thinking", text: ev.delta });
          return;
        case "toolcall_start": {
          const block = ev.partial.content[ev.contentIndex] as ToolCall | undefined;
          this.callAt(ev.contentIndex, block);
          return;
        }
        case "toolcall_delta": {
          const call = this.callAt(ev.contentIndex, ev.partial.content[ev.contentIndex] as ToolCall | undefined);
          if (!call || !ev.delta) return;
          call.json += ev.delta;
          const { fields, done } = parsePartialInput(call.json);
          return this.emitAgent({ kind: "tool-input", id: call.id, name: call.name, json: call.json, fields, done });
        }
        case "toolcall_end": {
          const call = this.callAt(ev.contentIndex, ev.toolCall);
          this.calls.delete(ev.contentIndex);
          if (!call) return;
          return this.emitAgent({ kind: "tool-input-end", id: call.id, name: call.name, input: ev.toolCall.arguments });
        }
      }
      return;
    }
    if (e.type === "message_end" && e.message.role === "assistant") {
      this.calls.clear();
      this.deps.recorder?.reply(e.message as AssistantMessage);
    }
    if (e.type === "tool_execution_end") {
      const content = (e.result?.content ?? []) as { type: string; text?: string }[];
      const text = content.flatMap((c) => (c.type === "text" && c.text ? [c.text] : [])).join("\n");
      this.emitAgent({
        kind: "tool-result",
        id: e.toolCallId,
        name: canonicalTool(e.toolName, this.upstartNames),
        isError: e.isError,
        text: text.slice(0, 4000),
        ...(this.grounded.has(e.toolCallId) ? { grounded: this.grounded.get(e.toolCallId) } : {}),
      });
    }
  }

  /** The call at a place in the reply, known once its id and name are. */
  private callAt(index: number, block: ToolCall | undefined) {
    const known = this.calls.get(index);
    if (known) return known;
    if (!block?.id || !block.name) return undefined;
    const call = { id: block.id, name: canonicalTool(block.name, this.upstartNames), json: "" };
    this.calls.set(index, call);
    this.emitAgent({ kind: "tool-start", id: call.id, name: call.name });
    return call;
  }

  private emitAgent(e: AgentEvent) {
    this.handlers.onAgentEvent?.(e);
    if (this.working && "id" in e) this.activities.handle(e);
  }

  private conversation(event: ConversationEvent) {
    this.handlers.onConversation(event);
  }

  private endTurn(status: "done" | "stopped" | "failed", error?: string) {
    this.working = false;
    this.stopping = false;
    if (this.nextMode) void this.setMode(this.nextMode);
    this.handlers.onConversation({ type: "turn-end", status, ...(status === "failed" ? { error } : {}) });
    this.handlers.onIdle?.();
  }

  private skillsChanged() {
    const skills = this.deps.skills;
    return !!skills && skills.fingerprint(this.project.path) !== this.skills?.fingerprint;
  }

  /** The skills, assembled into the project's agent data, listed for the instructions. */
  private assembleSkills(): { dir: string; listing: SkillListing[] } | undefined {
    const deps = this.deps.skills;
    if (!deps) return undefined;
    const fingerprint = deps.fingerprint(this.project.path);
    const assembled: AssembledSkills = deps.assemble(this.project.path, join(this.dataDir, "skills"));
    const dir = realpathSync(assembled.dir);
    const listing: SkillListing[] = [];
    for (const name of assembled.enabled) {
      const [origin, skill] = name.split(":") as [string, string];
      const folder = join(dir, origin, "skills", skill);
      const read = readSkill(folder);
      if ("problem" in read) {
        // Left out of the list, and said, as the binary says a skill it cannot load (Q433).
        this.problems.push(`skill ${name}: ${read.problem}`);
        continue;
      }
      listing.push({ name: skill, description: read.description, file: join(folder, "SKILL.md") });
    }
    this.skills = { fingerprint, dir };
    return { dir, listing };
  }

  private savedFile() {
    return join(this.dataDir, SAVED_FILE);
  }

  private load(): Saved {
    try {
      if (!existsSync(this.savedFile())) return { messages: [] };
      const saved = JSON.parse(readFileSync(this.savedFile(), "utf8")) as Saved;
      return { messages: Array.isArray(saved.messages) ? saved.messages : [] };
    } catch {
      return { messages: [] };
    }
  }

  /** Kept without the instructions, which are written afresh at each start. */
  private save(messages: AgentMessage[]) {
    // Kept as the model is sent them: a picture it answered is a line (Q434).
    const saved: Saved = { messages: withoutSeenPictures(messages.filter((m) => m.role !== "system")) };
    const tmp = `${this.savedFile()}.tmp`;
    writeFileSync(tmp, JSON.stringify(saved));
    replaceFile(tmp, this.savedFile());
  }
}

/** The model's latest reply. */
function lastReply(messages: AgentMessage[]): AssistantMessage | undefined {
  return [...messages].reverse().find((m): m is AssistantMessage => m.role === "assistant");
}

/** What says that the account's key or sign-in was refused. */
const SIGN_IN =
  /\b401\b|\b403\b|unauthori[sz]ed|invalid.?api.?key|api key|no credentials|not configured|invalid_grant|reconnect/i;

/** The turn's cost, from the replies written since it started. */
function turnCost(messages: AgentMessage[], since: number): number {
  let total = 0;
  for (const m of messages)
    if (m.role === "assistant" && m.timestamp >= since) total += (m as AssistantMessage).usage?.cost?.total ?? 0;
  return total;
}

let counter = 0;
function newId() {
  return `${Date.now().toString(36)}-p${(counter++).toString(36)}`;
}
