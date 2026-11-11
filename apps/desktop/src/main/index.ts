// Entry point of the app's main process.
import { existsSync, type FSWatcher, mkdirSync, readFileSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { app, BrowserWindow, dialog, safeStorage, shell } from "electron";
import type { ConnectorInfo, HistoryEntry, PageComment, ProjectInfo } from "../shared/ipc";
import { en as t } from "../shared/strings/en";
import { Agent, projectNameFrom } from "./agent/agent";
import { AgentAuth } from "./agent/auth";
import { agentBinary, cleanEnv, nodeLauncher } from "./agent/confinement";
import { FIND_BLOCKS_TOOL, LOOK_TOOL, UPSTART_SERVER, upstartServer } from "./agent/preview-tool";
import { Recorder, replayQuery } from "./agent/replay";
import { Connectors, type Vault } from "./connectors/connectors";
import { Comments, commentsMessage } from "./editing/comments";
import { Editor } from "./editing/editor";
import { AgentNotes } from "./editing/notes";
import { readEnvironment } from "./environment";
import { exportProject } from "./export";
import { described, Gallery } from "./gallery/catalogue";
import { BlockIndex } from "./gallery/search";
import { Thumbnails } from "./gallery/thumbnails";
import { History } from "./history/history";
import { createIpc } from "./ipc";
import { FileTap } from "./live/tap";
import { Preview } from "./preview/preview";
import { isEffort, Projects } from "./projects";
import { Skills } from "./skills/skills";
import { Fonts } from "./theme/fonts";
import { readTheme, writeTheme } from "./theme/theme-file";

const here = fileURLToPath(new URL(".", import.meta.url));
const env = readEnvironment();

if (env.dataDir) app.setPath("userData", env.dataDir);

if (env.background) {
  app.dock?.hide();
  // Chromium stops drawing, and slows the timers of, a window that is not
  // displayed. A check in the background needs the app to behave as if it were.
  app.commandLine.appendSwitch("disable-features", "MacWebContentsOcclusion,CalculateNativeWinOcclusion");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
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
  await app.whenReady();

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: "Upstart",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#fafafa",
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
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("[upstart] interface process gone:", details.reason);
  });
  if (!env.background) win.once("ready-to-show", () => win.show());

  const ipc = createIpc(win);
  const projects = new Projects(app.getPath("userData"), env.projectsDir);
  // The gallery's blocks (Q92), shipped beside the app like its skills.
  const gallery = new Gallery(app.isPackaged ? join(process.resourcesPath, "gallery") : join(here, "../../gallery"));
  let index: BlockIndex | undefined;
  const blockIndex = () => {
    index ??= new BlockIndex(gallery.list());
    return index;
  };
  // The open fonts the Theme tab offers (Q93), shipped the same way.
  const fonts = new Fonts(app.isPackaged ? join(process.resourcesPath, "fonts") : join(here, "../../fonts"));
  const preview = new Preview(win, {
    block: (id) => gallery.get(id)?.source,
    font: (path) => fonts.path(path),
    background: env.background,
    onState: (state) => ipc.emit("preview:state", state),
    invokes: {
      "preview:edit": (action) => editor.apply(action),
      "preview:edit-info": (file, at) => editor.info(file, at),
      "preview:comment-save": (comment) => commentsChanged(current && comments.save(current.id, comment)),
      "preview:comment-remove": (id) => commentsChanged(current && comments.remove(current.id, id)),
      "preview:comments-send": () => sendComments(),
      "preview:comments-discard": () => void discardComments(),
    },
  });
  await preview.start();

  // The agent (ADR 0002, 0007, 0010). Its configuration, sign-in and
  // conversations live in the app's data, never in the maker's own Claude folder.
  const userData = app.getPath("userData");
  const binary = agentBinary();
  const launcher = nodeLauncher(userData);
  const agentEnv = () => {
    const base = cleanEnv();
    return {
      ...base,
      PATH: [launcher.binDir, base.PATH].filter(Boolean).join(":"),
      CLAUDE_CONFIG_DIR: env.agentConfigDir ?? join(userData, "agent"),
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
  let agent: Agent;
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
      extraOptions: () => ({
        mcpServers: {
          [UPSTART_SERVER]: upstartServer(
            () => preview.look(),
            (query, kind) => blockIndex().find(query, { kind }),
          ),
        },
        allowedTools: [LOOK_TOOL, FIND_BLOCKS_TOOL],
      }),
      connectors: [UPSTART_SERVER],
      skills,
      connectorServers: connectors,
      query: (env.agentReplay ? replayQuery(env.agentReplay, env.agentReplaySpeed) : query) as never,
      recorder: env.agentRecord ? new Recorder(env.agentRecord) : undefined,
    },
    dataFor: (id) => projects.dataFor(id),
    emitConversation: (projectId, event) => {
      ipc.emit("conversation:event", { projectId, event });
      // Editing by hand waits while the agent works on the project shown (Q91).
      if (projectId === current?.id && (event.type === "turn-start" || event.type === "turn-end"))
        preview.setPaused(event.type === "turn-start");
      // A version of the project after each turn of the agent (decisions: history).
      if (event.type === "turn-end" && history?.projectId === projectId) {
        history.store.snapshot("turn", history.lastMessage ?? "");
        emitHistory();
      }
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
    block: (id) => gallery.get(id),
    busy: () => !!current && agent.isWorking(current.id),
    before: () => history?.store.snapshot("outside", ""),
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
    if (history) ipc.emit("history:changed", { projectId: history.projectId, entries: historyEntries() });
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

  let current: ProjectInfo | undefined;
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
    current = project;
    watchSkills(project);
    agent.open(project);
    preview.setPaused(agent.isWorking(project.id));
    await preview.open(project);
    commentsChanged(comments.list(project.id));
    tap = tapFor(project);
    history = { projectId: project.id, store: new History(projects.dataFor(project.id), project.path) };
    history.store.snapshot("start", "");
    emitHistory();
    ipc.emit("project:opened", project);
    ipc.emit("projects:changed", projects.list());
    return project;
  };
  const changed = (project: ProjectInfo) => {
    current = project;
    ipc.emit("project:opened", project);
    return project;
  };

  ipc.handle("app:info", () => ({
    version: app.getVersion(),
    platform: process.platform,
    background: env.background,
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
  ipc.handle("projects:close", () => {
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
    const answer = await dialog.showOpenDialog(win, {
      title: "Open a website folder",
      properties: ["openDirectory", "createDirectory"],
    });
    const folder = answer.filePaths[0];
    return answer.canceled || !folder ? null : opened(projects.openFolder(folder));
  });
  ipc.handle("preview:navigate", (route) => preview.navigate(route, true));
  ipc.handle("preview:reload", () => preview.reload());
  ipc.on("preview:bounds", (rect) => preview.setBounds(rect));

  ipc.handle("conversation:get", () =>
    current ? { projectId: current.id, items: agent.conversation(current.id) } : null,
  );
  ipc.handle("conversation:send", async (text, settings) => {
    const message = text.trim();
    if (!message) return;
    // A first message without a project creates one (decisions: built at once
    // from it, with the model and effort the maker picked beforehand).
    let project = current;
    if (!project) {
      const created = projects.create(projectNameFrom(message));
      const model = typeof settings?.model === "string" ? settings.model : created.model;
      const effort = isEffort(settings?.effort) ? settings.effort : created.effort;
      project = await opened(projects.update(created.id, { model, effort }));
    }
    sendMessage(project, message, message);
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
  }
  ipc.handle("conversation:stop", () => current && agent.stop(current.id));
  ipc.handle("conversation:start-over", () => current && agent.startOver(current));
  // The static export (decisions): into a folder the maker picks, remembered per project on this machine.
  const lastExportFile = () => current && join(projects.dataFor(current.id), "export.json");
  ipc.handle("export:last", () => {
    const file = lastExportFile();
    try {
      return file ? (JSON.parse(readFileSync(file, "utf8")).folder ?? null) : null;
    } catch {
      return null;
    }
  });
  ipc.handle("export:choose-folder", async () => {
    if (env.background) return null;
    const answer = await dialog.showOpenDialog(win, {
      title: "Export the website into a folder",
      properties: ["openDirectory", "createDirectory"],
    });
    return answer.canceled ? null : (answer.filePaths[0] ?? null);
  });
  ipc.handle("export:run", async (folder) => {
    if (!current) throw new Error("No project is open.");
    if (agent.isWorking(current.id)) throw new Error("The agent is working: export once it is done.");
    const result = await exportProject(current.path, folder);
    writeFileSync(lastExportFile()!, JSON.stringify({ folder: result.folder }));
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
    const answer = await dialog.showOpenDialog(win, {
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
  ipc.handle("history:list", () => historyEntries());
  ipc.handle("history:restore", (id) => goBack(id));
  ipc.handle("history:undo", () => goBack(history?.store.undoTarget()?.id));
  ipc.handle("editing:apply", (action) => editor.apply(action));
  const thumbnails = new Thumbnails(join(userData, "gallery-thumbnails"), () => preview.origin);
  // Its hidden window must not keep the app open once the maker's window is closed.
  win.on("closed", () => thumbnails.close());
  ipc.handle("gallery:list", () => gallery.list().map(described));
  ipc.handle("gallery:thumbnail", (id) => {
    const block = gallery.get(id);
    const theme = preview.runtime?.theme();
    if (!block || theme === undefined) throw new Error("No such block, or no project open.");
    return thumbnails.get(id, block.source, theme);
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
  ipc.handle("theme:get", () => ({
    values: readTheme(preview.runtime?.theme() ?? "") as Record<string, string>,
    fonts: fonts.list(),
  }));
  ipc.handle("theme:show", (values) => preview.showTheme(themed(values, "/__up/fonts").css));
  ipc.handle("theme:apply", (values) => {
    const { css, ids } = themed(values);
    return editor.writeTheme(css, fonts.files(ids));
  });
  ipc.handle("gallery:add", (id) => {
    const route = preview.state().route;
    const file = route !== null ? preview.runtime?.resolve(route) : undefined;
    if (!file) throw new Error("Open a page first.");
    return editor.apply({ type: "insert", file, before: "auto", block: id });
  });
  ipc.handle("comments:list", () => (current ? comments.list(current.id) : []));
  ipc.handle("comments:send", () => sendComments());
  ipc.handle("comments:discard", () => void discardComments());
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
  ipc.handle("agent:set-model", async (model) => {
    if (!current) throw new Error("No project is open.");
    const project = changed(projects.update(current.id, { model }));
    await agent.setModel(project, model);
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
  if (env.background) Object.assign(globalThis, { upstart: { win, projects, preview, agent } });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) await win.loadURL(devUrl);
  else await win.loadFile(join(here, "../renderer/index.html"));

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
