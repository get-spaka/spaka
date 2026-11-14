// One project's agent in Upstart's own harness (ADR 0012): pi-agent-core's
// loop on a model of the maker's ChatGPT plan or their own key, with Upstart's
// tools. Its stream becomes the same events as Claude's (stream.ts), so that
// the live preview follows what it writes, and the conversation shows it the
// same way. Its memory of the conversation is kept in the app's data, between
// launches; switching between its models keeps it (Q274).
import { existsSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AgentMessage, Agent as Loop, type AgentEvent as LoopEvent } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, ClientIdentity, Model, Models, ToolCall } from "@earendil-works/pi-ai";
import type { ConversationEvent } from "../../../shared/conversation";
import type { Effort, ProjectInfo } from "../../../shared/ipc";
import { en } from "../../../shared/strings/en";
import { type AssembledSkills, readSkill } from "../../skills/skills";
import { Activities } from "../activity";
import type { InstructionsFamily, SkillListing } from "../instructions";
import { parsePartialInput } from "../partial-input";
import type { AgentKit, AgentRunner } from "../runner";
import type { SessionDeps, SessionHandlers } from "../session";
import type { AgentEvent } from "../stream";
import { upstartTools } from "../upstart-tools";
import { familyOf, type PiAccount, parseModelId, piModel, thinkingFor } from "./models";
import { shellAvailable } from "./shell";
import { canonicalTool, piFileTools, piUpstartTools } from "./tools";

export type PiDeps = {
  /** pi-ai's collection, its providers registered and the ChatGPT sign-in kept (accounts.ts). */
  models: Models;
  /** The maker's key for an account; undefined for the sign-in the collection keeps. */
  apiKey(account: PiAccount): Promise<string | undefined> | string | undefined;
  /** Upstart's tools and checks for a project. */
  kit(project: { id: string; path: string }): AgentKit;
  /** The instructions for a family of models, with the skills it may read. */
  instructions(family: InstructionsFamily, skills: SkillListing[]): string;
  /** The shell's environment, and the folders it may read although they sit in a denied place. */
  env: () => Record<string, string>;
  readable: string[];
  skills?: SessionDeps["skills"];
  /** How requests name the app to providers. */
  identity?: ClientIdentity;
  /** Whether the agent gets a shell: only where Upstart's sandbox holds (Q278). */
  shell?: boolean;
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
  /** The model changed to one of another family while the agent worked: it gets its tools at the next message. */
  private rebuild = false;
  private turnStart = 0;
  readonly problems: string[] = [];

  constructor(
    private project: ProjectInfo,
    private readonly dataDir: string,
    private readonly deps: PiDeps,
    private readonly handlers: SessionHandlers,
  ) {
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
        shell:
          this.deps.shell !== false && shellAvailable()
            ? {
                place: { projectDir: this.project.path, readable: this.deps.readable, skillsDir: skills?.dir },
                env: this.deps.env,
              }
            : undefined,
      }),
      ...piUpstartTools(upstart),
    ];
    const loop = new Loop({
      initialState: {
        systemPrompt: this.deps.instructions(family, skills?.listing ?? []),
        model,
        thinkingLevel: thinkingFor(model, this.project.effort),
        tools,
        messages: this.load().messages,
      },
      streamFn: (m, context, options) => this.deps.models.streamSimple(m, context, options),
      getApiKey: () => this.deps.apiKey(this.account),
      // Reads and searches of one reply run together; a reply that changes the project runs in order (tools.ts).
      toolExecution: "parallel",
      sessionId: this.project.id,
      identity: this.deps.identity,
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
    if (this.loop && (this.rebuild || this.skillsChanged())) this.close();
    this.start();
    this.working = true;
    this.stopping = false;
    this.sentBack = false;
    this.calls.clear();
    this.activities.clear();
    this.turnStart = Date.now();
    this.handlers.onConversation({ type: "turn-start", id: newId(), text, at: Date.now() });
    void this.run(this.loop!, forAgent);
  }

  async stop() {
    if (!this.working || !this.loop) return;
    this.stopping = true;
    this.loop.abort();
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
    if (this.working) this.endTurn("stopped");
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    loop?.abort();
  }

  refreshExtensions(): boolean {
    if (!this.loop || !this.skillsChanged()) return false;
    if (!this.working) {
      this.close();
      this.start();
    }
    return true;
  }

  // The maker's connectors reach the harness through Upstart's own client, later (Q277).
  async connectorStatus() {
    return [];
  }

  async signInConnector(): Promise<string | undefined> {
    throw new Error(en.connectors.signInUnsupported);
  }

  private async run(loop: Loop, text: string) {
    let failure: unknown;
    try {
      await loop.prompt(text);
    } catch (e) {
      failure = e;
    }
    if (this.loop !== loop) return;
    this.save(loop.state.messages);
    const last = [...loop.state.messages].reverse().find((m): m is AssistantMessage => m.role === "assistant");
    const reason = last?.stopReason;
    const error = failure !== undefined ? String((failure as Error)?.message ?? failure) : last?.errorMessage;
    this.emitAgent({
      kind: "result",
      subtype: reason === "stop" && !failure ? "success" : "error_during_execution",
      isError: reason !== "stop" || failure !== undefined,
      text: error ?? "",
      durationMs: Date.now() - this.turnStart,
      costUsd: turnCost(loop.state.messages, this.turnStart),
    });
    if (!this.working) return;
    if (this.stopping || reason === "aborted") return this.endTurn("stopped");
    if (failure === undefined && reason === "stop") return this.endTurn("done");
    this.problems.push(`pi ${reason ?? "failure"}: ${error ?? ""}`);
    if (error && SIGN_IN.test(error)) {
      this.handlers.onSignInNeeded?.();
      return this.endTurn("failed", en.errors.accountNeeded);
    }
    return this.endTurn("failed", en.errors.agentStopped);
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
    if (e.type === "message_end" && e.message.role === "assistant") this.calls.clear();
    if (e.type === "tool_execution_end") {
      const content = (e.result?.content ?? []) as { type: string; text?: string }[];
      const text = content.map((c) => (c.type === "text" ? (c.text ?? "") : "")).join("");
      this.emitAgent({
        kind: "tool-result",
        id: e.toolCallId,
        name: canonicalTool(e.toolName, this.upstartNames),
        isError: e.isError,
        text: text.slice(0, 4000),
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
      if ("problem" in read) continue;
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
    const saved: Saved = { messages: messages.filter((m) => m.role !== "system") };
    const tmp = `${this.savedFile()}.tmp`;
    writeFileSync(tmp, JSON.stringify(saved));
    renameSync(tmp, this.savedFile());
  }
}

/** What says that the account's key or sign-in was refused. */
const SIGN_IN =
  /\b401\b|\b403\b|unauthori[sz]ed|invalid.?api.?key|api key|no credentials|not configured|invalid_grant|reconnect/i;

/** The turn's cost, from the replies written since it started. */
function turnCost(messages: AgentMessage[], since: number): number | undefined {
  let total = 0;
  for (const m of messages)
    if (m.role === "assistant" && m.timestamp >= since) total += (m as AssistantMessage).usage?.cost?.total ?? 0;
  return total || undefined;
}

let counter = 0;
function newId() {
  return `${Date.now().toString(36)}-p${(counter++).toString(36)}`;
}
