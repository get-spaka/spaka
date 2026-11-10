// The contract between the app's interface (renderer) and its main process.
//
// Every channel is listed here with its argument and answer types, so that
// both sides are checked against the same definition. The preload exposes
// only these channels, and the main process accepts them only from the
// interface's own main frame.
import type { ConversationEvent, ConversationItem } from "./conversation";

export type AppInfo = {
  version: string;
  platform: string;
  background: boolean;
  versions: { electron: string; chromium: string; node: string };
};

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** A project as the sidebar lists it. */
export type ProjectSummary = { id: string; name: string; path: string };

/** An open project. `siteUrl` is where the maker put the exported site online. */
export type ProjectInfo = ProjectSummary & { model: string; effort: Effort; siteUrl?: string };

/** Where a skill comes from (ADR 0010): shipped with Upstart, the maker's for all projects, or the project's. */
export type SkillOrigin = "upstart" | "app" | "project";
export type SkillInfo = { origin: SkillOrigin; name: string; description: string; path: string };

export type ExportResult = { folder: string; pages: string[]; files: number; warnings: string[] };

export type Rect = { x: number; y: number; width: number; height: number };

export type PreviewState = {
  /** The page's address inside the project ("/", "/menu"), or null when nothing is shown. */
  route: string | null;
  title: string;
  /** The project's pages. */
  routes: { route: string; file: string }[];
  loading: boolean;
};

/** A model the maker can pick, with the effort levels it accepts. */
export type ModelChoice = { id: string; name: string; efforts: Effort[] };

export type SignInMethod = "claudeai" | "console";

export type AgentStatus = {
  /** "unknown" until the first check. */
  auth: "unknown" | "signed-in" | "signed-out" | "signing-in";
  /** How the agent is signed in: "claude.ai", "console", "api_key"… as the binary says. */
  method?: string;
  hasApiKey: boolean;
  /** While signing in: the page to open if the browser did not open by itself. */
  signInUrl?: string;
  signInFailed?: boolean;
  models: ModelChoice[];
};

/** One version of the project in its history, most recent last. */
export type HistoryEntry = {
  id: string;
  at: number;
  kind: "start" | "turn" | "outside" | "restore";
  label: string;
  /** The project's files are as this version has them. */
  current: boolean;
};

/** A project's conversation, as shown. */
export type ConversationState = { projectId: string; items: ConversationItem[] };

/** Calls from the interface that get an answer: channel → (args) → answer. */
export type Invokes = {
  "app:info": () => AppInfo;
  "projects:list": () => ProjectSummary[];
  "projects:create": (name: string) => ProjectInfo;
  "projects:open": (id: string) => ProjectInfo;
  /** Asks the maker for a folder, then opens it. Null when they cancel. */
  "projects:choose-folder": () => ProjectInfo | null;
  "projects:current": () => ProjectInfo | null;
  /** Closes the open project, back to the new-website state. */
  "projects:close": () => void;
  "preview:navigate": (route: string) => void;
  "preview:reload": () => void;
  /** The open project's conversation; empty when no project is open. */
  "conversation:get": () => ConversationState | null;
  /** Sends a message to the agent. Without an open project, a new one is created from it. */
  "conversation:send": (text: string, newProject?: { model: string; effort: Effort }) => void;
  "conversation:stop": () => void;
  "conversation:start-over": () => void;
  "agent:status": () => AgentStatus;
  "agent:sign-in": (method: SignInMethod) => void;
  "agent:cancel-sign-in": () => void;
  /** Opens, in the maker's browser, the sign-in page the binary printed. */
  "agent:open-sign-in-page": () => void;
  /** Keeps an API key for the agent, encrypted by the system; null removes it. */
  "agent:set-api-key": (key: string | null) => AgentStatus;
  "agent:set-model": (model: string) => ProjectInfo;
  "agent:set-effort": (effort: Effort) => ProjectInfo;
  /** Asks the maker for the folder to export into. Null when they cancel. */
  "export:choose-folder": () => string | null;
  /** Where the open project was last exported on this machine. */
  "export:last": () => string | null;
  "export:run": (folder: string) => ExportResult;
  "export:reveal": (folder: string) => void;
  /** Opens one of the hosting services the export guide names. */
  "export:open-host": (host: "netlify" | "cloudflare" | "github") => void;
  "projects:set-site-url": (url: string) => ProjectInfo;
  /** The skills the open project's agent gets, from every origin. */
  "skills:list": () => SkillInfo[];
  /** Asks the maker for a skill's folder. Null when they cancel. */
  "skills:choose-folder": () => string | null;
  "skills:add": (origin: "app" | "project", folder: string) => SkillInfo;
  "skills:remove": (origin: "app" | "project", name: string) => void;
  "history:list": () => HistoryEntry[];
  /** Puts the project back as a version had it (a new version is added). */
  "history:restore": (id: string) => HistoryEntry[];
  /** Goes back to the version before the last change. */
  "history:undo": () => HistoryEntry[];
};

/** One-way messages from the interface to the main process. */
export type Sends = {
  "app:ready": () => void;
  /** Where the preview sits in the window, in CSS pixels; null to hide it. */
  "preview:bounds": (rect: Rect | null) => void;
};

/** One-way messages from the main process to the interface. */
export type Events = {
  "projects:changed": (projects: ProjectSummary[]) => void;
  /** A project was opened, or null when none is open any more. */
  "project:opened": (project: ProjectInfo | null) => void;
  "preview:state": (state: PreviewState) => void;
  "conversation:event": (message: { projectId: string; event: ConversationEvent }) => void;
  "agent:status": (status: AgentStatus) => void;
  "history:changed": (message: { projectId: string; entries: HistoryEntry[] }) => void;
  /** The skills changed: added, removed, or written by the agent. */
  "skills:changed": (skills: SkillInfo[]) => void;
};

export type InvokeChannel = keyof Invokes;
export type SendChannel = keyof Sends;
export type EventChannel = keyof Events;

/** Channel names the preload lets through, by direction. */
export const channels = {
  invoke: [
    "app:info",
    "projects:list",
    "projects:create",
    "projects:open",
    "projects:choose-folder",
    "projects:current",
    "projects:close",
    "preview:navigate",
    "preview:reload",
    "conversation:get",
    "conversation:send",
    "conversation:stop",
    "conversation:start-over",
    "agent:status",
    "agent:sign-in",
    "agent:cancel-sign-in",
    "agent:open-sign-in-page",
    "agent:set-api-key",
    "agent:set-model",
    "agent:set-effort",
    "export:choose-folder",
    "export:last",
    "export:run",
    "export:reveal",
    "export:open-host",
    "projects:set-site-url",
    "skills:list",
    "skills:choose-folder",
    "skills:add",
    "skills:remove",
    "history:list",
    "history:restore",
    "history:undo",
  ],
  send: ["app:ready", "preview:bounds"],
  events: [
    "projects:changed",
    "project:opened",
    "preview:state",
    "conversation:event",
    "agent:status",
    "history:changed",
    "skills:changed",
  ],
} as const satisfies {
  invoke: readonly InvokeChannel[];
  send: readonly SendChannel[];
  events: readonly EventChannel[];
};

/** What the preload puts on `window.upstart`. */
export type Bridge = {
  invoke<C extends InvokeChannel>(
    channel: C,
    ...args: Parameters<Invokes[C]>
  ): Promise<Awaited<ReturnType<Invokes[C]>>>;
  send<C extends SendChannel>(channel: C, ...args: Parameters<Sends[C]>): void;
  /** Returns a function that stops listening. */
  on<C extends EventChannel>(channel: C, listener: Events[C]): () => void;
};

// ---- The preview's own channel ---------------------------------------------
// Between the main process and the script Upstart runs inside the preview,
// in an isolated world the project's page cannot reach.

/** From the main process to the preview's script. */
export type ToPreview =
  /** A new rendering of the page shown: morph the document into it. `final` once the files are complete. */
  | { type: "render"; html: string; final: boolean }
  /** The theme changed: replace it in place. */
  | { type: "theme"; css: string };

/** From the preview's script to the main process. */
export type FromPreview =
  | { type: "loaded"; path: string; title: string }
  | { type: "rendered"; ms: number }
  | { type: "error"; message: string; source?: string };
