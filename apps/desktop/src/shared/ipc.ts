// The contract between the app's interface (renderer) and its main process.
//
// Every channel is listed here with its argument and answer types, so that
// both sides are checked against the same definition. The preload exposes
// only these channels, and the main process accepts them only from the
// interface's own main frame.

import type { ConversationEvent, ConversationItem, QuestionAnswer } from "./conversation";
import type { Command } from "./shortcuts";

export type AppInfo = {
  version: string;
  platform: string;
  background: boolean;
  /** The folder new websites go into. */
  projectsDir: string;
  versions: { electron: string; chromium: string; node: string };
  /** Whether this copy of Upstart sends the anonymous statistics: a packaged app with its key. */
  sendsStatistics: boolean;
};

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** Build, the usual way, or plan mode, where the agent writes nothing and hands in a plan (Q286). */
export type AgentMode = "build" | "plan";

/** A project as the sidebar lists it. */
export type ProjectSummary = { id: string; name: string; path: string };

/** An open project. `siteUrl` is where the maker put the exported site online. */
export type ProjectInfo = ProjectSummary & {
  model: string;
  effort: Effort;
  siteUrl?: string;
  /** Where each collected datasource's form sends in a static export (Q178). */
  formServices?: Record<string, string>;
  /** The template the website started from, if any (Q245). */
  template?: { id: string; version: string };
  /** The Build / Plan selector, kept for the website (Q296); Build when absent. */
  mode?: AgentMode;
};

/**
 * A page type in the list of a template's adaptation (Q303, Q305): to do, being
 * adapted, adapted and waiting for the maker to look at it, done, or taken off
 * the website. `new`: a page the template lacked, built from the gallery (Q310).
 */
export type AdaptationStepStatus = "todo" | "doing" | "ready" | "done" | "removed";
export type AdaptationStep = { route: string; name: string; status: AdaptationStepStatus; new?: boolean };
/**
 * A website being adapted from its template, page type by page type (Q302-Q313):
 * `chosen` once the maker kept its pages, `next` the page type the maker picked
 * to come next (Q313).
 */
export type AdaptationState = { chosen: boolean; steps: AdaptationStep[]; next?: string };

/** Where a skill comes from (ADR 0010): shipped with Upstart, the maker's for all projects, or the project's. */
export type SkillOrigin = "upstart" | "app" | "project";
export type SkillInfo = { origin: SkillOrigin; name: string; description: string; path: string };

/** The kinds of the gallery's blocks (Q92, Q196), in the order a page usually has them. */
export const BLOCK_KINDS = [
  "banner",
  "header",
  "hero",
  "about",
  "features",
  "services",
  "stats",
  "steps",
  "logos",
  "team",
  "testimonials",
  "gallery",
  "blog",
  "events",
  "menu",
  "products",
  "pricing",
  "comparison",
  "faq",
  "contact",
  "forms",
  "newsletter",
  "cta",
  "footer",
] as const;
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
  /**
   * A data block's datasource (Q194, Q197, Q201): a collection keeps its name
   * for the whole site; a section list is named after the page it is dropped on.
   */
  data?: { name: string; family: "collection" | "section" };
  /** One of the project's own blocks, in its blocks/ folder: the design of the template it started from (Q235). */
  design?: boolean;
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

/** A way of exporting, as the Publish dialog lists it (Q181): whether this website can use it and what it needs. */
export type PublishChoice = {
  id: string;
  needs: { managementToken: boolean; formServices: boolean };
  /** Why this website cannot use it: the collected datasources a page shows. */
  refused?: string[];
};
export type PublishInfo = {
  choices: PublishChoice[];
  /** The collected datasources the pages have a form for. */
  forms: string[];
  /** The way this website was last published on this machine, chosen again when the dialog opens. */
  last?: string;
};
/** One step of putting an export online, worded by the app under its builder's id and its own. */
export type GuideStep = { id: string; command?: string };
export type ExportResult = {
  folder: string;
  /** "static", "node", "cloudflare". */
  builder: string;
  pages: string[];
  files: number;
  warnings: string[];
  guide: GuideStep[];
};

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
  /** The project's pages, a page per record among them (Q147, Q164). */
  routes: PageRoute[];
  loading: boolean;
  mode: PreviewMode;
  /** A short hash of the project's theme: the gallery's thumbnails are drawn again when it changes. */
  theme: string;
  /** One page, or every page as thumbnails (Q128). */
  view: PreviewView;
  /** The page the agent is writing, while it is (Q134). */
  writing: string | null;
};

export type PreviewView = "page" | "pages";

/**
 * A page of the project: its address and file; for a record's page, its
 * record, the datasource's label it is grouped under and its name (Q164);
 * `generated` for a page the runtime makes, the image credits (Q157).
 */
export type PageRoute = {
  route: string;
  file: string;
  record?: { datasource: string; id: string };
  group?: string;
  title?: string;
  generated?: boolean;
};

/**
 * A zoom between the page and the thumbnails (Q133): to the thumbnails, from a
 * picture of the page shown (`url`); to a page, from its thumbnail.
 */
export type PreviewZoom = { to: PreviewView; route: string; url?: string };

/** The page a zoom goes to is loaded and drawn at its size, out of sight: the zoom may land (Q142). */
export type PreviewZoomReady = { route: string };

/** A page's thumbnail in the "All pages" view: where it goes, and whether it is on screen (Q130). */
export type GridCell = {
  route: string;
  /** What shows of it: a thumbnail partly scrolled out is cut to the part on screen. */
  rect: Rect;
  visible: boolean;
  /** How much of its top is scrolled out, in the interface's pixels: its page moves up by as much. */
  clipTop?: number;
};

/**
 * The accounts an agent runs on (Q269, Q275, Q280): Claude through the official
 * binary, and in Upstart's own harness ChatGPT Plus or Pro, an OpenAI key, a
 * Gemini key, and Vertex AI on a key of its express mode or gcloud's sign-in.
 */
export const AGENT_ACCOUNTS = ["claude", "chatgpt", "openai", "gemini", "vertex"] as const;
export type AgentAccount = (typeof AGENT_ACCOUNTS)[number];
/** The accounts of Upstart's own harness that the maker gives a key for. */
export type KeyAccount = "openai" | "gemini" | "vertex";

/** The account of a project's model: "gemini/gemini-4-hydrogen" is the Gemini key's; an id without one, Claude's. */
export function accountOf(model: string): AgentAccount {
  const prefix = model.includes("/") ? model.slice(0, model.indexOf("/")) : "";
  return (AGENT_ACCOUNTS as readonly string[]).includes(prefix) && prefix !== "claude"
    ? (prefix as AgentAccount)
    : "claude";
}

/** A model the maker can pick, with the effort levels it accepts and the account it runs on. */
export type ModelChoice = { id: string; name: string; efforts: Effort[]; account: AgentAccount };

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
  /** The accounts of Upstart's own harness that are connected. */
  accounts: { chatgpt: boolean; openai: boolean; gemini: boolean; vertex: boolean };
  /** Vertex AI on gcloud's sign-in: its project, and whether gcloud's sign-in is on this computer. */
  vertexGcloud?: { project: string; signedIn: boolean };
  /** Sign in with ChatGPT under way, or how it failed. */
  chatgpt: { signingIn: boolean; failed?: string };
  /** The models of the connected accounts. */
  models: ModelChoice[];
};

/** Whether a model's account is connected now; Claude's while its state is unknown counts as connected. */
export function accountReady(status: AgentStatus, model: string): boolean {
  const account = accountOf(model);
  return account === "claude" ? status.auth === "signed-in" || status.auth === "unknown" : status.accounts[account];
}

/** Whether any account is connected, or may be: the first launch's panel shows when none is (Q275). */
export function anyAccount(status: AgentStatus): boolean {
  return status.auth === "signed-in" || status.auth === "unknown" || Object.values(status.accounts).some(Boolean);
}

/** The model a new website gets: the one asked for if its account is connected, or the first connected account's default. */
export function usableModel(status: AgentStatus, model: string): string {
  return accountReady(status, model) ? model : (status.models[0]?.id ?? model);
}

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
  | { type: "insert"; file: string; before: number | null | "auto"; block: string }
  /**
   * A record's text field written from the preview (Q148): the element at `at`
   * shows it alone; `record` is the record its trace names ("posts/hello").
   */
  | { type: "record-text"; file: string; at: number; record: string; text: string }
  /**
   * An image replaced (Q159): the `src` written in the template, or the
   * record's image field when the template shows one. `from`: a file dropped
   * from the disk, added to media/ first, its address then used.
   */
  | { type: "image"; file: string; at: number; src: string; record?: string; from?: string };

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
  /** Its text is a record's text field, shown alone: editing it writes the record (Q148). */
  field?: string;
  /** Its text is a record's value of another kind, changed in the Content tab. */
  fromRecord?: boolean;
  /** An image the maker can replace: its address is in the template, or in a record's field (Q159). */
  image?: { field?: string };
};

/** A project's conversation, as shown. */
export type ConversationState = { projectId: string; items: ConversationItem[] };

/** The categories of the settings window (Q117), in the order of its sidebar. */
export const SETTINGS_PAGES = ["general", "agent", "skills", "connectors", "privacy", "about"] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

/** The interface's appearance (Q330): macOS's, or always light or dark. */
export const APPEARANCES = ["system", "light", "dark"] as const;
export type Appearance = (typeof APPEARANCES)[number];
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
  /** The interface's appearance (Q330); the website keeps its own theme. */
  appearance: Appearance;
  /** The interface's text size; the website keeps its own. */
  textSize: TextSize;
  replyStyle: ReplyStyle;
  outputStyle: OutputStyle;
  /** A system notification when the agent finishes while Upstart is not in front. */
  notifyDone: boolean;
  /** The tour has been seen, to its end or skipped (Q328, Q340): it no longer opens by itself. */
  tourSeen: boolean;
};
export const DEFAULT_APP_SETTINGS: AppSettings = {
  newModel: "claude-sonnet-5-5",
  newEffort: "medium",
  statistics: true,
  appearance: "system",
  textSize: "medium",
  replyStyle: "short",
  outputStyle: "discreet",
  notifyDone: true,
  tourSeen: false,
};

/** Calls from the interface that get an answer: channel → (args) → answer. */
/** A field of a datasource, as its definition names it (Q146, Q160). */
export type ContentField = {
  name: string;
  kind:
    | "text"
    | "markdown"
    | "number"
    | "boolean"
    | "date"
    | "choice"
    | "image"
    | "link"
    | "list"
    | "links"
    | "email"
    | "phone";
  label?: string;
  required?: boolean;
  choices?: string[];
};

/** A record as the Content tab lists it. */
export type ContentRecordSummary = {
  id: string;
  file: string;
  title: string;
  /** Its image, when its definition has an image field and it has one. */
  image?: string;
  /** What is wrong with it (Q166); `skipped` when its fields do not read at all. */
  problems: string[];
  skipped: boolean;
  /** Its page's address, when the datasource has a page per record. */
  route?: string;
  /** A collected datasource's test record, which only the preview has (Q172, Q185). */
  test?: boolean;
  /** Waiting for the maker's approval (Q174). */
  pending?: boolean;
  /** When a visitor sent it, for a collected datasource's records. */
  submitted?: string;
};

/** A record a published site collected, as its management API gives it (Q177). */
export type PublishedRecord = {
  id: string;
  submitted: string;
  status: "published" | "pending";
  fields: Record<string, unknown>;
};

/** What the app can tell of the published site (Q183). */
export type SiteCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "no-address" | "no-token" | "unreachable" | "wrong-token" | "not-upstart" | "failed";
      message: string;
    };

/** A datasource as the Content tab shows it. */
export type ContentDatasource = {
  name: string;
  label: string;
  fields: ContentField[];
  /** The field written below the fields, as the file's text. */
  body?: string;
  /** Listed by a field: no manual order. */
  sort?: { field: string; desc: boolean };
  records: ContentRecordSummary[];
  /** The definition itself does not read. */
  problem?: string;
  /** Records sent by visitors through forms (Q171). */
  collected?: boolean;
  /** Visitors' records wait for the maker's approval (Q174). */
  review?: boolean;
  /** The addresses of the pages that show it (Q210, Q211): none when no page reads it any more. */
  usedBy: string[];
  /** A section list (Q201): the page it was named after, its address, under which the Content tab lists it. */
  section?: { page: string; route: string };
};

/** A record's values as its file has them, for its form. */
export type ContentRecord = {
  id: string;
  file: string;
  values: Record<string, unknown>;
  body: string;
  /** Why its fields do not read, when they do not (Q166). */
  error?: string;
  problems: string[];
  route?: string;
};

/** The credits kept beside an image taken from an open collection (Q151, Q155). */
export type MediaCredit = {
  title?: string;
  author?: string;
  authorUrl?: string;
  license: string;
  licenseUrl?: string;
  source?: string;
  sourceUrl?: string;
};

/** A file of the media library, as the Content tab shows it (Q158, Q168). */
export type MediaItem = {
  path: string;
  name: string;
  size: number;
  image: boolean;
  alt?: string;
  credit?: MediaCredit;
  /** The files that use it, and that said for the maker ("2 pages, Posts (3)"). */
  uses: string[];
  usesLabel: string;
};

/** An image the maker's search found (Q150). */
export type MediaFound = {
  id: string;
  title: string;
  width: number;
  height: number;
  credit: MediaCredit;
  /** A small copy, as a data: URL, when the source gave one in time. */
  thumb?: string;
};

/** What the start screen's chips filter by (Q249, Q263). */
export const TEMPLATE_CATEGORIES = ["business", "portfolio", "blog", "launch", "event", "app"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** A template as the start screen lists it (Q249). */
export type TemplateSummary = {
  id: string;
  version: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** One of the original, animated designs, shown first with a badge (Q263, Q264). */
  original: boolean;
  tags: string[];
  /** Imported by the maker, rather than one of Upstart's. */
  imported: boolean;
};

/** A template shown large in the start screen (Q249): the page shown and the pages to go to. */
export type TemplateViewState = {
  id: string | null;
  route: string | null;
  title: string;
  pages: { route: string; name: string }[];
  loading: boolean;
};

/** A template read from a folder or a .zip, waiting for the maker to add it (Q248); or why it cannot be one. */
export type TemplateImport =
  | { token: string; template: TemplateSummary; cover: string | null; pages: string[] }
  | { problems: string[] };

export type Invokes = {
  "app:info": () => AppInfo;
  /** A web address from the agent's message, opened in the maker's browser (http and https only). */
  "app:open-link": (url: string) => void;
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
  /** The tour's step in the page (Q332): its veil, or its bubble on the page; null takes them away. */
  "tour:page": (tour: PageTour | null) => void;
  /** The tour was seen to its end or skipped: it no longer opens by itself (Q328). */
  /** The tour ended: through its last step, or skipped. */
  "tour:seen": (how: "finished" | "skipped") => void;
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
  /** `newProject`: the settings of the website a first message creates, and the template it starts from (Q245). */
  /** Sends a message, creating the website first with none open; why it could not, in words the maker reads. */
  "conversation:send": (
    text: string,
    newProject?: {
      model: string;
      effort: Effort;
      template?: string;
      mode?: AgentMode;
    },
  ) => string | undefined;
  "conversation:stop": () => void;
  "conversation:start-over": () => void;
  /** Answers the open project's waiting question card (Q283); words typed in the message box go through conversation:send. */
  "conversation:answer": (cardId: string, answer: QuestionAnswer) => void;
  /** Build: the maker approves the plan the agent waits on (Q290); changes are typed in the message box. */
  "conversation:approve-plan": (cardId: string) => void;
  /** The open website's adaptation from its template (Q302-Q313); null when there is none. */
  "adaptation:get": () => AdaptationState | null;
  /** Continue: the next page type of the adaptation, sent to the agent (Q303); why not, in words the maker reads. */
  "adaptation:continue": () => string | undefined;
  /** A page type still to do, picked to come next (Q313). */
  "adaptation:pick": (route: string) => AdaptationState | null;
  /** A page type still to do, taken off the website (Q307). */
  "adaptation:remove": (route: string) => AdaptationState | null;
  /** A picture of the first screen of one of the open website's page types, for the card of pages (Q302). */
  "adaptation:picture": (route: string) => string | null;
  /** The Build / Plan selector of the open website (Q286, Q296), for its next message. */
  "agent:set-mode": (mode: AgentMode) => ProjectInfo;
  /** The websites whose agent waits for the maker's answer (Q292). */
  "agent:waiting": () => string[];
  "agent:status": () => AgentStatus;
  "agent:sign-in": (method: SignInMethod) => void;
  "agent:cancel-sign-in": () => void;
  /** Opens, in the maker's browser, the sign-in page the binary printed. */
  "agent:open-sign-in-page": () => void;
  /** Keeps an API key for the agent, encrypted by the system; null removes it. */
  "agent:set-api-key": (key: string | null) => AgentStatus;
  "agent:set-model": (model: string) => ProjectInfo;
  "agent:set-effort": (effort: Effort) => ProjectInfo;
  /** Keeps an OpenAI, Gemini or Vertex AI key for Upstart's own harness, encrypted by the system; null removes it. */
  "agent:set-key": (account: KeyAccount, key: string | null) => AgentStatus;
  /** Vertex AI on the Google Cloud sign-in made with gcloud, for a project; null stops using it (Q280). */
  "agent:set-vertex-gcloud": (project: string | null) => AgentStatus;
  /** Sign in with ChatGPT: opens the maker's browser; the status says when it is done. */
  "agent:chatgpt-sign-in": () => void;
  "agent:chatgpt-cancel": () => void;
  "agent:chatgpt-sign-out": () => AgentStatus;
  /** Asks the maker for the folder to export into. Null when they cancel. */
  "export:choose-folder": () => string | null;
  /** Where the open project was last exported on this machine. */
  "export:last": (builder: string) => string | null;
  "export:choices": () => PublishInfo;
  "export:run": (folder: string, builder: string) => ExportResult;
  "projects:set-form-service": (datasource: string, url: string) => ProjectInfo;
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
  /** The templates to start from, originals first (Q249, Q264). */
  "templates:list": () => TemplateSummary[];
  /** A template's cover or its animated hover sequence, as a data URL. */
  "templates:picture": (id: string, which: "cover" | "hover") => string | null;
  /** Shows a template large, at a page of it; null hides it (Q249). */
  /** Shows a template large, downloaded first if it has to be (Q247); why it cannot be, in words the maker reads. */
  "templates:view": (id: string | null, route?: string) => string | undefined;
  /** Asks for a template folder or .zip and reads it, to be added once the maker has seen it (Q236, Q248); null if none was chosen. */
  "templates:import": () => TemplateImport | null;
  /** Adds an imported template the maker has seen; its summary. */
  "templates:accept-import": (token: string) => TemplateSummary;
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
  /** The Content tab (Q148): the project's datasources and their records. */
  "content:list": () => ContentDatasource[];
  /** Deletes a section list no page shows any more (Q211): one version, which the history can undo. */
  "content:delete-datasource": (name: string) => { label: string; files: string[] };
  "content:record": (datasource: string, id: string) => ContentRecord;
  /** Writes one value of a record at once, without a version (Q162); `body` for the text below its fields. */
  "content:set-value": (datasource: string, id: string, field: string, value: unknown) => void;
  /** A record written from an empty form, its id from its title (Q165). */
  "content:add": (datasource: string, values: Record<string, unknown>) => { id: string };
  /** The maker left the record: its version, told to the agent (Q162). */
  "content:leave": () => void;
  "content:duplicate": (datasource: string, id: string) => { id: string };
  "content:delete": (datasource: string, id: string) => void;
  "content:reorder": (datasource: string, ids: string[]) => void;
  "content:rename": (datasource: string, id: string, to: string) => { id: string };
  /** The records the published site collected, read when the maker opens the datasource (Q184). */
  "content:published": (datasource: string) => { records: PublishedRecord[] } | { error: string; reason: string };
  "content:approve": (datasource: string, id: string) => void;
  "content:delete-published": (datasource: string, id: string) => void;
  /** Saves the published records as CSV; the file's path, or null when the maker cancelled. */
  "content:csv": (datasource: string) => string | null;
  /** Whether the published site answers with this website's token (Q183). */
  "site:check": () => SiteCheck;
  /** The website's management token, made the first time it is asked for. */
  "site:token": () => string;
  /** A new management token, replacing the old one. */
  "site:new-token": () => string;
  /** The media library (Q158, Q168). */
  "media:list": () => MediaItem[];
  /** A small copy of an image of the library, as a data: URL. */
  "media:thumbnail": (path: string) => string | null;
  /** Files dropped from the Finder, by their paths on the disk, added to media/. */
  "media:add-files": (paths: string[]) => { paths: string[] };
  /** Files chosen in a dialog, added to media/; null when none was chosen. */
  "media:choose-files": () => { paths: string[] } | null;
  /** The picker's answer to a media:pick-request: the chosen image's address, or null. */
  "media:picked": (id: number, path: string | null) => void;
  "media:search": (query: string) => { images: MediaFound[]; failed: string[] };
  /** An image found, added to media/ with its credits and this alt text. */
  "media:add-found": (id: string, alt: string) => { path: string };
  /** Written at once; one version when the maker moves on (content:leave). */
  "media:set-alt": (path: string, alt: string) => void;
  "media:delete": (path: string) => void;
  "media:rename": (path: string, name: string) => { path: string };
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
  /** `panel`: the screen is the preview's own size, in CSS pixels (Q142). */
  "preview:grid": (
    cells: GridCell[] | null,
    screen?: { width: number; height: number; mobile: boolean; panel?: boolean },
  ) => void;
  /** Shows a gallery block large over the preview while the pointer rests on it (Q109); null hides it. */
  "gallery:peek": (id: string | null) => void;
  /** Where the template shown large sits in the window, in CSS pixels; null to hide it. */
  "templates:bounds": (rect: Rect | null) => void;
};

/** One-way messages from the main process to the interface. */
export type Events = {
  "projects:changed": (projects: ProjectSummary[]) => void;
  /** A project was opened, or null when none is open any more. */
  "project:opened": (project: ProjectInfo | null) => void;
  "preview:state": (state: PreviewState) => void;
  "templates:view-state": (state: TemplateViewState) => void;
  /** The latest catalogue of Upstart's templates was read, and it changed the list (Q250). */
  "templates:changed": () => void;
  /** The pointer is over a page's thumbnail, or left it (Q132). */
  "preview:hover": (route: string | null) => void;
  /** A page's picture in the "All pages" view, as a data URL (Q141). */
  "preview:picture": (picture: { route: string; url: string }) => void;
  /** The preview goes between one page and all of them: the interface zooms (Q133). */
  "preview:zoom": (zoom: PreviewZoom) => void;
  /** The page zoomed to is drawn, out of sight: the zoom may land (Q142). */
  "preview:zoom-ready": (ready: PreviewZoomReady) => void;
  /** The page view was put in its place on screen: what the interface drew under it is covered. */
  "preview:placed": () => void;
  /** A page was deleted from its thumbnail's menu: a note offers to undo it (Q137). */
  "preview:page-deleted": (page: { route: string; name?: string }) => void;
  /** Text to put in the message field, which takes the keyboard ("Ask the agent about it", Q136). */
  "conversation:prefill": (text: string) => void;
  /** A file under data/ or media/ changed: the Content tab reads again. */
  "content:changed": () => void;
  /** "Replace…" in the preview: the media picker opens, and answers with media:picked (Q159). */
  "media:pick-request": (request: { id: number }) => void;
  "conversation:event": (message: { projectId: string; event: ConversationEvent }) => void;
  /** The open website's adaptation changed; `finished` once its last page type is done (Q307). */
  "adaptation:changed": (message: { projectId: string; state: AdaptationState | null; finished?: boolean }) => void;
  /** The websites whose agent waits for the maker's answer changed (Q292). */
  "agent:waiting": (projectIds: string[]) => void;
  "agent:status": (status: AgentStatus) => void;
  "history:changed": (message: { projectId: string; entries: HistoryEntry[] }) => void;
  /** The skills changed: added, removed, or written by the agent. */
  "skills:changed": (skills: SkillInfo[]) => void;
  "connectors:changed": (connectors: ConnectorInfo[]) => void;
  "comments:changed": (comments: PageComment[]) => void;
  "settings:changed": (settings: AppSettings) => void;
  /** The settings panel is asked to open at a page, or to open or close (⌘, in the menu). */
  "settings:show": (request: { page?: SettingsPage; toggle?: boolean }) => void;
  /** A menu item or its shortcut (Q335): the interface does what its button does. */
  "menu:command": (command: Command) => void;
  /** The maker's first website is built: the tour opens (Q328, Q336). */
  "tour:start": () => void;
  /** Next or Skip, clicked on the tour's bubble drawn in the page. */
  "tour:action": (action: TourAction) => void;
};

export type InvokeChannel = keyof Invokes;
export type SendChannel = keyof Sends;
export type EventChannel = keyof Events;

/** Channel names the preload lets through, by direction. */
export const channels = {
  invoke: [
    "app:info",
    "app:open-link",
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
    "tour:page",
    "tour:seen",
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
    "conversation:answer",
    "conversation:approve-plan",
    "adaptation:get",
    "adaptation:continue",
    "adaptation:pick",
    "adaptation:remove",
    "adaptation:picture",
    "agent:set-mode",
    "agent:waiting",
    "agent:status",
    "agent:sign-in",
    "agent:cancel-sign-in",
    "agent:open-sign-in-page",
    "agent:set-api-key",
    "agent:set-model",
    "agent:set-effort",
    "agent:set-key",
    "agent:set-vertex-gcloud",
    "agent:chatgpt-sign-in",
    "agent:chatgpt-cancel",
    "agent:chatgpt-sign-out",
    "export:choose-folder",
    "export:last",
    "export:choices",
    "projects:set-form-service",
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
    "templates:list",
    "templates:picture",
    "templates:view",
    "templates:import",
    "templates:accept-import",
    "gallery:list",
    "gallery:thumbnail",
    "gallery:add",
    "theme:get",
    "theme:show",
    "theme:apply",
    "content:list",
    "content:record",
    "content:set-value",
    "content:add",
    "content:leave",
    "content:duplicate",
    "content:delete",
    "content:delete-datasource",
    "content:reorder",
    "content:rename",
    "content:published",
    "content:approve",
    "content:delete-published",
    "content:csv",
    "site:check",
    "site:token",
    "site:new-token",
    "media:list",
    "media:thumbnail",
    "media:add-files",
    "media:choose-files",
    "media:picked",
    "media:search",
    "media:add-found",
    "media:set-alt",
    "media:delete",
    "media:rename",
  ],
  send: ["app:ready", "preview:bounds", "preview:grid", "gallery:peek", "templates:bounds"],
  events: [
    "projects:changed",
    "project:opened",
    "preview:state",
    "templates:view-state",
    "templates:changed",
    "preview:hover",
    "preview:picture",
    "preview:page-deleted",
    "preview:zoom",
    "preview:zoom-ready",
    "preview:placed",
    "conversation:prefill",
    "content:changed",
    "media:pick-request",
    "conversation:event",
    "adaptation:changed",
    "agent:waiting",
    "agent:status",
    "history:changed",
    "skills:changed",
    "connectors:changed",
    "comments:changed",
    "settings:changed",
    "settings:show",
    "menu:command",
    "tour:start",
    "tour:action",
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
  /** The path on the disk of a file dropped from the Finder (Q158). */
  pathOf(file: File): string;
};

// ---- The preview's own channel ---------------------------------------------
// Between the main process and the script Upstart runs inside the preview,
// in an isolated world the project's page cannot reach.

/** From the main process to the preview's script. */
export type ToPreview =
  /** A new rendering of the page shown: morph the document into it. `final` once the files are complete. */
  | { type: "render"; html: string; final: boolean }
  /** The theme or the site's stylesheets changed: replace them in place (styles: what Tailwind compiles). */
  | { type: "theme"; css: string; styles?: string }
  /** How the page answers the pointer (Q99), and whether editing waits for the agent (Q91). */
  | { type: "editor"; mode: PreviewMode; paused: boolean }
  /** The maker's comments, all pages included, so the page can show its own. */
  | { type: "comments"; comments: PageComment[] }
  /** Hides Upstart's own drawings in the page while a capture is taken; answered by "chrome-hidden". */
  | { type: "chrome"; hidden: boolean }
  /** A thumbnail partly scrolled out at the top: its page moves up by this many of its own pixels. */
  | { type: "clip"; top: number }
  /** The tour's veil or bubble over the page (Q337), or none. */
  | { type: "tour"; tour: PageTour | null };

export type TourAction = "next" | "skip";

/**
 * The tour in the page, a native view the interface cannot draw over: the page
 * dimmed while a step points elsewhere, or the step about the page itself,
 * drawn on its first heading or image in view.
 */
export type PageTour =
  | { kind: "veil" }
  | {
      kind: "bubble";
      /**
       * On the page's first heading or image in view, or at its top, pointing up at
       * the interface's Publish button: `x` its middle from the left of the page's area, `width` that area's.
       */
      at: "content" | { x: number; width: number };
      title: string;
      text: string;
      count: string;
      next: string;
      skip: string;
    };

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
  | { type: "chrome-hidden" }
  /** A thumbnail of the "All pages" view was clicked, right-clicked, or the pointer came or left (Q132). */
  | { type: "thumb"; action: "click" | "menu" | "enter" | "leave" }
  /** Next or Skip on the tour's bubble drawn in the page. */
  | { type: "tour"; action: TourAction };

/** Calls from the preview's script that get an answer (the edits it asks for). */
export type PreviewInvokes = {
  "preview:edit": (action: EditAction) => { label: string; files: string[] };
  "preview:edit-info": (file: string, at: number) => EditInfo;
  /** Opens the app's media picker over the window (Q159): the chosen image's address, or null. */
  "preview:pick-image": () => string | null;
  /** A block or an image file dragged into the page in another mode: the preview goes to edit mode (Q254). */
  "preview:to-edit": () => void;
  /** Adds a comment, or changes the one with this id. */
  "preview:comment-save": (comment: Omit<PageComment, "id"> & { id?: string }) => PageComment[];
  "preview:comment-remove": (id: string) => PageComment[];
  "preview:comments-send": () => void;
  "preview:comments-discard": () => void;
};
