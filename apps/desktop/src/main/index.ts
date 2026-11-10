// Entry point of the app's main process.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { app, BrowserWindow, dialog, safeStorage, shell } from "electron";
import type { ProjectInfo } from "../shared/ipc";
import { Agent, projectNameFrom } from "./agent/agent";
import { AgentAuth } from "./agent/auth";
import { agentBinary, cleanEnv, nodeLauncher } from "./agent/confinement";
import { Recorder, replayQuery } from "./agent/replay";
import { readEnvironment } from "./environment";
import { createIpc } from "./ipc";
import { Preview } from "./preview/preview";
import { isEffort, Projects } from "./projects";

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
  const preview = new Preview(win, {
    background: env.background,
    onState: (state) => ipc.emit("preview:state", state),
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
  let agent: Agent;
  const auth = new AgentAuth({
    binary,
    env: agentEnv,
    keyFile: join(userData, "api-key.bin"),
    vault: {
      encrypt: (text) => safeStorage.encryptString(text),
      decrypt: (data) => safeStorage.decryptString(data),
    },
    onChange: () => void agent.signInChanged(),
  });
  agent = new Agent({
    auth,
    session: {
      binary,
      readable: launcher.readable,
      query: (env.agentReplay ? replayQuery(env.agentReplay, 4) : query) as never,
      recorder: env.agentRecord ? new Recorder(env.agentRecord) : undefined,
    },
    dataFor: (id) => projects.dataFor(id),
    emitConversation: (projectId, event) => ipc.emit("conversation:event", { projectId, event }),
    emitStatus: (status) => ipc.emit("agent:status", status),
  });
  if (!env.agentReplay) void agent.checkSignIn();

  let current: ProjectInfo | undefined;
  const opened = async (project: ProjectInfo) => {
    current = project;
    agent.open(project);
    await preview.open(project);
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
    agent.open(undefined);
    preview.close();
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
  ipc.handle("preview:navigate", (route) => preview.navigate(route));
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
    agent.send(project, message);
  });
  ipc.handle("conversation:stop", () => current && agent.stop(current.id));
  ipc.handle("conversation:start-over", () => current && agent.startOver(current));
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
  app.on("before-quit", () => agent.close());
}

main().catch((error) => {
  console.error("[upstart] failed to start", error);
  app.exit(1);
});
