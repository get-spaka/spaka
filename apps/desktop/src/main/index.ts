// Entry point of the app's main process.
import {
  existsSync,
  type FSWatcher,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  watch,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  Datasources,
  mediaInfo,
  readRecordFile,
  recordFile,
  recordOf,
  recordTitle,
  TEST_RECORDS_DIR,
  titleField,
  titleOf,
} from "@upstart/runtime";
import { diskSource } from "@upstart/runtime/node";
import { app, BrowserWindow, dialog, Menu, Notification, nativeTheme, net, safeStorage, shell } from "electron";
import electronUpdater from "electron-updater";
import { isPlan } from "../shared/conversation";
import {
  accountOf,
  type ConnectorInfo,
  type ContentDatasource,
  type ContentRecord,
  type ContentRecordSummary,
  type HistoryEntry,
  type MediaFound,
  type MediaItem,
  type PageComment,
  type PreviewView,
  type ProjectInfo,
  type Rect,
  SETTINGS_PAGES,
  type SettingsPage,
  TEXT_SIZES,
} from "../shared/ipc";
import { en as t } from "../shared/strings/en";
import { Agent, projectNameFrom } from "./agent/agent";
import { AgentAuth } from "./agent/auth";
import { agentBinary, cleanEnv, nodeLauncher, withPathFirst } from "./agent/confinement";
import { findGitBash, GIT_FOR_WINDOWS_URL, gitBashEnv } from "./agent/git-bash";
import { instructionsFor } from "./agent/instructions";
import { PiAccounts } from "./agent/pi/accounts";
import { VaultSignIns } from "./agent/pi/connectors";
import { PiRecorder, piReplay } from "./agent/pi/replay";
import { claudeExtras, UPSTART_SERVER } from "./agent/preview-tool";
import { NOT_ANSWERED } from "./agent/questions";
import { Recorder, replayed, replayQuery } from "./agent/replay";
import type { AgentKit } from "./agent/runner";
import { TurnChecks } from "./agent/turn-checks";
import { AppSettingsStore, zoomFor } from "./app-settings";
import { Connectors, type Vault } from "./connectors/connectors";
import { Comments, commentsMessage } from "./editing/comments";
import { NAVIGATION, pageKey } from "./editing/data-drop";
import { Editor } from "./editing/editor";
import { EditRefused } from "./editing/edits";
import { AgentNotes } from "./editing/notes";
import { useBlocks } from "./editing/use-blocks";
import { readEnvironment } from "./environment";
import { exportProject, publishChoices } from "./export";
import { described, Gallery, ProjectBlocks } from "./gallery/catalogue";
import { BlockPeek } from "./gallery/peek";
import { BlockIndex, findWithDesign } from "./gallery/search";
import { blockShown } from "./gallery/shown";
import { Thumbnails } from "./gallery/thumbnails";
import { History } from "./history/history";
import { createIpc } from "./ipc";
import { FileTap } from "./live/tap";
import { addFoundImages, libraryFiles, mediaKind, usesLabel, usesOf, usingFiles } from "./media/library";
import { FixtureImages, type ImageFinder, ImageSearch, imagesAnswer } from "./media/search";
import { buildMenu } from "./menu";
import { Preview } from "./preview/preview";
import { testRecordFile } from "./preview/test-records";
import { isEffort, Projects, readProjectFile } from "./projects";
import {
  type CsvRecord,
  callSite,
  ManagementTokens,
  publishedRecords,
  recordsCsv,
  SiteUnavailable,
} from "./publish/management";
import { Skills } from "./skills/skills";
import { APTABASE_KEY, errorType, type PUBLISH_WAYS, Stats } from "./stats";
import { adaptMessage, copyTemplate, removalMessage, removalsOf, reviewNote, stepMessage } from "./templates/adapt";
import {
  adaptationGuide,
  adaptationView,
  continueAdaptation,
  finishAdaptation,
  pickNext,
  readAdaptation,
  removeStep,
  turnEnded,
} from "./templates/adaptation";
import { TEMPLATES_RELEASES, TemplateLibrary } from "./templates/library";
import { pagesAnswered, readPagesCard } from "./templates/pages-card";
import { TemplateViewer } from "./templates/viewer";
import { Fonts } from "./theme/fonts";
import { readTheme, type ThemeValues, themeColors, writeTheme } from "./theme/theme-file";
import { TipOverlay } from "./tip-overlay";
import { opensTour, type TourMoment } from "./tour";
import { Updates, updatedSince } from "./update";

const here = fileURLToPath(new URL(".", import.meta.url));
const env = readEnvironment(process.env, app.getPath("documents"));
/** The conversation's events after which editing by hand may pause or come back (Q91, Q294). */
const PAUSING = new Set(["turn-start", "turn-end", "question", "pages", "question-settled", "plan", "plan-settled"]);
/** Those after which the websites waiting for the maker may have changed (Q292). */
const WAITING = new Set(["turn-end", "question", "pages", "question-settled", "plan", "plan-settled"]);

if (env.dataDir) app.setPath("userData", env.dataDir);

if (env.background) {
  app.dock?.hide();
  // Chromium stops drawing, and slows the timers of, a window that is not
  // displayed. A check in the background needs the app to behave as if it were.
  app.commandLine.appendSwitch("disable-features", "MacWebContentsOcclusion,CalculateNativeWinOcclusion");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  // On Windows a machine without a graphics card (a CI runner) stalls the GPU process at times, and the window stops
  // drawing: a background run draws in software there.
  if (process.platform === "win32") app.disableHardwareAcceleration();
}

// An exception at start-up would otherwise open a modal dialog that waits for
// a click, which a background run never gets.
process.on("uncaughtException", (error) => {
  console.error("[upstart] uncaught exception", error);
  if (env.background || !app.isReady()) app.exit(1);
});

app.setName("Upstart");

async function main() {
  if (!env.background && !app.requestSingleInstanceLock()) return app.quit();
  // Windows names the app's notifications by this id (the installer's shortcut carries it too).
  if (process.platform === "win32") app.setAppUserModelId("gg.upstart.desktop");
  await app.whenReady();
  // A packaged app has its icon in its bundle; a development run shows it in the Dock all the same.
  if (!app.isPackaged && !env.background) app.dock?.setIcon(join(here, "../../build/icon.png"));

  const settings = new AppSettingsStore(join(app.getPath("userData"), "settings.json"));
  // The interface's appearance (Q330): nativeTheme turns it into prefers-color-scheme for
  // the interface, and the window's background follows, so that it never shows the other.
  nativeTheme.themeSource = settings.get().appearance;
  // Anonymous usage statistics (Q331, Q334), unless the maker switched them off.
  const stats = new Stats({
    allowed: () => settings.get().statistics,
    appVersion: app.getVersion(),
    osName: process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux",
    osVersion: process.getSystemVersion(),
    key: APTABASE_KEY,
    packaged: app.isPackaged,
    templates: () => templates.list().flatMap((t) => (t.imported ? [] : [t.id])),
    dayFile: join(app.getPath("userData"), "stats.json"),
    ...(env.statsLog ? { log: env.statsLog } : {}),
    send: async (url, key, body) => {
      await net.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "App-Key": key },
        body,
        credentials: "omit",
      });
    },
  });
  stats.launched();
  // The first launch of a new version: an update was installed (Q367).
  const versionFile = join(app.getPath("userData"), "version");
  const lastVersion = existsSync(versionFile) ? readFileSync(versionFile, "utf8").trim() : undefined;
  if (updatedSince(lastVersion, app.getVersion())) stats.track("update_installed");
  if (lastVersion !== app.getVersion()) writeFileSync(versionFile, app.getVersion());
  const windowBackground = () => (nativeTheme.shouldUseDarkColors ? "#121212" : "#fafafa");
  const titleBarOverlay = () => ({
    color: windowBackground(),
    symbolColor: nativeTheme.shouldUseDarkColors ? "#e5e5e5" : "#262626",
    height: 52,
  });
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: "Upstart",
    // macOS: the traffic lights over the interface. Windows: its buttons drawn
    // at the top right, over the interface too, in the window's colors.
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 16, y: 18 } }
      : { titleBarStyle: "hidden" as const, titleBarOverlay: titleBarOverlay() }),
    backgroundColor: windowBackground(),
    webPreferences: {
      preload: join(here, "../preload/app.cjs"),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: !env.background,
    },
  });

  // The interface is one document and never navigates away.
  win.webContents.on("will-navigate", (details) => {
    if (details.url !== win.webContents.getURL()) details.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  // Opening Upstart again (its shortcut, its icon) brings the window back rather than a second app.
  app.on("second-instance", () => {
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("[upstart] interface process gone:", details.reason);
  });
  // A background run shows its window only if asked to, without the focus: on
  // Windows a window never shown draws nothing, which checks there need.
  if (!env.background) win.once("ready-to-show", () => (env.showInactive ? win.showInactive() : win.show()));
  else if (env.showInactive) win.once("ready-to-show", () => win.showInactive());

  const ipc = createIpc(() => [win]);
  // On Windows the agent's shell is Git Bash, from Git for Windows (Q375), looked for again on "Check again".
  // Answered from the start: the interface asks before anything else.
  const gitBash = { path: process.platform === "win32" ? findGitBash() : undefined };
  // A check may show the screen that asks for it, on any system.
  const gitBashNeeded = () =>
    process.env.UPSTART_GIT_BASH_MISSING === "1" || (process.platform === "win32" && !gitBash.path);
  ipc.handle("app:git-bash", () => ({ needed: gitBashNeeded(), url: GIT_FOR_WINDOWS_URL }));
  ipc.handle("app:git-bash-check", () => {
    if (process.platform === "win32") gitBash.path = findGitBash();
    return { needed: gitBashNeeded(), url: GIT_FOR_WINDOWS_URL };
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  // The settings are a panel over the window (Q123), opened with ⌘, or from the sidebar.
  const openSettings = (page?: SettingsPage) =>
    ipc.emit("settings:show", page && SETTINGS_PAGES.includes(page) ? { page } : {});
  const dialogParent = () => win;
  // A system notification when the agent finishes while Upstart is not in front (Q125).
  const notifyDone = (projectId: string, status: string, error?: string) => {
    if (env.background || win.isFocused() || !settings.get().notifyDone || !Notification.isSupported()) return;
    const name = projects.list().find((p) => p.id === projectId)?.name ?? t.app.name;
    const body =
      status === "done" ? t.notify.done : status === "stopped" ? t.notify.stopped : (error ?? t.notify.failed);
    const note = new Notification({ title: name, body, silent: false });
    note.on("click", () => {
      win.show();
      win.focus();
    });
    note.show();
  };
  // A question of the agent's notifies as a finished turn does (Q292).
  const notifyWaiting = (projectId: string, kind: "question" | "plan") => {
    if (env.background || win.isFocused() || !settings.get().notifyDone || !Notification.isSupported()) return;
    const name = projects.list().find((p) => p.id === projectId)?.name ?? t.app.name;
    const body = kind === "plan" ? t.notify.plan : t.notify.question;
    const note = new Notification({ title: name, body, silent: false });
    note.on("click", () => {
      win.show();
      win.focus();
      if (current?.id !== projectId) void opened(projects.open(projectId));
    });
    note.show();
  };
  // The interface's text size (Q125): the whole interface is drawn larger or smaller; the website is not.
  const applyTextSize = () => win.webContents.setZoomFactor(zoomFor(settings.get().textSize));
  win.webContents.on("did-finish-load", applyTextSize);
  nativeTheme.on("updated", () => {
    win.setBackgroundColor(windowBackground());
    if (process.platform !== "darwin") win.setTitleBarOverlay(titleBarOverlay());
  });
  // The app's menus and their shortcuts (Q335).
  Menu.setApplicationMenu(
    buildMenu({
      send: (command) => ipc.emit("menu:command", command),
      settings: () => ipc.emit("settings:show", { toggle: true }),
      about: () => openSettings("about"),
      textSize: (step) => {
        const sizes = TEXT_SIZES;
        const now = sizes.indexOf(settings.get().textSize);
        const textSize = step === 0 ? "medium" : sizes[Math.max(0, Math.min(sizes.length - 1, now + step))];
        if (!textSize || textSize === settings.get().textSize) return;
        ipc.emit("settings:changed", settings.set({ textSize }));
        applyTextSize();
      },
      askAgent: () => ipc.emit("conversation:prefill", t.help.ask),
      development: !app.isPackaged,
    }),
  );
  const projects = new Projects(app.getPath("userData"), env.projectsDir);
  // The first start with the tour: a maker who already has websites never sees it open by itself (Q340).
  settings.settleTour(projects.list().length > 0);
  /** The tour opens by itself once, when the maker's first website is built (Q328, Q336). */
  const maybeTour = (projectId: string, moment: Omit<TourMoment, "seen" | "shown" | "hasPage">) => {
    const shown = projectId === current?.id;
    const hasPage = shown && (preview.runtime?.routes().length ?? 0) > 0;
    if (opensTour({ ...moment, seen: settings.get().tourSeen, shown, hasPage })) ipc.emit("tour:start");
  };
  // The gallery's blocks (Q92), shipped beside the app like its skills.
  const gallery = new Gallery(app.isPackaged ? join(process.resourcesPath, "gallery") : join(here, "../../gallery"));
  let index: BlockIndex | undefined;
  const blockIndex = () => {
    index ??= new BlockIndex(gallery.list());
    return index;
  };
  // The open project's blocks (Q235): its own design's first, then the gallery's.
  let current: ProjectInfo | undefined;
  const blocks = new ProjectBlocks(gallery, () => current?.path);
  /** find_blocks for a project: its own design's blocks first (Q235), read afresh, then the gallery's. */
  const findBlocksIn = (root: string) => (query: string, kind: string | undefined, limit: number | undefined) =>
    findWithDesign(new BlockIndex(new ProjectBlocks(gallery, () => root).designBlocks()), blockIndex(), query, {
      kind,
      limit,
    });
  // The open fonts the Theme tab offers (Q93), shipped the same way.
  const fonts = new Fonts(app.isPackaged ? join(process.resourcesPath, "fonts") : join(here, "../../fonts"));
  let contentTimer: NodeJS.Timeout | undefined;
  const preview: Preview = new Preview(win, {
    block: (id) => {
      const block = blocks.get(id);
      return block && blockShown(block);
    },
    font: (path) => fonts.path(path),
    background: env.background,
    onState: (state) => ipc.emit("preview:state", state),
    // The Content tab reads again when a datasource or a media file changes,
    // or a template, which decides which page shows a list (Q210, Q211).
    onFileChanged: (path) => {
      blocks.changed(path);
      if (!/^(data|media|pages|parts|\.upstart\/test-records)\//.test(path)) return;
      clearTimeout(contentTimer);
      contentTimer = setTimeout(() => ipc.emit("content:changed"), 80);
    },
    // The "All pages" thumbnails (Q132): a click opens the page; the pointer over one raises it.
    onThumb: (route, action) => {
      if (action === "click") void preview.openPage(route);
      else if (action === "enter") ipc.emit("preview:hover", route);
      else if (action === "leave") ipc.emit("preview:hover", null);
      else if (action === "menu") pageMenu(route);
    },
    onPicture: (route, url) => ipc.emit("preview:picture", { route, url }),
    // Next or Skip on the tour's bubble in the page (Q337); Stop on the pill of the agent at work (Q391).
    onPageEvent: (event) => {
      if (event.type === "tour") ipc.emit("tour:action", event.action);
      if (event.type === "stop" && current) void agent.stop(current.id);
    },
    onView: (view) => writeViewData({ ...viewData(), view }),
    onZoom: (zoom) => ipc.emit("preview:zoom", zoom),
    onZoomReady: (ready) => ipc.emit("preview:zoom-ready", ready),
    // Once per website, the preview goes to all its pages when the agent begins the second (Q131).
    onManyPages: () => {
      const data = viewData();
      if (data.switched || !current) return;
      writeViewData({ ...data, switched: true });
      void preview.setView("pages");
    },
    invokes: {
      "preview:edit": (action) => editor.edit(action),
      "preview:edit-info": (file, at, record) => editor.info(file, at, record),
      "preview:pick-image": () => pickImage(),
      "preview:to-edit": () => preview.setMode("edit"),
      "preview:comment-save": (comment) => commentsChanged(current && comments.save(current.id, comment)),
      "preview:comment-remove": (id) => commentsChanged(current && comments.remove(current.id, id)),
      "preview:comments-send": () => sendComments(),
      "preview:comments-discard": () => void discardComments(),
    },
  });
  const peek = new BlockPeek(win, () => preview.origin);
  const tips = new TipOverlay(win);
  await preview.start();
  // The templates a new website may start from (Q245, Q249): Upstart's, from
  // the public repository's releases once packaged (their catalogue and
  // pictures shipped with the app, a template downloaded when it is needed,
  // Q247, Q250) or from the repository's folder in development, and the maker's
  // imported ones; one is shown large by a viewer of its own.
  const releases = env.templatesUrl ?? (app.isPackaged ? TEMPLATES_RELEASES : undefined);
  const templates = new TemplateLibrary(
    releases
      ? {
          releases,
          snapshot:
            env.templatesSnapshot ??
            (app.isPackaged
              ? join(process.resourcesPath, "templates-catalogue")
              : join(here, "../../templates-catalogue")),
          cache: join(app.getPath("userData"), "template-cache"),
          app: app.getVersion(),
        }
      : { folder: join(here, "../../templates") },
    join(app.getPath("userData"), "templates"),
  );
  void templates.refresh().then((changed) => changed && ipc.emit("templates:changed"));
  const templateViewer = new TemplateViewer(win, {
    background: env.background,
    onState: (state) => ipc.emit("templates:view-state", state),
    font: (path) => fonts.path(path),
  });
  await templateViewer.start();
  /** For automated checks: what a dialog would have answered. */
  const checks: { importPath?: string } = {};

  // The agent (ADR 0002, 0007, 0010). Its configuration, sign-in and
  // conversations live in the app's data, never in the maker's own Claude folder.
  const userData = app.getPath("userData");
  const binary = agentBinary();
  const launcher = nodeLauncher(userData);
  const agentEnv = () => {
    const base = cleanEnv();
    return {
      ...withPathFirst(base, launcher.binDir),
      // Windows: Git Bash is the agent's shell (Q375).
      ...gitBashEnv(gitBash.path),
      CLAUDE_CONFIG_DIR: env.agentConfigDir ?? join(userData, "agent"),
      // Back to the project folder after each shell command: a cd the agent
      // leaves behind would send its next relative paths astray (Q220).
      CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: "1",
      // The card of pages waits for the maker as long as they take (Q302): a day.
      MCP_TOOL_TIMEOUT: String(24 * 3600 * 1000),
    };
  };
  // Skills (ADR 0010): shipped with the app, the maker's for every project, the project's own.
  const skills = new Skills(
    app.isPackaged ? join(process.resourcesPath, "skills") : join(here, "../../skills"),
    join(userData, "skills"),
  );
  // Secrets are encrypted by the system keychain. A background launch is a
  // check: it never touches the keychain, which could show a dialog.
  const vault: Vault = env.background
    ? {
        encrypt: (text) => Buffer.from(`check:${Buffer.from(text).toString("base64")}`),
        decrypt: (data) => Buffer.from(data.toString().replace(/^check:/, ""), "base64").toString(),
      }
    : {
        encrypt: (text) => safeStorage.encryptString(text),
        decrypt: (data) => safeStorage.decryptString(data),
      };
  const connectors = new Connectors(userData, vault);
  // Each website's management token, for its published site (Q183).
  const tokens = new ManagementTokens(userData, vault);
  // Free images for the agent and the maker (Q150); a folder of made-up ones for the checks.
  const images: ImageFinder = env.imagesFixture ? new FixtureImages(env.imagesFixture) : new ImageSearch();
  // What Upstart gives a project's agent, whichever layer runs it (ADR 0012): its tools and its checks.
  const kitFor = (project: { id: string; path: string }): AgentKit => {
    const checks = new TurnChecks(project.path);
    return {
      checks,
      tools: {
        look: (route, options) => preview.look(route, options),
        findBlocks: findBlocksIn(project.path),
        findImages: async (query, count) => imagesAnswer(query, await images.search(query, count)),
        useImage: (wanted) => addFoundImages(images, project.path, wanted),
        useBlocks: (input) => {
          const { text, samples, files } = useBlocks(project.path, input, (id) =>
            new ProjectBlocks(gallery, () => project.path).get(id),
          );
          checks.placed(samples, files);
          return text;
        },
        // The card of pages of a template's adaptation (Q302), whichever agent shows it.
        choosePages: async (input, signal) => {
          const read = readPagesCard(project.path, input);
          if ("problem" in read) return read.problem;
          const got = await agent.askPages(project.id, read.pages, signal);
          if (!got) return NOT_ANSWERED;
          const text = pagesAnswered(project.path, read.pages, got.answer);
          emitAdaptation(project.id);
          return got.note ? `${text}\n\n${got.note}` : text;
        },
      },
    };
  };
  /** The open website's adaptation, for the list under the conversation (Q303). */
  const emitAdaptation = (projectId: string, finished = false) => {
    if (current?.id !== projectId) return;
    ipc.emit("adaptation:changed", { projectId, state: adaptationView(readAdaptation(current.path)), finished });
  };
  let agent: Agent;
  let connectorStateTimer: NodeJS.Timeout | undefined;
  // Upstart's own harness (ADR 0012): ChatGPT through Sign in with ChatGPT, the maker's OpenAI and Gemini keys.
  const piAccounts = new PiAccounts({
    dir: join(userData, "accounts"),
    vault,
    identity: {
      userAgent: { custom: `Upstart/${app.getVersion()}` },
      attribution: { name: "Upstart", url: "https://upstart.gg" },
    },
    onChange: () => agent && ipc.emit("agent:status", agent.status()),
    openBrowser: (url) => {
      if (url.startsWith("https://") && !env.background) void shell.openExternal(url);
    },
  });
  void piAccounts.load().then(() => agent && ipc.emit("agent:status", agent.status()));
  const auth = new AgentAuth({
    binary,
    env: agentEnv,
    keyFile: join(userData, "api-key.bin"),
    vault,
    onChange: () => void agent.signInChanged(),
  });
  agent = new Agent({
    auth,
    session: {
      binary,
      readable: launcher.readable,
      instructions: () => instructionsFor(settings.get().replyStyle),
      extraOptions: (project) => claudeExtras(kitFor(project)),
      connectors: [UPSTART_SERVER],
      skills,
      connectorServers: connectors,
      query: (env.agentReplay ? replayQuery(env.agentReplay, env.agentReplaySpeed) : query) as never,
      recorder: env.agentRecord ? new Recorder(env.agentRecord) : undefined,
    },
    pi: {
      accounts: piAccounts,
      replay: env.piReplay ? piReplay(env.piReplay, 100 * env.agentReplaySpeed) : undefined,
      deps: {
        kit: kitFor,
        instructions: (family, listed) => instructionsFor(settings.get().replyStyle, family, listed),
        env: agentEnv,
        readable: launcher.readable,
        // On Windows, the shell is Git Bash, behind a gate (Q381, Q382).
        gitBash: () => gitBash.path,
        skills,
        // The maker's connectors, which Upstart connects itself for these models (Q277).
        connectorServers: connectors,
        signIns: new VaultSignIns(join(userData, "connector-sign-ins.bin"), vault),
        recorder: env.piRecord ? new PiRecorder(env.piRecord) : undefined,
        onConnectorsChange: () => {
          clearTimeout(connectorStateTimer);
          connectorStateTimer = setTimeout(async () => ipc.emit("connectors:changed", await connectorList()), 100);
        },
        identity: {
          userAgent: { custom: `Upstart/${app.getVersion()}` },
          attribution: { name: "Upstart", url: "https://upstart.gg" },
        },
      },
    },
    modelsFile: join(userData, "claude-models.json"),
    dataFor: (id) => projects.dataFor(id),
    emitConversation: (projectId, event) => {
      ipc.emit("conversation:event", { projectId, event });
      // Editing by hand waits while the agent works on the project shown (Q91), and
      // comes back while it waits for the maker's answer (Q294).
      if (projectId === current?.id && PAUSING.has(event.type)) preview.setPaused(agentBusy(projectId));
      if (WAITING.has(event.type)) ipc.emit("agent:waiting", agent.waiting());
      if (event.type === "question" || event.type === "pages" || event.type === "plan")
        notifyWaiting(projectId, event.type === "plan" ? "plan" : "question");
      // An approved plan puts the selector back on Build (Q290, Q296).
      if (event.type === "plan-settled" && event.state === "approved") {
        const project = projects.update(projectId, { mode: "build" });
        if (current?.id === projectId) changed(project);
      }
      // The agent writes nothing while it waits for the maker either.
      if (
        projectId === current?.id &&
        (event.type === "turn-end" || event.type === "question" || event.type === "pages" || event.type === "plan")
      )
        preview.doneWriting();
      // A page type adapted waits for the maker to look at it; after the last one, the adaptation is over (Q303, Q307).
      if (event.type === "turn-end") {
        const path = projectId === current?.id ? current.path : projects.list().find((p) => p.id === projectId)?.path;
        const done = event.status === "done";
        if (path && readAdaptation(path)) {
          const { finished } = turnEnded(path, done);
          if (finished) agent.notice(projectId, t.adaptation.finished);
          emitAdaptation(projectId, finished);
          maybeTour(projectId, { done, adapting: true, adaptationFinished: finished });
        } else maybeTour(projectId, { done, adapting: false, adaptationFinished: false });
      }
      // A version of the project after each turn of the agent (decisions: history).
      if (event.type === "turn-end" && history?.projectId === projectId) {
        history.store.snapshot("turn", history.lastMessage ?? "");
        emitHistory();
      }
      if (event.type === "turn-end") notifyDone(projectId, event.status, event.error);
      if (event.type === "turn-end" && event.status === "failed")
        stats.track("error", { type: errorType(event.error, t.errors) });
      // The agent's next look starts from a fresh page (Q324).
      if (event.type === "turn-end" && projectId === current?.id) preview.endTurn();
    },
    emitStatus: (status) => ipc.emit("agent:status", status),
    // What the agent writes reaches the preview before the disk (ADR 0009).
    onAgentEvent: (projectId, event) => {
      if (tap && tap.projectId === projectId) tap.tap.handle(event);
      if (event.kind === "init" && projectId === current?.id) void followConnectors();
    },
  });
  let tap: { projectId: string; tap: FileTap } | undefined;
  let history: { projectId: string; store: History; lastMessage?: string } | undefined;
  // What the agent is told before the next message (a return to an earlier version, edits by hand).
  // The maker's comments on the page, sent together as one message (Q95).
  const comments = new Comments();
  const commentsChanged = (list: PageComment[] | undefined) => {
    const now = list ?? [];
    preview.setComments(now);
    ipc.emit("comments:changed", now);
    return now;
  };
  const discardComments = () => {
    if (current) comments.clear(current.id);
    return commentsChanged([]);
  };
  const sendComments = () => {
    if (!current) return;
    const list = comments.list(current.id);
    if (!list.length) return;
    if (agent.isWorking(current.id)) throw new Error(t.editing.busy);
    const message = commentsMessage(list);
    discardComments();
    sendMessage(current, message.shown, message.forAgent);
  };
  const allNotes = new Map<string, AgentNotes>();
  const notesFor = (projectId: string) => {
    const notes = allNotes.get(projectId) ?? new AgentNotes();
    allNotes.set(projectId, notes);
    return notes;
  };
  // The maker's edits by hand, written by the app (Q90), each a snapshot of its own (Q94).
  const editor = new Editor({
    root: () => current?.path,
    block: (id) => blocks.get(id),
    busy: () => !!current && agentBusy(current.id),
    before: () => history?.store.snapshot("outside", ""),
    did: (what) =>
      stats.track(
        ({ page: "page_edit", block: "block_dropped", theme: "theme_changed", content: "content_changed" } as const)[
          what
        ],
      ),
    changed: (change) => {
      history?.store.snapshot("hand", change.label);
      if (current) notesFor(current.id).changed(change);
      emitHistory();
    },
  });
  const historyEntries = (): HistoryEntry[] => {
    if (!history) return [];
    const list = history.store.list();
    const now = history.store.scan();
    const same = (files: Record<string, string>) =>
      Object.keys(files).length === Object.keys(now).length && Object.entries(files).every(([k, v]) => now[k] === v);
    return list.map((s, i) => ({
      id: s.id,
      at: s.at,
      kind: s.kind,
      label: s.label,
      current: i === list.length - 1 && same(s.files),
    }));
  };
  const emitHistory = () => {
    if (!history) return;
    ipc.emit("history:changed", { projectId: history.projectId, entries: historyEntries() });
    // The website changed: the sidebar's "Last updated" order follows (Q393).
    ipc.emit("projects:changed", projects.list());
  };
  const goBack = (id: string | undefined) => {
    if (!history || !current) throw new Error("No project is open.");
    if (agent.isWorking(current.id)) throw new Error("The agent is working: stop it first.");
    if (!id) return historyEntries();
    const snapshot = history.store.restore(id);
    notesFor(current.id).restored(snapshot.label);
    agent.notice(current.id, t.history.notice(snapshot.label || t.history.start));
    emitHistory();
    return historyEntries();
  };
  const tapFor = (project: ProjectInfo) => ({
    projectId: project.id,
    tap: new FileTap({
      root: project.path,
      read: (rel) => preview.overlay?.read(rel),
      set: (rel, content) =>
        content === undefined ? preview.overlay?.delete(rel) : preview.overlay?.set(rel, content),
      changed: (final) => preview.refresh(final),
      follow: (rel) => preview.follow(rel),
    }),
  });
  if (!env.agentReplay) void agent.checkSignIn();

  // A website's view in the preview, and whether it already went to all its pages on its own (Q131).
  type ViewData = { view?: PreviewView; switched?: boolean };
  const viewFile = () => current && join(projects.dataFor(current.id), "preview.json");
  const viewData = (): ViewData => {
    const file = viewFile();
    try {
      return file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    } catch {
      return {};
    }
  };
  const writeViewData = (data: ViewData) => {
    const file = viewFile();
    if (file) writeFileSync(file, JSON.stringify(data));
  };
  // A skill added, removed or written by the agent reaches the interface, and
  // the agent with the maker's next message.
  let skillWatchers: FSWatcher[] = [];
  let skillsTimer: NodeJS.Timeout | undefined;
  const skillsChanged = () => {
    clearTimeout(skillsTimer);
    skillsTimer = setTimeout(() => {
      ipc.emit("skills:changed", skills.list(current?.path));
      agent.refreshExtensions();
    }, 300);
  };
  // Connectors: their definitions with their state here, and how the agent's kit sees them.
  const connectorList = async (): Promise<ConnectorInfo[]> => {
    const live = current ? await agent.connectorStatus(current.id) : [];
    return connectors.list(current).map((c) => {
      const status = c.state === "on" ? live.find((s) => s.name === c.name) : undefined;
      return status ? { ...c, status: status.status as ConnectorInfo["status"], error: status.error } : c;
    });
  };
  let connectorsTimer: NodeJS.Timeout | undefined;
  const connectorsChanged = () => {
    clearTimeout(connectorsTimer);
    connectorsTimer = setTimeout(async () => {
      agent.refreshExtensions();
      ipc.emit("connectors:changed", await connectorList());
    }, 300);
  };
  /** After the agent starts, its connectors connect: the interface follows until none is pending. */
  const followConnectors = async () => {
    for (let i = 0; i < 40; i++) {
      const list = await connectorList();
      ipc.emit("connectors:changed", list);
      if (!list.some((c) => c.status === "pending")) return;
      await new Promise((r) => setTimeout(r, 500));
    }
  };
  /** While the maker signs in in their browser, the interface follows the connector until it no longer asks. */
  const followSignIn = async (name: string) => {
    for (let i = 0; i < 300; i++) {
      const list = await connectorList();
      ipc.emit("connectors:changed", list);
      const status = list.find((c) => c.name === name)?.status;
      if (status && status !== "needs-auth" && status !== "pending") return;
      await new Promise((r) => setTimeout(r, 1000));
    }
  };
  const watchSkills = (project: ProjectInfo | undefined) => {
    for (const watcher of skillWatchers) watcher.close();
    skillWatchers = [];
    const appSkills = join(userData, "skills");
    mkdirSync(appSkills, { recursive: true });
    const watched: [string, (name: string) => boolean][] = [[appSkills, () => true]];
    if (project)
      watched.push([
        join(project.path, ".upstart"),
        (name) => {
          if (name.startsWith("connectors")) connectorsChanged();
          return name.startsWith("skills");
        },
      ]);
    for (const [dir, relevant] of watched) {
      try {
        skillWatchers.push(
          watch(dir, { recursive: true }, (_event, name) => relevant(String(name ?? "")) && skillsChanged()),
        );
      } catch {
        // A folder that cannot be watched: changes are picked up at the next start.
      }
    }
  };
  const opened = async (project: ProjectInfo) => {
    // A record being written in the Content tab gets its version first (Q162).
    editor.leaveRecord();
    current = project;
    templateViewer.close();
    watchSkills(project);
    agent.open(project);
    preview.setPaused(agentBusy(project.id));
    // The view the maker left this website in (Q131).
    void preview.setView(viewData().view ?? "page", { animate: false });
    await preview.open(project);
    commentsChanged(comments.list(project.id));
    tap = tapFor(project);
    history = { projectId: project.id, store: new History(projects.dataFor(project.id), project.path) };
    history.store.snapshot("start", "");
    emitHistory();
    ipc.emit("project:opened", project);
    ipc.emit("projects:changed", projects.list());
    emitAdaptation(project.id);
    return project;
  };
  const changed = (project: ProjectInfo) => {
    current = project;
    ipc.emit("project:opened", project);
    return project;
  };

  ipc.handle("settings:open", (page) => openSettings(page));
  ipc.handle("settings:get", () => settings.get());
  ipc.handle("settings:set", (change) => {
    const before = settings.get();
    const next = settings.set(change);
    if (next.textSize !== before.textSize) applyTextSize();
    if (next.appearance !== before.appearance) nativeTheme.themeSource = next.appearance;
    // The agent's instructions say how it writes to the maker: idle agents start again with the new style.
    if (next.replyStyle !== before.replyStyle) agent.instructionsChanged();
    ipc.emit("settings:changed", next);
    return next;
  });
  ipc.handle("tour:page", (tour) => preview.setTour(tour));
  ipc.handle("tour:seen", (how) => {
    stats.track(how === "finished" ? "tour_finished" : "tour_skipped");
    ipc.emit("settings:changed", settings.set({ tourSeen: true }));
  });
  ipc.handle("settings:reveal-projects", () => {
    mkdirSync(env.projectsDir, { recursive: true });
    if (!env.background) void shell.openPath(env.projectsDir);
  });
  // The app's own updates (Q367, Q378), from the editor's GitHub releases.
  const updates = new Updates({
    updater: electronUpdater.autoUpdater,
    enabled: app.isPackaged && !env.background && process.env.UPSTART_UPDATES !== "0",
    emit: (state) => ipc.emit("app:update", state),
    log: (message) => console.warn(message),
  });
  updates.start();
  ipc.handle("app:update-state", () => updates.state());
  ipc.handle("app:restart-to-update", () => updates.restart());
  ipc.handle("app:open-link", (url) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("Only a web address can be opened.");
    if (!env.background) void shell.openExternal(url);
  });
  ipc.handle("app:info", () => ({
    version: app.getVersion(),
    sendsStatistics: app.isPackaged && !!APTABASE_KEY,
    platform: process.platform,
    background: env.background,
    projectsDir: env.projectsDir,
    versions: {
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
    },
  }));
  ipc.on("app:ready", () => console.log("[upstart] interface ready"));
  ipc.handle("projects:list", () => projects.list());
  ipc.handle("projects:create", (name) => opened(projects.create(name)));
  ipc.handle("projects:open", (id) => opened(projects.open(id)));
  ipc.handle("projects:current", () => current ?? null);
  ipc.handle("projects:rename", (id, name) => {
    const clean = name.trim().slice(0, 120);
    if (!clean) return;
    const project = projects.update(id, { name: clean });
    if (current?.id === id) changed({ ...current, name: project.name });
    ipc.emit("projects:changed", projects.list());
  });
  ipc.handle("projects:close", () => {
    editor.leaveRecord();
    current = undefined;
    watchSkills(undefined);
    tap = undefined;
    history = undefined;
    agent.open(undefined);
    preview.close();
    commentsChanged([]);
    ipc.emit("project:opened", null);
  });
  ipc.handle("projects:choose-folder", async () => {
    if (env.background) return null;
    const answer = await dialog.showOpenDialog(dialogParent(), {
      title: "Open a website folder",
      properties: ["openDirectory", "createDirectory"],
    });
    const folder = answer.filePaths[0];
    return answer.canceled || !folder ? null : opened(projects.openFolder(folder));
  });
  ipc.handle("preview:navigate", (route) => preview.navigate(route, true));
  ipc.handle("preview:reload", () => preview.reload());
  ipc.handle("preview:snapshot", () => preview.snapshot());
  // The interface measures in its own pixels, drawn larger or smaller by the text size.
  const scaled = <R extends Rect | null>(r: R): R => {
    const zoom = win.webContents.getZoomFactor();
    return (r && {
      x: Math.round(r.x * zoom),
      y: Math.round(r.y * zoom),
      width: Math.round(r.width * zoom),
      height: Math.round(r.height * zoom),
    }) as R;
  };
  ipc.on("preview:bounds", (rect, device, area, parked) => {
    preview.setBounds(scaled(rect), device, parked);
    if (rect && !parked) ipc.emit("preview:placed");
    // Over the preview's column, the "All pages" view's included, where the page itself is parked.
    peek.setArea(scaled(rect && (area ?? rect)));
  });
  ipc.handle("templates:list", () => templates.list());
  ipc.handle("templates:picture", (id, which) => templates.picture(id, which === "hover" ? "hover" : "cover"));
  ipc.handle("templates:view", async (id, route) => {
    if (!id || current) {
      templateViewer.close();
      return;
    }
    // Downloaded first if it has to be (Q247); the panel says why it cannot be shown.
    let dir: string;
    try {
      dir = await templates.dir(id);
    } catch (error) {
      templateViewer.close();
      return error instanceof Error ? error.message : String(error);
    }
    await templateViewer.show(id, dir, typeof route === "string" && route.startsWith("/") ? route : "/");
  });
  ipc.on("templates:bounds", (rect) => templateViewer.setBounds(scaled(rect)));
  ipc.handle("templates:import", async () => {
    // Checks name the folder to import instead of a dialog, which would take the focus.
    if (env.background) return checks.importPath ? templates.read(checks.importPath) : null;
    const answer = await dialog.showOpenDialog(dialogParent(), {
      title: t.start.importTitle,
      properties: ["openFile", "openDirectory"],
      filters: [{ name: "Template", extensions: ["zip"] }],
    });
    const path = answer.filePaths[0];
    return answer.canceled || !path ? null : templates.read(path);
  });
  ipc.handle("templates:accept-import", (token) => templates.accept(token));
  // A thumbnail's right-click menu (Q136). Duplicating and deleting are edits by hand:
  // a version each, told to the agent at its next message, waiting while it works.
  const pageItems = (route: string): Electron.MenuItemConstructorOptions[] => {
    const project = current;
    const file = preview.state().routes.find((r) => r.route === route)?.file;
    if (!project || !file) return [];
    const m = t.preview.pageMenu;
    const busy = agentBusy(project.id);
    const edit = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        if (!(error instanceof EditRefused)) throw error;
        void dialog.showMessageBox(win, { type: "info", message: error.message });
      }
    };
    // A record's page: its menu's Duplicate and Delete act on the record (Q164).
    const page = preview.state().routes.find((r) => r.route === route);
    if (page?.generated) return [];
    const record = page?.record && recordFile(page.record.datasource, page.record.id);
    const shown = record ?? file;
    return [
      {
        label: m.open,
        click: () => void preview.openPage(route),
      },
      { type: "separator" },
      {
        label: m.duplicate,
        enabled: !busy,
        click: () => edit(() => (record ? editor.duplicateRecord(record) : editor.duplicatePage(file))),
      },
      {
        label: m.delete,
        enabled: !busy && route !== "/",
        click: () =>
          edit(() => {
            if (record) editor.deleteRecord(record);
            else editor.deletePage(file, route === "/");
            ipc.emit("preview:page-deleted", { route, name: page?.title });
          }),
      },
      { type: "separator" },
      {
        label: m.ask,
        click: () => {
          win.webContents.focus();
          ipc.emit("conversation:prefill", t.preview.askAbout(route));
        },
      },
      { type: "separator" },
      {
        label: m.browser,
        click: () => {
          if (!env.background) void shell.openExternal(new URL(route, preview.origin).toString());
        },
      },
      {
        label: m.finder,
        click: () => {
          if (!env.background) shell.showItemInFolder(join(project.path, shown));
        },
      },
    ];
  };
  const pageMenu = (route: string) => {
    const items = pageItems(route);
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  };
  ipc.on("preview:grid", (cells, screen) => {
    // The preview's own size (Q142, being tried) is in the interface's pixels, as the page view's is.
    const size = screen?.panel ? scaled({ x: 0, y: 0, width: screen.width, height: screen.height }) : undefined;
    const laidOut = screen && {
      width: size?.width ?? screen.width,
      height: size?.height ?? screen.height,
      mobile: screen.mobile,
    };
    preview.setGrid(cells?.map((c) => ({ ...c, rect: scaled(c.rect) })) ?? null, laidOut);
  });

  /** The agent works on a project and does not wait for the maker: editing by hand waits (Q91, Q294). */
  function agentBusy(projectId: string) {
    return agent.isWorking(projectId) && !agent.waitingFor(projectId);
  }
  ipc.handle("conversation:get", () =>
    current ? { projectId: current.id, items: agent.conversation(current.id) } : null,
  );
  ipc.handle("conversation:send", async (text, settings) => {
    const message = text.trim();
    if (!message) return;
    // While the agent waits, what the maker types answers it (Q284).
    const waiting = current && agent.waitingFor(current.id);
    if (current && waiting) {
      editor.leaveRecord();
      const note = notesFor(current.id).take();
      if (!isPlan(waiting)) agent.answer(current.id, waiting.id, { kind: "words", text: message }, note);
      // The maker's changes to the plan (Q290).
      else agent.settlePlan(current.id, waiting.id, { changes: message }, note);
      return;
    }
    // The agent hears of the record the maker was writing with this message (Q162).
    editor.leaveRecord();
    // A first message without a project creates one (decisions: built at once
    // from it, with the model and effort the maker picked beforehand).
    let project = current;
    if (!project) {
      // The template it starts from, if the maker chose one (Q245), downloaded
      // first if it has to be (Q247): copied into it, then adapted by the agent (Q246).
      let dir: string | undefined;
      try {
        dir = typeof settings?.template === "string" ? await templates.dir(settings.template) : undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      const created = projects.create(projectNameFrom(message));
      const model = typeof settings?.model === "string" ? settings.model : created.model;
      const effort = isEffort(settings?.effort) ? settings.effort : created.effort;
      // Created in plan mode, the agent plans before it builds (Q286); never from a template,
      // whose card of pages and adaptation stand for the plan (Q312).
      const mode = settings?.mode === "plan" && !dir ? ("plan" as const) : undefined;
      const copied = dir ? copyTemplate(dir, created.path) : undefined;
      const manifest = copied?.manifest;
      const template = manifest && { id: manifest.id, version: manifest.version };
      stats.track("site_created", { template: manifest?.id ?? "none" });
      project = await opened(
        projects.update(created.id, { model, effort, ...(template ? { template } : {}), ...(mode ? { mode } : {}) }),
      );
      if (copied) {
        emitAdaptation(project.id);
        const steps = readAdaptation(project.path)?.steps ?? [];
        sendMessage(project, message, adaptMessage(copied.manifest, message, copied.guide, steps));
        return;
      }
    }
    // During an adaptation, the agent hears which page the maker is looking at (Q303).
    const adaptation = readAdaptation(project.path);
    sendMessage(
      project,
      message,
      adaptation ? `${reviewNote(adaptation, removalsOf(project.path, adaptation))}\n\n${message}` : message,
    );
  });
  /** A message to the agent: `shown` in the conversation, `forAgent` what the agent receives. */
  function sendMessage(project: ProjectInfo, shown: string, forAgent: string) {
    // What the maker changed by hand since the last version is kept apart.
    if (history?.projectId === project.id) {
      history.store.snapshot(history.store.list().length ? "outside" : "start", "");
      history.lastMessage = shown;
    }
    // After a return to an earlier version, or edits by hand, the agent is told before the message.
    const note = notesFor(project.id).take();
    preview.startFollowing();
    agent.send(project, shown, note ? `${note}\n\n${forAgent}` : forAgent);
    stats.track("message_sent", { provider: accountOf(project.model) });
  }
  ipc.handle("conversation:stop", () => current && agent.stop(current.id));
  ipc.handle("conversation:answer", (cardId, answer) => {
    if (!current) return;
    editor.leaveRecord();
    agent.answer(current.id, cardId, answer, notesFor(current.id).take());
  });
  ipc.handle("agent:waiting", () => agent.waiting());
  ipc.handle("conversation:approve-plan", (cardId) => {
    if (!current) return;
    editor.leaveRecord();
    agent.settlePlan(current.id, cardId, { approved: true }, notesFor(current.id).take());
  });
  ipc.handle("conversation:start-over", () => current && agent.startOver(current));
  // The adaptation's list and its Continue button (Q303, Q307, Q313).
  ipc.handle("adaptation:get", () => (current ? adaptationView(readAdaptation(current.path)) : null));
  ipc.handle("adaptation:continue", () => {
    const project = current;
    if (!project) return;
    if (agent.isWorking(project.id)) return t.adaptation.busy;
    const root = project.path;
    const state = readAdaptation(root);
    if (!state) return;
    editor.leaveRecord();
    if (!state.chosen) {
      sendMessage(
        project,
        t.adaptation.choosePages,
        "Show the maker the card of pages with choose_pages, as the first message said, then go on with the home page.",
      );
      return;
    }
    const interrupted = state.steps.some((s) => s.status === "doing");
    const step = continueAdaptation(root);
    const now = readAdaptation(root);
    const removals = now ? removalsOf(root, now) : [];
    if (!step || !now) {
      if (!removals.length) {
        finishAdaptation(root);
        agent.notice(project.id, t.adaptation.finished);
        emitAdaptation(project.id, true);
        maybeTour(project.id, { done: false, adapting: true, adaptationFinished: true });
        return;
      }
      emitAdaptation(project.id);
      sendMessage(project, t.adaptation.removeShown, removalMessage(removals, adaptationGuide(root)));
      return;
    }
    emitAdaptation(project.id);
    sendMessage(
      project,
      t.adaptation.continueTo(step.name),
      stepMessage(now, step, adaptationGuide(root), { again: interrupted, removals }),
    );
  });
  ipc.handle("adaptation:pick", (route) => {
    if (!current || agent.isWorking(current.id)) return current ? adaptationView(readAdaptation(current.path)) : null;
    const state = adaptationView(pickNext(current.path, route));
    emitAdaptation(current.id);
    return state;
  });
  ipc.handle("adaptation:remove", (route) => {
    if (!current || agent.isWorking(current.id)) return current ? adaptationView(readAdaptation(current.path)) : null;
    const state = adaptationView(removeStep(current.path, route));
    emitAdaptation(current.id);
    return state;
  });
  ipc.handle("adaptation:picture", async (route) => {
    if (!current) return null;
    // A page type with a page per record shows its first record's page.
    const routes = preview.runtime?.routes() ?? [];
    const shown =
      routes.find((r) => r.route === route && !r.generated)?.route ??
      routes.find((r) => r.record && r.route.startsWith(`${route}/`))?.route;
    if (!shown) return null;
    return thumbnails.page(shown).catch(() => null);
  });
  // The static export (decisions): into a folder the maker picks, remembered per project on this machine.
  const lastExportFile = () => current && join(projects.dataFor(current.id), "export.json");
  // How the website was last published on this machine: the way chosen, and each way's folder.
  const lastExport = (): { builder?: string; folders: Record<string, string> } => {
    const file = lastExportFile();
    try {
      const raw = file ? JSON.parse(readFileSync(file, "utf8")) : {};
      return {
        ...(typeof raw.builder === "string" ? { builder: raw.builder } : {}),
        folders: { ...(raw.folder ? { static: raw.folder } : {}), ...(raw.folders ?? {}) },
      };
    } catch {
      return { folders: {} };
    }
  };
  ipc.handle("export:last", (builder) => lastExport().folders[builder] ?? null);
  ipc.handle("export:choices", () => {
    if (!current) throw new Error("No project is open.");
    const last = lastExport().builder;
    return { ...publishChoices(current.path, current.name), ...(last ? { last } : {}) };
  });
  ipc.handle("projects:set-form-service", (datasource, url) => {
    if (!current) throw new Error("No project is open.");
    const clean = url.trim();
    if (clean && !/^https?:\/\/[^\s]+$/i.test(clean)) throw new Error("This is not a web address.");
    const services = { ...(readProjectFile(current.path)?.formServices ?? {}) };
    if (clean) services[datasource] = clean;
    else delete services[datasource];
    return changed(projects.update(current.id, { formServices: services }));
  });
  ipc.handle("export:choose-folder", async () => {
    if (env.background) return null;
    const answer = await dialog.showOpenDialog(dialogParent(), {
      title: "Export the website into a folder",
      properties: ["openDirectory", "createDirectory"],
    });
    return answer.canceled ? null : (answer.filePaths[0] ?? null);
  });
  ipc.handle("export:run", async (folder, builder) => {
    if (!current) throw new Error("No project is open.");
    if (agent.isWorking(current.id)) throw new Error("The agent is working: export once it is done.");
    const formServices = readProjectFile(current.path)?.formServices;
    const result = await exportProject(current.path, folder, {
      builder,
      name: current.name,
      hostsDir: app.isPackaged ? join(process.resourcesPath, "hosts") : join(here, "../hosts"),
      ...(formServices ? { formServices } : {}),
      managementToken: () => tokens.ensure(current!.id),
    }).catch((error) => {
      stats.track("error", { type: "export" });
      throw error;
    });
    stats.track("published", { way: builder as (typeof PUBLISH_WAYS)[number] });
    writeFileSync(
      lastExportFile()!,
      JSON.stringify({ builder, folders: { ...lastExport().folders, [builder]: result.folder } }),
    );
    return result;
  });
  ipc.handle("export:reveal", (folder) => {
    if (!env.background && existsSync(folder)) shell.showItemInFolder(folder);
  });
  const hosts = {
    netlify: "https://app.netlify.com/drop",
    cloudflare: "https://developers.cloudflare.com/pages/get-started/direct-upload/",
    github: "https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site",
  } as const;
  ipc.handle("export:open-host", (host) => {
    const url = hosts[host];
    if (url && !env.background) void shell.openExternal(url);
  });
  ipc.handle("projects:set-site-url", (url) => {
    if (!current) throw new Error("No project is open.");
    const clean = url.trim();
    if (clean && !/^https?:\/\/[^\s]+$/i.test(clean)) throw new Error("This is not a web address.");
    return changed(projects.update(current.id, { siteUrl: clean || undefined }));
  });
  ipc.handle("skills:list", () => skills.list(current?.path));
  ipc.handle("skills:choose-folder", async () => {
    if (env.background) return null;
    const answer = await dialog.showOpenDialog(dialogParent(), {
      title: "Choose a skill's folder (it holds a SKILL.md file)",
      properties: ["openDirectory"],
    });
    return answer.canceled ? null : (answer.filePaths[0] ?? null);
  });
  ipc.handle("skills:add", (origin, folder) => {
    const added = skills.add(origin, folder, current?.path);
    skillsChanged();
    return added;
  });
  ipc.handle("skills:remove", (origin, name) => {
    skills.remove(origin, name, current?.path);
    skillsChanged();
  });
  ipc.handle("connectors:list", () => connectorList());
  ipc.handle("connectors:add", (scope, draft) => {
    connectors.add(scope, draft, current);
    connectorsChanged();
  });
  ipc.handle("connectors:remove", (scope, name) => {
    connectors.remove(scope, name, current);
    connectorsChanged();
  });
  ipc.handle("connectors:set-secrets", (scope, name, values) => {
    connectors.setSecrets(scope, name, values, current?.id);
    connectorsChanged();
  });
  ipc.handle("connectors:approve", (name) => {
    if (!current) throw new Error("No project is open.");
    connectors.approveByName(name, current);
    connectorsChanged();
  });
  ipc.handle("connectors:sign-in", async (name) => {
    if (!current) throw new Error("No project is open.");
    const url = await agent.signInConnector(current.id, name);
    if (url && !env.background) void shell.openExternal(url);
    void followSignIn(name);
    return { url };
  });
  ipc.handle("history:list", () => historyEntries());
  ipc.handle("history:restore", (id) => goBack(id));
  ipc.handle("history:undo", () => goBack(history?.store.undoTarget()?.id));
  ipc.handle("editing:apply", (action) => editor.apply(action));
  const thumbnails = new Thumbnails(join(userData, "gallery-thumbnails"), () => preview.origin);
  ipc.on("tip:show", (tip) => void tips.show(tip));
  ipc.on("tip:hide", () => tips.hide());
  ipc.on("gallery:peek", (id) => {
    if (id && blocks.get(id)) void peek.show(id);
    else peek.hide();
  });
  // Its hidden window must not keep the app open once the maker's window is closed.
  win.on("closed", () => {
    thumbnails.close();
    peek.close();
    preview.grid.close();
    preview.agentView.close();
  });
  ipc.handle("gallery:list", () => blocks.list().map(described));
  ipc.handle("gallery:thumbnail", (id) => {
    const block = blocks.get(id);
    const theme = preview.runtime?.theme();
    if (!block || theme === undefined) throw new Error("No such block, or no project open.");
    return thumbnails.get(id, blockShown(block), theme);
  });
  // The Theme tab (Q93): values shown while a gesture lasts, written at its end.
  const themed = (values: Record<string, string>, base?: string) => {
    const css = writeTheme(preview.runtime?.theme() ?? "", values);
    const all = readTheme(css);
    const ids = [all["--theme-font-heading"], all["--theme-font-body"]]
      .map((v) => fonts.usedBy(v)?.id)
      .filter((id): id is string => !!id);
    return { css: fonts.withFaces(css, [...new Set(ids)], base), ids: [...new Set(ids)] };
  };
  // The "Site's own" palette: the agent's first colours (Q113), then as the maker edits it (Q114), kept on this machine.
  const ownFile = () => current && join(projects.dataFor(current.id), "own-palette.json");
  const ownPalette = (): ThemeValues | undefined => {
    const file = ownFile();
    try {
      if (file && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
    } catch {}
    return themeColors(history?.store.firstByAgent("theme.css"));
  };
  ipc.handle("theme:get", () => ({
    values: readTheme(preview.runtime?.theme() ?? "") as Record<string, string>,
    fonts: fonts.list(),
    own: ownPalette() as Record<string, string> | undefined,
  }));
  ipc.handle("theme:show", (values) => preview.showTheme(themed(values, "/__up/fonts").css));
  ipc.handle("theme:apply", (values, own) => {
    const { css, ids } = themed(values);
    const change = editor.writeTheme(css, fonts.files(ids));
    const file = ownFile();
    const colors = themeColors(css);
    if (own && file && colors) {
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, JSON.stringify({ ...ownPalette(), ...colors }));
    }
    return change;
  });
  // The Content tab (Q148, Q162-Q166): datasources read from the disk, records written by the editor.
  const contentSource = () => {
    if (!current) throw new Error("No project is open.");
    return new Datasources(diskSource(current.path), { testRecords: diskSource(join(current.path, TEST_RECORDS_DIR)) });
  };
  const isCollected = (datasource: string) => !!contentSource().definition(datasource).definition?.collected;
  const routeOfRecord = (file: string) => preview.runtime?.routeOf(file) ?? undefined;
  const contentRecordFile = (datasource: string, id: string) => {
    if (!/^[a-z0-9][\w-]*$/i.test(datasource) || !/^[a-z0-9][\w-]*$/i.test(id)) throw new Error("No such record.");
    // A collected datasource's records in the Content tab are the preview's test records (Q172, Q185).
    return isCollected(datasource) ? testRecordFile(datasource, id) : recordFile(datasource, id);
  };
  /** A collected datasource's test records, those waiting for review and those that do not read included. */
  const testRecordSummaries = (name: string, data: Datasources): ContentRecordSummary[] => {
    if (!current) return [];
    const { definition } = data.definition(name);
    const dir = join(current.path, TEST_RECORDS_DIR, name);
    const problems = new Map(data.get(name).problems.map((p) => [p.id, p]));
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^[a-z0-9][\w-]*\.md$/i.test(f)) : [];
    return files
      .map((f): ContentRecordSummary => {
        const id = f.slice(0, -3);
        const { values } = readRecordFile(readFileSync(join(dir, f), "utf8"));
        const title = values[titleField(definition)];
        const problem = problems.get(id);
        return {
          id,
          file: testRecordFile(name, id),
          title: typeof title === "string" && title.trim() ? title.trim() : id,
          problems: problem?.problems ?? [],
          skipped: problem?.skipped ?? false,
          test: true,
          ...(values.status === "pending" ? { pending: true } : {}),
          submitted:
            values.submitted instanceof Date
              ? values.submitted.toISOString()
              : typeof values.submitted === "string"
                ? values.submitted
                : "",
        };
      })
      .sort((a, b) => (b.submitted ?? "").localeCompare(a.submitted ?? ""));
  };
  ipc.handle("content:list", () => {
    if (!current) return [];
    const data = contentSource();
    const use = datasourceUse();
    return data.names().map((name): ContentDatasource => ({ ...contentDatasource(name, data), ...use(name) }));
  });
  /**
   * Which pages show each datasource (Q210, Q211), each page rendered once;
   * a section list is one named after a page (home-faq), listed under it.
   */
  const datasourceUse = () => {
    const runtime = preview.runtime;
    const shownBy = new Map<string, Set<string>>();
    const pages = new Map<string, string>();
    for (const route of runtime?.routes() ?? []) {
      if (route.record || pages.has(route.file)) continue;
      pages.set(route.file, route.route);
    }
    for (const [file, route] of pages)
      for (const name of runtime?.renderPage(file, route).datasources ?? [])
        shownBy.set(name, new Set([...(shownBy.get(name) ?? []), route]));
    const byKey = [...pages].map(([file, route]) => ({ file, route, key: pageKey(file) }));
    return (name: string): Pick<ContentDatasource, "usedBy" | "section"> => {
      const page = byKey.filter((p) => name.startsWith(`${p.key}-`)).sort((a, b) => b.key.length - a.key.length)[0];
      return {
        usedBy: [...(shownBy.get(name) ?? [])],
        ...(page && name !== NAVIGATION ? { section: { page: page.file, route: page.route } } : {}),
      };
    };
  };
  ipc.handle("content:delete-datasource", (name) => {
    const use = datasourceUse()(name);
    if (!use.section || use.usedBy.length) throw new Error("Only a section list no page shows can be deleted.");
    const label = contentSource().definition(name).definition?.label ?? titleOf(name);
    return editor.deleteDatasource(name, label);
  });
  const contentDatasource = (name: string, data: Datasources): Omit<ContentDatasource, "usedBy" | "section"> => {
    const { definition, problem } = data.definition(name);
    if (definition?.collected)
      return {
        name,
        label: definition.label,
        fields: definition.fields,
        ...(definition.body ? { body: definition.body } : {}),
        records: testRecordSummaries(name, data),
        ...(problem ? { problem } : {}),
        collected: true,
        ...(definition.review ? { review: true } : {}),
      };
    const ds = data.get(name);
    // A record's thumbnail: its first image field, or else the first image of its first list of images.
    const image = (
      definition?.fields.find((f) => f.kind === "image") ?? definition?.fields.find((f) => f.kind === "images")
    )?.name;
    const problems = new Map(ds.problems.map((p) => [p.id, p]));
    const records = ds.records.map((record): ContentRecordSummary => {
      const file = recordFile(name, record.id);
      const value = image ? record[image] : undefined;
      const picture = Array.isArray(value) ? value[0] : value;
      return {
        id: record.id,
        file,
        title: recordTitle(record, definition),
        ...(typeof picture === "string" && picture ? { image: picture } : {}),
        problems: problems.get(record.id)?.problems ?? [],
        skipped: false,
        ...(routeOfRecord(file) ? { route: routeOfRecord(file) } : {}),
      };
    });
    for (const p of ds.problems)
      if (p.skipped) records.push({ id: p.id, file: p.file, title: p.id, problems: p.problems, skipped: true });
    return {
      name,
      label: definition?.label ?? titleOf(name),
      fields: definition?.fields ?? [],
      ...(definition?.body ? { body: definition.body } : {}),
      ...(definition?.sort ? { sort: definition.sort } : {}),
      records,
      ...(problem ? { problem } : {}),
    };
  };
  ipc.handle("content:record", (datasource, id) => {
    if (!current) throw new Error("No project is open.");
    const file = contentRecordFile(datasource, id);
    const text = readFileSync(join(current.path, file), "utf8");
    const read = readRecordFile(text);
    const problems =
      contentSource()
        .get(datasource)
        .problems.find((p) => p.id === id)?.problems ?? [];
    return {
      id,
      file,
      values: read.values,
      body: read.body,
      ...(read.error ? { error: read.error } : {}),
      problems,
      ...(routeOfRecord(file) ? { route: routeOfRecord(file) } : {}),
    } satisfies ContentRecord;
  });
  ipc.handle("content:set-value", (datasource, id, field, value) => {
    const body = contentSource().definition(datasource).definition?.body;
    editor.setRecordValue(contentRecordFile(datasource, id), field, value, field === body);
  });
  ipc.handle("content:add", (datasource, values) => ({ id: editor.addRecord(datasource, values).id }));
  ipc.handle("content:leave", () => {
    editor.leaveRecord();
  });
  ipc.handle("content:duplicate", (datasource, id) => {
    const copy = editor.duplicateRecord(contentRecordFile(datasource, id));
    return { id: recordOf(copy.file)!.id };
  });
  ipc.handle("content:delete", (datasource, id) => {
    editor.deleteRecord(contentRecordFile(datasource, id));
  });
  ipc.handle("content:reorder", (datasource, ids) => {
    editor.reorderRecords(datasource, ids);
  });
  ipc.handle("content:rename", (datasource, id, to) => {
    const renamed = editor.renameRecord(contentRecordFile(datasource, id), to);
    return { id: recordOf(renamed.file)!.id };
  });
  // The records the published site collected (Q177, Q184): read when the maker opens the datasource.
  const site = () => {
    if (!current) throw new Error("No project is open.");
    return { url: current.siteUrl, token: tokens.get(current.id) };
  };
  const collectedName = (datasource: string) => {
    if (!/^[a-z0-9][\w-]*$/i.test(datasource) || !isCollected(datasource)) throw new Error("No such datasource.");
    return datasource;
  };
  ipc.handle("content:published", async (datasource) => {
    const { url, token } = site();
    try {
      return { records: await publishedRecords(url, token, collectedName(datasource)) };
    } catch (error) {
      if (error instanceof SiteUnavailable) return { error: error.message, reason: error.reason };
      throw error;
    }
  });
  ipc.handle("content:approve", async (datasource, id) => {
    const { url, token } = site();
    await callSite(url, token, `records/${collectedName(datasource)}/${encodeURIComponent(id)}/approve`, "POST");
  });
  ipc.handle("content:delete-published", async (datasource, id) => {
    const { url, token } = site();
    await callSite(url, token, `records/${collectedName(datasource)}/${encodeURIComponent(id)}`, "DELETE");
  });
  ipc.handle("content:csv", async (datasource) => {
    const { url, token } = site();
    const name = collectedName(datasource);
    const { definition } = contentSource().definition(name);
    const fields = definition?.fields.map((f) => f.name) ?? [];
    // What the list shows (Q190): the published records when the site answers, and the test records.
    const published = url && token ? await publishedRecords(url, token, name).catch(() => []) : [];
    const dir = join(current!.path, TEST_RECORDS_DIR, name);
    const tests: CsvRecord[] = (
      existsSync(dir) ? readdirSync(dir).filter((f) => /^[a-z0-9][\w-]*\.md$/i.test(f)) : []
    ).map((f) => {
      const { values, body } = readRecordFile(readFileSync(join(dir, f), "utf8"));
      const { submitted, status: _status, ...rest } = values;
      return {
        id: f.slice(0, -3),
        submitted: submitted instanceof Date ? submitted.toISOString() : String(submitted ?? ""),
        status: "test",
        fields: definition?.body ? { ...rest, [definition.body]: body.trim() } : rest,
      };
    });
    const rows = [...published, ...tests].sort((a, b) => b.submitted.localeCompare(a.submitted));
    const csv = recordsCsv(fields, rows);
    const fileName = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    // A check saves beside the website's own data instead of asking where.
    let target: string | undefined;
    if (env.background) target = join(projects.dataFor(current!.id), fileName);
    else {
      const answer = await dialog.showSaveDialog(dialogParent(), {
        title: "Save the records as CSV",
        defaultPath: join(app.getPath("downloads"), fileName),
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (answer.canceled || !answer.filePath) return null;
      target = answer.filePath;
    }
    writeFileSync(target, csv);
    return target;
  });
  ipc.handle("site:check", async () => {
    const { url, token } = site();
    try {
      await callSite(url, token, "ping");
      return { ok: true } as const;
    } catch (error) {
      if (error instanceof SiteUnavailable) return { ok: false, reason: error.reason, message: error.message } as const;
      throw error;
    }
  });
  ipc.handle("site:token", () => tokens.ensure(site() && current!.id));
  ipc.handle("site:new-token", () => tokens.create(site() && current!.id));
  // The media library (Q158, Q168) and the maker's image search (Q150).
  const mediaRoot = () => {
    if (!current) throw new Error("No project is open.");
    return current.path;
  };
  const datasourceLabel = (name: string) => {
    try {
      return contentSource().definition(name).definition?.label ?? titleOf(name);
    } catch {
      return titleOf(name);
    }
  };
  const smallCopies = new Map<string, string>();
  const smallCopy = async (bytes: Buffer, key?: string) => {
    if (key && smallCopies.has(key)) return smallCopies.get(key)!;
    const { default: sharp } = await import("sharp");
    const out = await sharp(bytes, { animated: false })
      .rotate()
      .resize({ width: 320, withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    const url = `data:image/webp;base64,${out.toString("base64")}`;
    if (key) smallCopies.set(key, url);
    return url;
  };
  ipc.handle("media:list", () => {
    if (!current) return [];
    const root = mediaRoot();
    const files = usingFiles(root);
    return libraryFiles(root).map((path): MediaItem => {
      const info = mediaInfo(diskSource(root), path);
      const uses = usesOf(path, files);
      return {
        path,
        name: path.slice("media/".length),
        size: statSync(join(root, path)).size,
        image: mediaKind(path) === "image",
        ...(info?.alt ? { alt: info.alt } : {}),
        ...(info?.credit ? { credit: info.credit } : {}),
        uses,
        usesLabel: usesLabel(uses, datasourceLabel),
      };
    });
  });
  ipc.handle("media:thumbnail", async (path) => {
    const root = mediaRoot();
    if (!/^media\/[\w][\w.-]*$/.test(path) || mediaKind(path) !== "image") return null;
    const abs = join(root, path);
    if (!existsSync(abs)) return null;
    if (path.toLowerCase().endsWith(".svg")) return `data:image/svg+xml;base64,${readFileSync(abs).toString("base64")}`;
    return smallCopy(readFileSync(abs), `${abs}:${statSync(abs).mtimeMs}`).catch(() => null);
  });
  ipc.handle("media:add-files", (paths) => editor.addMedia(paths));
  // "Replace…" in the preview (Q159): the app's own picker opens over the window, and answers.
  const picking = new Map<number, (path: string | null) => void>();
  let picks = 0;
  function pickImage(): Promise<string | null> {
    const id = ++picks;
    return new Promise((resolve) => {
      picking.set(id, resolve);
      ipc.emit("media:pick-request", { id });
    });
  }
  ipc.handle("media:picked", (id, path) => {
    picking.get(id)?.(typeof path === "string" ? path : null);
    picking.delete(id);
  });
  ipc.handle("media:choose-files", async () => {
    if (env.background) return null;
    const answer = await dialog.showOpenDialog(dialogParent(), { properties: ["openFile", "multiSelections"] });
    if (answer.canceled || !answer.filePaths.length) return null;
    return editor.addMedia(answer.filePaths);
  });
  ipc.handle("media:search", async (query) => {
    const result = await images.search(query, 12);
    const found = await Promise.all(
      result.images.map(async (image): Promise<MediaFound> => {
        const bytes = await images.preview(image);
        const thumb = bytes ? await smallCopy(bytes).catch(() => undefined) : undefined;
        return {
          id: image.id,
          title: image.title,
          width: image.width,
          height: image.height,
          credit: image.credit,
          ...(thumb ? { thumb } : {}),
        };
      }),
    );
    return { images: found, failed: result.failed };
  });
  ipc.handle("media:add-found", (id, alt) => editor.addFoundImage(images, id, alt));
  ipc.handle("media:set-alt", (path, alt) => editor.setMediaAlt(path, alt));
  ipc.handle("media:delete", (path) => {
    editor.deleteMedia(path, datasourceLabel);
  });
  ipc.handle("media:rename", (path, name) => ({ path: editor.renameMedia(path, name).path }));
  ipc.handle("gallery:add", (id) => {
    const route = preview.state().route;
    const file = route !== null ? preview.runtime?.resolve(route) : undefined;
    if (!file) throw new Error("Open a page first.");
    return editor.apply({ type: "insert", file, before: "auto", block: id });
  });
  ipc.handle("comments:list", () => (current ? comments.list(current.id) : []));
  ipc.handle("comments:send", () => sendComments());
  ipc.handle("comments:discard", () => void discardComments());
  ipc.handle("preview:page-menu", (route) => pageMenu(route));
  ipc.handle("preview:set-view", (view, route) => preview.setView(view === "pages" ? "pages" : "page", { route }));
  ipc.handle("preview:open-page", (route) => preview.openPage(route));
  ipc.handle("preview:set-mode", (mode) => preview.setMode(mode === "visitor" || mode === "comment" ? mode : "edit"));
  ipc.handle("agent:status", () => agent.status());
  ipc.handle("agent:sign-in", (method) => {
    if (!env.background) agent.signIn(method);
  });
  ipc.handle("agent:cancel-sign-in", () => agent.cancelSignIn());
  ipc.handle("agent:open-sign-in-page", () => {
    const url = auth.signInUrl;
    if (url?.startsWith("https://") && !env.background) void shell.openExternal(url);
  });
  ipc.handle("agent:set-api-key", (key) => {
    agent.setApiKey(key);
    return agent.status();
  });
  ipc.handle("agent:set-key", (account, key) => {
    if (account !== "openai" && account !== "gemini" && account !== "vertex") throw new Error("Unknown account.");
    agent.setKey(account, key);
    return agent.status();
  });
  ipc.handle("agent:set-vertex-gcloud", (project) => {
    agent.setVertexGcloud(project);
    return agent.status();
  });
  ipc.handle("agent:chatgpt-sign-in", () => {
    if (!env.background) agent.signInChatGPT();
  });
  ipc.handle("agent:chatgpt-cancel", () => agent.cancelChatGPT());
  ipc.handle("agent:chatgpt-sign-out", async () => {
    await agent.signOutChatGPT();
    return agent.status();
  });
  ipc.handle("agent:set-model", async (model) => {
    if (!current) throw new Error("No project is open.");
    const project = changed(projects.update(current.id, { model }));
    await agent.setModel(project, model);
    return project;
  });
  ipc.handle("agent:set-mode", async (mode) => {
    if (!current) throw new Error("No project is open.");
    if (mode !== "build" && mode !== "plan") throw new Error("Unknown mode.");
    const project = changed(projects.update(current.id, { mode }));
    await agent.setMode(project, mode);
    return project;
  });
  ipc.handle("agent:set-effort", async (effort) => {
    if (!current) throw new Error("No project is open.");
    if (!isEffort(effort)) throw new Error("Unknown effort level.");
    const project = changed(projects.update(current.id, { effort }));
    await agent.setEffort(project, effort);
    return project;
  });

  // For automated checks: the main process's objects, reachable from Playwright's evaluate().
  if (env.background)
    Object.assign(globalThis, {
      upstart: {
        win,
        projects,
        preview,
        agent,
        piAccounts,
        peek,
        tips,
        settings,
        pageItems,
        images,
        editor,
        templates,
        templateViewer,
        checks,
        replayed,
      },
    });

  await (devUrl ? win.loadURL(devUrl) : win.loadFile(join(here, "../renderer/index.html")));

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    agent.close();
    thumbnails.close();
  });
}

main().catch((error) => {
  console.error("[upstart] failed to start", error);
  app.exit(1);
});
