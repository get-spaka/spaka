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
  /** The folder new websites go into. */
  projectsDir: string;
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

/** The kinds of the gallery's blocks (Q92), in the order a page usually has them. */
export const BLOCK_KINDS = ["header", "hero", "features", "testimonials", "pricing", "faq", "cta", "footer"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
/** The type of the data a block dragged from the Blocks tab carries: its id. */
export const BLOCK_DRAG_TYPE = "application/x-upstart-block";
/** A block of the gallery, as described in its block.json. */
export type GalleryBlock = {
  id: string;
  kind: BlockKind;
  name: string;
  description: string;
  tags: string[];
  mood: string[];
  synonyms: string[];
};

/** Values of the theme's core variables, by name ("--theme-color-primary" → "#9a3412"). */
export type ThemeValues = Record<string, string>;
/** A font the Theme tab offers (Q93): the system's own, or one shipped with Upstart and copied into the project. */
export type FontChoice = { id: string; name: string; category: string; stack: string; shipped: boolean };

/** Where a connector is kept (ADR 0010): the app's data, or the project's folder. */
export type ConnectorScope = "app" | "project";
/**
 * - on: the agent gets it;
 * - needs-approval: a project's local program, not approved on this machine;
 * - needs-secret: a value the connector needs is not set here;
 * - replaced: the project has a connector of the same name.
 */
export type ConnectorState = "on" | "needs-approval" | "needs-secret" | "replaced";
export type ConnectorInfo = {
  scope: ConnectorScope;
  name: string;
  kind: "remote" | "local";
  /** The address, or the command line. */
  target: string;
  secrets: { name: string; set: boolean }[];
  state: ConnectorState;
  /** As the agent's kit reports it, once the agent started with it. */
  status?: "connected" | "failed" | "needs-auth" | "pending" | "disabled";
  error?: string;
  /** A remote connector's sign-in settings, when not the default (Q108). */
  oauth?: { clientId?: string; callbackPort?: number; authServerMetadataUrl?: string };
};
export type ConnectorDraft = {
  name: string;
  kind: "remote" | "local";
  /** The address, or the command line. */
  target: string;
  transport?: "http" | "sse";
  /** Header values (remote) or environment variables (local), kept encrypted by the app. */
  secrets?: { name: string; value: string }[];
  /** For a remote connector whose service wants an app declared with it (Q108); empty fields are left out. */
  oauth?: { clientId?: string; callbackPort?: string; authServerMetadataUrl?: string };
};

export type ExportResult = { folder: string; pages: string[]; files: number; warnings: string[] };

export type Rect = { x: number; y: number; width: number; height: number };
/**
 * A tablet or a phone shown in the preview (Q110): the page is laid out at the
 * device's size, drawn at `scale` to fit the column, its corners rounded.
 */
export type DeviceView = { width: number; height: number; scale: number; radius: number };

export type PreviewState = {
  /** The page's address inside the project ("/", "/menu"), or null when nothing is shown. */
  route: string | null;
  title: string;
  /** The project's pages. */
  routes: { route: string; file: string }[];
  loading: boolean;
  mode: PreviewMode;
  /** A short hash of the project's theme: the gallery's thumbnails are drawn again when it changes. */
  theme: string;
  /** One page, or every page as thumbnails (Q128). */
  view: PreviewView;
  /** The page the agent is writing, while it is (Q134). */
  writing: string | null;
  /** Which landing of the zoom is being tried (Q142, until the maker chooses). */
  zoomTrial: ZoomTrial;
};

/**
 * The zoom from a thumbnail to its page, two ways to land it without a jump
 * (Q142, being tried): crossfaded into a picture of the real page at its
 * size; with thumbnails pictured at the preview's own size; or both.
 */
export type ZoomTrial = "crossfade" | "panel" | "both";

export type PreviewView = "page" | "pages";

/**
 * A zoom between the page and the thumbnails (Q133): to the thumbnails, from a
 * picture of the page shown (`url`); to a page, from its thumbnail.
 */
export type PreviewZoom = { to: PreviewView; route: string; url?: string };

/**
 * The page a zoom goes to is loaded and drawn at its size, out of sight: the
 * zoom may land (Q142). With `url`, a picture of it, to crossfade into.
 */
export type PreviewZoomReady = { route: string; url?: string };

/** A page's thumbnail in the "All pages" view: where it goes, and whether it is on screen (Q130). */
export type GridCell = {
  route: string;
  /** What shows of it: a thumbnail partly scrolled out is cut to the part on screen. */
  rect: Rect;
  visible: boolean;
  /** How much of its top is scrolled out, in the interface's pixels: its page moves up by as much. */
  clipTop?: number;
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
  kind: "start" | "turn" | "outside" | "restore" | "hand";
  label: string;
  /** The project's files are as this version has them. */
  current: boolean;
};

/**
 * An edit the maker makes by hand, written by the app (Q90). `file` is the
 * template, `at` where the element's start tag (or the include) begins, as
 * the trace gives them.
 */
export type EditAction =
  /** `tags` are the element's inline tags as shown, which must be those of the source. */
  | { type: "text"; file: string; at: number; texts: string[]; tags?: string[] }
  | { type: "link"; file: string; at: number; href: string }
  | { type: "duplicate"; file: string; at: number }
  | { type: "delete"; file: string; at: number }
  /** Moves the section starting at `at` to just before the one starting at `before` (null: after the last one). */
  | { type: "move"; file: string; at: number; before: number | null }
  /**
   * Puts a gallery block into the page as a shared part of its own (Q101), before
   * the section starting at `before` (null: after the last one; "auto": where a
   * block of its kind usually goes).
   */
  | { type: "insert"; file: string; before: number | null | "auto"; block: string };

/** What the preview needs to know before the maker edits an element. */
export type EditInfo = {
  /** Its text can be edited in place. */
  text: boolean;
  /** Its text is computed by Liquid: the agent changes it. */
  computed: boolean;
  /** It can be duplicated, deleted or moved by hand. */
  movable: boolean;
  /** For an element of a shared part: how many pages use that part. */
  sharedBy: number;
};

/** A project's conversation, as shown. */
export type ConversationState = { projectId: string; items: ConversationItem[] };

/** The categories of the settings window (Q117), in the order of its sidebar. */
export const SETTINGS_PAGES = ["general", "agent", "skills", "connectors", "privacy", "about"] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

export const TEXT_SIZES = ["small", "medium", "large"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
/** How the agent writes to the maker (Q125); not how it writes the website. */
export const REPLY_STYLES = ["short", "explained", "teaching"] as const;
export type ReplyStyle = (typeof REPLY_STYLES)[number];
/** How much of the agent's work the conversation shows (Q127). */
export const OUTPUT_STYLES = ["discreet", "normal", "detailed"] as const;
export type OutputStyle = (typeof OUTPUT_STYLES)[number];

/** The app's own settings, for every website, kept on this computer. */
export type AppSettings = {
  /** The model and effort a new website starts with. */
  newModel: string;
  newEffort: Effort;
  /** Anonymous usage statistics (decisions: on by default; nothing is sent before the polish step). */
  statistics: boolean;
  /** The interface's text size; the website keeps its own. */
  textSize: TextSize;
  replyStyle: ReplyStyle;
  outputStyle: OutputStyle;
  /** A system notification when the agent finishes while Upstart is not in front. */
  notifyDone: boolean;
};
export const DEFAULT_APP_SETTINGS: AppSettings = {
  newModel: "claude-sonnet-5-5",
  newEffort: "medium",
  statistics: true,
  textSize: "medium",
  replyStyle: "short",
  outputStyle: "discreet",
  notifyDone: true,
};

/** Calls from the interface that get an answer: channel → (args) → answer. */
export type Invokes = {
  "app:info": () => AppInfo;
  /** Opens the settings panel over the window (Q123), at a page. */
  "settings:open": (page?: SettingsPage) => void;
  "settings:get": () => AppSettings;
  "settings:set": (change: Partial<AppSettings>) => AppSettings;
  /** Shows the websites' folder in the Finder. */
  "settings:reveal-projects": () => void;
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
  "preview:set-mode": (mode: PreviewMode) => void;
  /** One page or every page (Q128). */
  /** `route`: the page opened, for the zoom from its thumbnail (Q133). */
  "preview:set-view": (view: PreviewView, route?: string) => void;
  /** Opens a page from its thumbnail, zooming to it (Q132, Q133). */
  "preview:open-page": (route: string) => void;
  /** A page's right-click menu in the "All pages" view (Q136). */
  "preview:page-menu": (route: string) => void;
  "comments:list": () => PageComment[];
  /** Sends the open project's comments to the agent as one message (Q95). */
  "comments:send": () => void;
  "comments:discard": () => void;
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
  "connectors:list": () => ConnectorInfo[];
  "connectors:add": (scope: ConnectorScope, draft: ConnectorDraft) => void;
  "connectors:remove": (scope: ConnectorScope, name: string) => void;
  "connectors:set-secrets": (scope: ConnectorScope, name: string, values: Record<string, string>) => void;
  /** Turns on a project's local connector on this machine, as its command is now. */
  "connectors:approve": (name: string) => void;
  /** Starts signing in to a connector; the address opened in the browser, if one was needed. */
  "connectors:sign-in": (name: string) => { url?: string };
  "history:list": () => HistoryEntry[];
  /** Puts the project back as a version had it (a new version is added). */
  "history:restore": (id: string) => HistoryEntry[];
  /** Goes back to the version before the last change. */
  "history:undo": () => HistoryEntry[];
  /** An edit by hand; throws with the reason when it cannot be made. */
  "editing:apply": (action: EditAction) => { label: string; files: string[] };
  "gallery:list": () => GalleryBlock[];
  /** A block drawn with the open project's theme, as a PNG data URL. */
  "gallery:thumbnail": (id: string) => string;
  /** Puts a block into the page shown, where a block of its kind usually goes. */
  "gallery:add": (id: string) => { label: string; files: string[] };
  /** The theme's core values as theme.css sets them, and the fonts the Theme tab offers. */
  "theme:get": () => { values: ThemeValues; fonts: FontChoice[]; own?: ThemeValues };
  /** Shows these values in the preview, during a gesture, without writing them. */
  "theme:show": (values: ThemeValues) => void;
  /** Writes these values into theme.css, at the end of a gesture: one version (Q93). */
  /** `own`: the colours also become the project's "Site's own" palette (Q114). */
  "theme:apply": (values: ThemeValues, own?: boolean) => { label: string; files: string[] };
};

/** One-way messages from the interface to the main process. */
export type Sends = {
  "app:ready": () => void;
  /** Where the preview sits in the window, in CSS pixels; null to hide it. */
  /** `area` is the whole of the preview's column, when a device is shown smaller inside it. */
  /** `parked`: the page is not shown (the thumbnails, a zoom) but kept drawn at its place's size, out of sight. */
  "preview:bounds": (rect: Rect | null, device?: DeviceView, area?: Rect, parked?: boolean) => void;
  /**
   * The thumbnails of the "All pages" view, in CSS pixels, and the screen their
   * pages are laid out on (Q129); null hides them.
   */
  /** `panel`: the screen is the preview's own size, in CSS pixels (Q142, being tried). */
  "preview:grid": (
    cells: GridCell[] | null,
    screen?: { width: number; height: number; mobile: boolean; panel?: boolean },
  ) => void;
  /** Shows a gallery block large over the preview while the pointer rests on it (Q109); null hides it. */
  "gallery:peek": (id: string | null) => void;
};

/** One-way messages from the main process to the interface. */
export type Events = {
  "projects:changed": (projects: ProjectSummary[]) => void;
  /** A project was opened, or null when none is open any more. */
  "project:opened": (project: ProjectInfo | null) => void;
  "preview:state": (state: PreviewState) => void;
  /** The pointer is over a page's thumbnail, or left it (Q132). */
  "preview:hover": (route: string | null) => void;
  /** A page's picture in the "All pages" view, as a data URL (Q141). */
  "preview:picture": (picture: { route: string; url: string }) => void;
  /** The preview goes between one page and all of them: the interface zooms (Q133). */
  "preview:zoom": (zoom: PreviewZoom) => void;
  /** The page zoomed to is drawn, out of sight: the zoom may land (Q142). */
  "preview:zoom-ready": (ready: PreviewZoomReady) => void;
  /** A page was deleted from its thumbnail's menu: a note offers to undo it (Q137). */
  "preview:page-deleted": (page: { route: string }) => void;
  /** Text to put in the message field, which takes the keyboard ("Ask the agent about it", Q136). */
  "conversation:prefill": (text: string) => void;
  "conversation:event": (message: { projectId: string; event: ConversationEvent }) => void;
  "agent:status": (status: AgentStatus) => void;
  "history:changed": (message: { projectId: string; entries: HistoryEntry[] }) => void;
  /** The skills changed: added, removed, or written by the agent. */
  "skills:changed": (skills: SkillInfo[]) => void;
  "connectors:changed": (connectors: ConnectorInfo[]) => void;
  "comments:changed": (comments: PageComment[]) => void;
  "settings:changed": (settings: AppSettings) => void;
  /** The settings panel is asked to open at a page, or to open or close (⌘, in the menu). */
  "settings:show": (request: { page?: SettingsPage; toggle?: boolean }) => void;
};

export type InvokeChannel = keyof Invokes;
export type SendChannel = keyof Sends;
export type EventChannel = keyof Events;

/** Channel names the preload lets through, by direction. */
export const channels = {
  invoke: [
    "app:info",
    "settings:open",
    "settings:get",
    "settings:set",
    "settings:reveal-projects",
    "projects:list",
    "projects:create",
    "projects:open",
    "projects:choose-folder",
    "projects:current",
    "projects:close",
    "preview:navigate",
    "preview:reload",
    "preview:set-mode",
    "preview:set-view",
    "preview:open-page",
    "preview:page-menu",
    "comments:list",
    "comments:send",
    "comments:discard",
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
    "connectors:list",
    "connectors:add",
    "connectors:remove",
    "connectors:set-secrets",
    "connectors:approve",
    "connectors:sign-in",
    "history:list",
    "history:restore",
    "history:undo",
    "editing:apply",
    "gallery:list",
    "gallery:thumbnail",
    "gallery:add",
    "theme:get",
    "theme:show",
    "theme:apply",
  ],
  send: ["app:ready", "preview:bounds", "preview:grid", "gallery:peek"],
  events: [
    "projects:changed",
    "project:opened",
    "preview:state",
    "preview:hover",
    "preview:picture",
    "preview:page-deleted",
    "preview:zoom",
    "preview:zoom-ready",
    "conversation:prefill",
    "conversation:event",
    "agent:status",
    "history:changed",
    "skills:changed",
    "connectors:changed",
    "comments:changed",
    "settings:changed",
    "settings:show",
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
  | { type: "theme"; css: string }
  /** How the page answers the pointer (Q99), and whether editing waits for the agent (Q91). */
  | { type: "editor"; mode: PreviewMode; paused: boolean }
  /** The maker's comments, all pages included, so the page can show its own. */
  | { type: "comments"; comments: PageComment[] }
  /** Hides Upstart's own drawings in the page while a capture is taken; answered by "chrome-hidden". */
  | { type: "chrome"; hidden: boolean }
  /** A thumbnail partly scrolled out at the top: its page moves up by this many of its own pixels. */
  | { type: "clip"; top: number };

/**
 * Edit: a click selects, a double click edits a text. Comment: a click opens
 * a comment on the element (Q95). Visitor: the page behaves as online.
 */
export type PreviewMode = "edit" | "comment" | "visitor";

/** A comment the maker pins on an element of the preview, for the agent (Q95). */
export type PageComment = {
  id: string;
  /** The page it was written on. */
  route: string;
  /** Where the element comes from, as the trace gives it. */
  file: string;
  line: number;
  at: number;
  /** A short description of the element ("heading “Chez Margot”"), and the start of its HTML. */
  label: string;
  snippet: string;
  text: string;
};

/** From the preview's script to the main process. */
export type FromPreview =
  | { type: "loaded"; path: string; title: string }
  | { type: "rendered"; ms: number }
  | { type: "error"; message: string; source?: string }
  | { type: "chrome-hidden" }
  /** A thumbnail of the "All pages" view was clicked, right-clicked, or the pointer came or left (Q132). */
  | { type: "thumb"; action: "click" | "menu" | "enter" | "leave" };

/** Calls from the preview's script that get an answer (the edits it asks for). */
export type PreviewInvokes = {
  "preview:edit": (action: EditAction) => { label: string; files: string[] };
  "preview:edit-info": (file: string, at: number) => EditInfo;
  /** Adds a comment, or changes the one with this id. */
  "preview:comment-save": (comment: Omit<PageComment, "id"> & { id?: string }) => PageComment[];
  "preview:comment-remove": (id: string) => PageComment[];
  "preview:comments-send": () => void;
  "preview:comments-discard": () => void;
};
