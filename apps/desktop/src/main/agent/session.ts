// One project's agent: a Claude Agent SDK session in streaming-input mode,
// started when the project opens and kept alive between messages, resumed
// from one launch of the app to the next. It turns the agent's stream into
// what the conversation shows, and passes the raw events on to whoever follows
// the files being written (the live preview).
import { readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import type { Query, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ConversationEvent } from "../../shared/conversation";
import type { Effort, ProjectInfo } from "../../shared/ipc";
import { en } from "../../shared/strings/en";
import type { AssembledSkills } from "../skills/skills";
import { confinement } from "./confinement";
import { UPSTART_INSTRUCTIONS } from "./instructions";
import { LOOK_TOOL } from "./preview-tool";
import { type AgentEvent, StreamReader } from "./stream";

/** The agent's tools. No MultiEdit: the live preview cannot follow it (ADR 0009). */
export const TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Bash"];

export const DENY_MESSAGE =
  "Upstart does not ask the maker for permissions. This action is refused: find another way or say what you could not do.";

type QueryFn = (params: { prompt: AsyncIterable<SDKUserMessage>; options: Record<string, unknown> }) => Query;

export type SessionDeps = {
  binary: string;
  /** The agent's environment: cleaned, with its configuration folder and the `node` launcher on PATH. */
  env: () => Record<string, string>;
  /** Folders the sandboxed shell may read although they sit in a denied place. */
  readable: string[];
  query: QueryFn;
  /** Options added to each start: Upstart's own tool server. */
  extraOptions?: () => { mcpServers?: Record<string, unknown>; allowedTools?: string[] };
  /** The connectors the agent is given, by server name, for the isolation check. */
  connectors?: string[];
  /** Builds the agent's skills for a project into `outDir` (ADR 0010). */
  skills?: {
    assemble(projectDir: string, outDir: string): AssembledSkills;
    /** Changes when the skills the agent would get change. */
    fingerprint(projectDir: string): string;
  };
  /** Keeps the agent's stream, to play it back in checks (replay.ts). */
  recorder?: { turn(): void; message(m: unknown): void };
};

export type SessionHandlers = {
  onConversation: (event: ConversationEvent) => void;
  /** Every event of the agent's stream, for the live preview. */
  onAgentEvent?: (event: AgentEvent) => void;
  /** The agent found it is not signed in. */
  onSignInNeeded?: () => void;
  /** A turn ended (whatever the outcome). */
  onIdle?: () => void;
};

export class AgentSession {
  private q: Query | undefined;
  private inbox: Inbox<SDKUserMessage> | undefined;
  private working = false;
  private stopping = false;
  /** The message of the turn under way, until the agent has started on it. */
  private pending: string | undefined;
  private started = false;
  private turnFailed: string | undefined;
  private readonly activities = new Map<string, { name: string; label: string }>();
  private stderr = "";
  /** The skills the running agent was given, and their fingerprint at the time. */
  private skills: { assembled: AssembledSkills; fingerprint: string } | undefined;
  readonly problems: string[] = [];

  constructor(
    private project: ProjectInfo,
    private readonly dataDir: string,
    private readonly deps: SessionDeps,
    private readonly handlers: SessionHandlers,
  ) {}

  get projectId() {
    return this.project.id;
  }

  get busy() {
    return this.working;
  }

  /** Starts the agent's process, so that the first message does not wait for it. */
  start() {
    if (this.q) return;
    const inbox = new Inbox<SDKUserMessage>();
    const resume = this.sessionId();
    const skills = this.assembleSkills();
    const q = this.deps.query({
      prompt: inbox,
      options: {
        ...confinement({ projectDir: this.project.path, readable: this.deps.readable, skillsDir: skills?.dir }),
        pathToClaudeCodeExecutable: this.deps.binary,
        env: this.deps.env(),
        model: this.project.model,
        effort: this.project.effort,
        systemPrompt: { type: "custom", prompt: UPSTART_INSTRUCTIONS, snapshot: false },
        tools: skills?.enabled.length ? [...TOOLS, "Skill"] : TOOLS,
        // Only Upstart's skills: the ones built into the binary stay hidden.
        skills: skills?.enabled ?? [],
        ...(skills?.plugins.length ? { plugins: skills.plugins } : {}),
        includePartialMessages: true,
        ...(resume ? { resume } : {}),
        ...this.deps.extraOptions?.(),
        stderr: (data: string) => {
          this.stderr = (this.stderr + data).slice(-4000);
        },
        // ADR 0007: the app never asks the maker. If the agent asks anyway, refuse.
        canUseTool: async () => ({ behavior: "deny", message: DENY_MESSAGE }),
      },
    });
    this.q = q;
    this.inbox = inbox;
    this.started = false;
    void this.run(q, !!resume);
  }

  /** `forAgent` is what the agent receives, when it differs from what the maker typed. */
  send(text: string, forAgent = text) {
    if (this.working) throw new Error("The agent is already working.");
    // Skills added, removed or written since the agent started: it starts
    // again with them, resuming the conversation (ADR 0010).
    if (this.q && this.skillsChanged()) this.close();
    this.start();
    this.working = true;
    this.stopping = false;
    this.turnFailed = undefined;
    this.pending = forAgent;
    this.activities.clear();
    this.handlers.onConversation({ type: "turn-start", id: newId(), text, at: Date.now() });
    this.deps.recorder?.turn();
    this.inbox!.push(userMessage(forAgent));
  }

  async stop() {
    if (!this.working || !this.q) return;
    this.stopping = true;
    await this.q.interrupt().catch(() => {});
  }

  async setModel(model: string) {
    this.project = { ...this.project, model };
    await this.q?.setModel(model).catch(() => this.restart());
  }

  async setEffort(effort: Effort) {
    this.project = { ...this.project, effort };
    await this.q?.applyFlagSettings({ effortLevel: effort }).catch(() => this.restart());
  }

  /** The models the agent offers, with the effort levels each accepts. Works before signing in. */
  supportedModels() {
    this.start();
    return this.q!.supportedModels();
  }

  /** Clears the agent's memory of the conversation; what is shown stays. */
  startOver() {
    this.close();
    rmSync(this.sessionFile(), { force: true });
    this.handlers.onConversation({ type: "notice", id: newId(), text: en.conversation.startOverDone, at: Date.now() });
    this.start();
  }

  /** The project's folder moved or its settings changed while closed. */
  update(project: ProjectInfo) {
    this.project = project;
  }

  close() {
    const q = this.q;
    this.q = undefined;
    this.inbox?.close();
    this.inbox = undefined;
    if (this.working) this.endTurn("stopped");
    q?.close();
  }

  /** Whether the skills changed since the agent started; restarts an idle agent with them. */
  refreshSkills(): boolean {
    if (!this.q || !this.skillsChanged()) return false;
    if (!this.working) this.restart();
    return true;
  }

  private skillsChanged() {
    const deps = this.deps.skills;
    return !!deps && deps.fingerprint(this.project.path) !== this.skills?.fingerprint;
  }

  private assembleSkills(): AssembledSkills | undefined {
    const deps = this.deps.skills;
    if (!deps) return undefined;
    const fingerprint = deps.fingerprint(this.project.path);
    const assembled = deps.assemble(this.project.path, join(this.dataDir, "skills"));
    // The agent sees real paths (/private/var rather than /var on macOS).
    const dir = realpathSync(assembled.dir);
    const real = {
      dir,
      enabled: assembled.enabled,
      plugins: assembled.plugins.map((p) => ({ ...p, path: p.path.replace(assembled.dir, dir) })),
    };
    this.skills = { assembled: real, fingerprint };
    return real;
  }

  private restart() {
    if (this.working) return;
    this.close();
    this.start();
  }

  private async run(q: Query, resumed: boolean) {
    const reader = new StreamReader((e) => this.onEvent(e));
    let failure: unknown;
    try {
      for await (const m of q) {
        if (this.q !== q) break;
        this.deps.recorder?.message(m);
        reader.read(m);
      }
    } catch (e) {
      failure = e;
    }
    if (this.q !== q) return;
    this.q = undefined;
    this.inbox = undefined;
    if (failure !== undefined) this.problems.push(`${String((failure as Error)?.message ?? failure)}\n${this.stderr}`);
    // A conversation that cannot be resumed (another machine, a cleared
    // folder) is started again from scratch, with the message under way.
    if (resumed && !this.started && this.working && this.pending !== undefined) {
      rmSync(this.sessionFile(), { force: true });
      const text = this.pending;
      this.start();
      this.inbox!.push(userMessage(text));
      return;
    }
    if (this.working) this.endTurn(this.stopping ? "stopped" : "failed", this.turnFailed ?? en.errors.agentStopped);
  }

  private onEvent(e: AgentEvent) {
    this.handlers.onAgentEvent?.(e);
    switch (e.kind) {
      case "init": {
        this.started = true;
        this.pending = undefined;
        this.saveSessionId(e.sessionId);
        const problem = isolationProblem(e, this.deps.connectors, this.skills?.assembled);
        if (problem) {
          this.problems.push(problem);
          this.turnFailed = en.errors.notIsolated;
          void this.q?.interrupt().catch(() => {});
        }
        return;
      }
      case "text":
        if (this.working) this.handlers.onConversation({ type: "text", text: e.text });
        return;
      case "tool-start":
        return this.activity(e.id, e.name, {}, "running");
      case "tool-input":
        // Only complete fields: a path is shown once, not letter by letter.
        return this.activity(e.id, e.name, complete(e.fields, e.done), "running");
      case "tool-input-end":
        return this.activity(e.id, e.name, e.input, "running");
      case "tool-result":
        return this.activity(e.id, e.name, undefined, e.isError ? "failed" : "done");
      case "permission-denied":
        return this.activity(e.id, e.name, undefined, "refused");
      case "auth":
        this.turnFailed = en.errors.signInNeeded;
        this.handlers.onSignInNeeded?.();
        return;
      case "result": {
        if (!this.working) return;
        if (this.stopping) return this.endTurn("stopped");
        if (this.turnFailed) return this.endTurn("failed", this.turnFailed);
        if (e.subtype === "success" && !e.isError) return this.endTurn("done");
        if (e.subtype === "error_max_turns") return this.endTurn("failed", en.errors.agentLimit);
        if (/not logged in|log in|login|authenticat|api key/i.test(e.text)) {
          this.handlers.onSignInNeeded?.();
          return this.endTurn("failed", en.errors.signInNeeded);
        }
        this.problems.push(`result ${e.subtype}: ${e.text}`);
        return this.endTurn("failed", en.errors.agentStopped);
      }
    }
  }

  private activity(
    id: string,
    name: string,
    input: Record<string, unknown> | undefined,
    state: "running" | "done" | "failed" | "refused",
  ) {
    if (!this.working) return;
    const known = this.activities.get(id);
    const label = input
      ? activityLabel(name, input, this.project.path)
      : (known?.label ?? activityLabel(name, {}, this.project.path));
    // A tool's input streams in many small pieces: send only what changes the line.
    if (known && known.label === label && state === "running") return;
    this.activities.set(id, { name, label });
    this.handlers.onConversation({ type: "activity", activity: { id, label, state } });
  }

  private endTurn(status: "done" | "stopped" | "failed", error?: string) {
    this.working = false;
    this.stopping = false;
    this.pending = undefined;
    this.handlers.onConversation({ type: "turn-end", status, ...(status === "failed" ? { error } : {}) });
    this.handlers.onIdle?.();
  }

  private sessionFile() {
    return join(this.dataDir, "agent.json");
  }

  private sessionId(): string | undefined {
    try {
      const id = JSON.parse(readFileSync(this.sessionFile(), "utf8"))?.sessionId;
      return typeof id === "string" ? id : undefined;
    } catch {
      return undefined;
    }
  }

  private saveSessionId(sessionId: string) {
    if (this.sessionId() === sessionId) return;
    writeFileSync(this.sessionFile(), JSON.stringify({ sessionId }));
  }
}

/** The short line shown for a tool call. */
export function activityLabel(name: string, input: Record<string, unknown>, projectDir: string): string {
  const path = typeof input.file_path === "string" ? shortPath(input.file_path, projectDir) : undefined;
  switch (name) {
    case "Write":
      return en.activity.write(path);
    case "Edit":
      return en.activity.edit(path);
    case "Read":
      return en.activity.read(path);
    case "Glob":
    case "Grep":
      return en.activity.search;
    case "Bash": {
      const what =
        typeof input.description === "string" && input.description
          ? input.description
          : typeof input.command === "string"
            ? input.command.split("\n")[0]!
            : "";
      return en.activity.run(what.length > 60 ? `${what.slice(0, 59)}…` : what || undefined);
    }
    case LOOK_TOOL:
      return en.activity.look;
    case "Skill":
      // "project:menu-format" is shown as "menu-format".
      return en.activity.skill(typeof input.skill === "string" ? input.skill.replace(/^[\w-]+:/, "") : undefined);
    default:
      return en.activity.other(name);
  }
}

function complete(fields: Record<string, string>, done: Record<string, boolean>) {
  return Object.fromEntries(Object.entries(fields).filter(([name]) => done[name]));
}

function shortPath(file: string, projectDir: string): string {
  if (!isAbsolute(file)) return file;
  // The agent sees the folder's real path (/private/var/… for /var/…).
  for (const root of [projectDir, realPath(projectDir)]) {
    const rel = relative(root, file);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel.split("\\").join("/");
  }
  return file;
}

function realPath(path: string) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * What would show that the agent did not start in Upstart's isolated setup
 * (ADR 0010): a tool or a connector Upstart did not give it.
 */
export function isolationProblem(
  init: Extract<AgentEvent, { kind: "init" }>,
  connectors: string[] = [],
  skills?: AssembledSkills,
): string | undefined {
  const tools = skills?.enabled.length ? [...TOOLS, "Skill"] : TOOLS;
  const extraTools = init.tools.filter(
    (t) => !tools.includes(t) && !connectors.some((c) => t.startsWith(`mcp__${c}__`)),
  );
  if (extraTools.length) return `unexpected tools: ${extraTools.join(", ")}`;
  const extraServers = init.mcpServers.filter((s) => !connectors.includes(s.name));
  if (extraServers.length) return `unexpected connectors: ${extraServers.map((s) => s.name).join(", ")}`;
  // The binary's own plugins are built in; any other must be one Upstart assembled.
  const ours = new Set(skills?.plugins.map((p) => p.path));
  const extraPlugins = init.plugins.filter((p) => p.path !== "builtin" && !ours.has(p.path));
  if (extraPlugins.length) return `unexpected plugins: ${extraPlugins.map((p) => p.name).join(", ")}`;
  return undefined;
}

function userMessage(text: string): SDKUserMessage {
  return { type: "user", message: { role: "user", content: text }, parent_tool_use_id: null } as SDKUserMessage;
}

let counter = 0;
function newId() {
  return `${Date.now().toString(36)}-${(counter++).toString(36)}`;
}

/** An async queue: the agent's input, fed one message at a time. */
export class Inbox<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private wake: (() => void) | undefined;
  private closed = false;

  push(item: T) {
    if (this.closed) return;
    this.items.push(item);
    this.wake?.();
  }

  close() {
    this.closed = true;
    this.wake?.();
  }

  async *[Symbol.asyncIterator]() {
    for (;;) {
      while (this.items.length) yield this.items.shift()!;
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
      this.wake = undefined;
    }
  }
}
