// Launches the built app for a check, in the background: the agent-app copy
// of Electron (no Dock icon, never activated), background mode on (the window
// is never shown), and a throwaway data folder and projects folder, so that a
// check never touches the maker's own.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { backgroundElectron, backgroundPackagedApp } from "../scripts/background-electron.ts";

const appDir = join(import.meta.dirname, "../apps/desktop");
export const runsDir = join(import.meta.dirname, ".runs");

export type LaunchedApp = {
  app: ElectronApplication;
  window: Page;
  dataDir: string;
  projectsDir: string;
  logs: string[];
  /** Saves a picture of the interface into e2e/.runs and returns its path. */
  capture(name: string): Promise<string>;
  close(): Promise<void>;
};

export type LaunchOptions = {
  env?: Record<string, string>;
  /** Launch the packaged app (apps/desktop/dist) instead of the development build. */
  packaged?: boolean;
};

export async function launchApp({ env = {}, packaged = false }: LaunchOptions = {}): Promise<LaunchedApp> {
  const scratch = mkdtempSync(join(tmpdir(), "upstart-e2e-"));
  const dataDir = join(scratch, "data");
  const projectsDir = join(scratch, "projects");
  mkdirSync(projectsDir, { recursive: true });
  const app = await _electron.launch({
    executablePath: packaged ? backgroundPackagedApp() : backgroundElectron(),
    args: packaged ? [] : [appDir],
    env: {
      ...cleanEnv(),
      UPSTART_BACKGROUND: "1",
      UPSTART_DATA_DIR: dataDir,
      UPSTART_PROJECTS_DIR: projectsDir,
      // The agent is played back from a recording unless a check asks for the real one ("").
      UPSTART_AGENT_REPLAY: join(import.meta.dirname, "fixtures/bakery.jsonl"),
      ...env,
    },
  });
  const logs: string[] = [];
  app.process().stdout?.on("data", (d) => logs.push(String(d)));
  app.process().stderr?.on("data", (d) => logs.push(String(d)));
  const window = await interfacePage(app);
  await window.waitForLoadState("domcontentloaded");
  return {
    app,
    window,
    dataDir,
    projectsDir,
    logs,
    async capture(name) {
      mkdirSync(runsDir, { recursive: true });
      const file = join(runsDir, `${name}.png`);
      writeFileSync(file, await window.screenshot());
      return file;
    },
    async close() {
      await app.close();
      rmSync(scratch, { recursive: true, force: true });
    },
  };
}

/** The interface's page: Playwright also lists the preview's view as a window. */
async function interfacePage(app: ElectronApplication): Promise<Page> {
  const started = Date.now();
  for (;;) {
    const found = app.windows().find((page) => /renderer\/index\.html|^http:\/\/localhost/.test(page.url()));
    if (found) return found;
    if (Date.now() - started > 20_000)
      throw new Error(`no interface window among: ${app.windows().map((p) => p.url())}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Opens the settings panel over the window (Q123) from the sidebar's button. */
export async function openSettings(window: Page): Promise<Page> {
  await window.getByTestId("open-settings").click();
  await window.getByTestId("settings").waitFor();
  return window;
}

function cleanEnv() {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith("ELECTRON_") && !key.startsWith("VITEST")) env[key] = value;
  }
  return env;
}

/**
 * Watches, on macOS, which app is in front while a check runs, and how macOS
 * classes the app under test. `stop()` returns every distinct observation.
 */
export function watchFront() {
  const seen = new Set<string>();
  const read = () => {
    try {
      const front = execFileSync("lsappinfo", ["front"], { encoding: "utf8" }).trim();
      const name = execFileSync("lsappinfo", ["info", "-only", "name", front], { encoding: "utf8" });
      const match = /"(?:LSDisplayName|name)"="([^"]*)"/.exec(name) ?? /^"([^"]*)"/m.exec(name);
      seen.add(`front:${match?.[1] ?? name.trim()}`);
      const ours = execFileSync("lsappinfo", ["info", "-only", "applicationtype", "Electron"], { encoding: "utf8" });
      const type = /type="(\w+)"/.exec(ours)?.[1];
      if (type) seen.add(`electron:${type}`);
    } catch {
      // lsappinfo can fail for an instant while apps start or quit.
    }
  };
  read();
  const timer = setInterval(read, 50);
  return {
    stop() {
      clearInterval(timer);
      read();
      return [...seen];
    },
  };
}
