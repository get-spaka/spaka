// Entry point of the app's main process.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog } from "electron";
import type { ProjectInfo } from "../shared/ipc";
import { readEnvironment } from "./environment";
import { createIpc } from "./ipc";
import { Preview } from "./preview/preview";
import { Projects } from "./projects";

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

  const opened = async (project: ProjectInfo) => {
    await preview.open(project);
    ipc.emit("project:opened", project);
    ipc.emit("projects:changed", projects.list());
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
  ipc.handle("projects:current", () => preview.project ?? null);
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

  // For automated checks: the main process's objects, reachable from Playwright's evaluate().
  if (env.background) Object.assign(globalThis, { upstart: { win, projects, preview } });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) await win.loadURL(devUrl);
  else await win.loadFile(join(here, "../renderer/index.html"));

  app.on("window-all-closed", () => app.quit());
}

main().catch((error) => {
  console.error("[upstart] failed to start", error);
  app.exit(1);
});
