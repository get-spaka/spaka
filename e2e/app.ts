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

/** How much longer every wait is on CI's runners, much slower than a maker's computer. */
export const SLOW = process.env.CI ? 3 : 1;

/** Whether the app shows macOS's shortcuts (⌘) or the others' (Ctrl). */
export const MAC = process.platform === "darwin";

/** Whether the window can be photographed: on Windows' CI runners the hidden window never draws, so a picture waits forever. */
export const PICTURES = !(process.env.CI && process.platform === "win32");

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
  /**
   * The interface follows the appearance setting (Q330) rather than Playwright's
   * light prefers-color-scheme, which the other checks keep so that their pictures
   * do not depend on macOS's appearance.
   */
  followAppearance?: boolean;
  /**
   * The tour opens by itself, as for a new maker (Q328); the other checks start
   * with it seen, so that it covers nothing they look at.
   */
  tour?: boolean;
};

export async function launchApp({
  env = {},
  packaged = false,
  followAppearance = false,
  tour = false,
}: LaunchOptions = {}): Promise<LaunchedApp> {
  const scratch = mkdtempSync(join(tmpdir(), "upstart-e2e-"));
  const dataDir = join(scratch, "data");
  const projectsDir = join(scratch, "projects");
  mkdirSync(projectsDir, { recursive: true });
  if (!tour) {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ tourSeen: true }));
  }
  const app = await _electron.launch({
    executablePath: packaged ? backgroundPackagedApp() : backgroundElectron(),
    args: packaged ? [] : [appDir],
    ...(followAppearance ? { colorScheme: null } : {}),
    env: {
      ...cleanEnv(),
      UPSTART_BACKGROUND: "1",
      // On Windows a window never shown draws nothing: on CI's runners, where nobody works, it is shown without the focus.
      ...(process.env.CI && process.platform === "win32" ? { UPSTART_SHOW_INACTIVE: "1" } : {}),
      UPSTART_DATA_DIR: dataDir,
      UPSTART_PROJECTS_DIR: projectsDir,
      // The agent is played back from a recording unless a check asks for the real one ("").
      UPSTART_AGENT_REPLAY: join(import.meta.dirname, "fixtures/bakery.jsonl"),
      // A packaged app sends its statistics to Aptabase: a check's go to a log instead.
      UPSTART_STATS_LOG: join(scratch, "stats.jsonl"),
      ...env,
    },
  });
  const logs: string[] = [];
  app.process().stdout?.on("data", (d) => logs.push(String(d)));
  app.process().stderr?.on("data", (d) => logs.push(String(d)));
  const window = await interfacePage(app);
  window.setDefaultTimeout(30_000 * SLOW);
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
      if (PICTURES) writeFileSync(file, await window.screenshot());
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

/** The apps macOS knows by the name Electron: their process and how it classes them. */
function electronApps(): { pid: string; type: string }[] {
  const list = execFileSync("lsappinfo", ["list"], { encoding: "utf8" });
  return list
    .split(/^\s*\d+\) /m)
    .filter((block) => block.startsWith('"Electron"'))
    .flatMap((block) => {
      const m = /pid = (\d+) [^\n]*type="(\w+)"/.exec(block);
      return m ? [{ pid: m[1]!, type: m[2]! }] : [];
    });
}

/**
 * Watches, on macOS, which app is in front while a check runs, and how macOS
 * classes the app under test: an Electron app started after the watch, not
 * one already running (the development run, `pnpm dev:live`).
 * `stop()` returns every distinct observation.
 */
export function watchFront() {
  const seen = new Set<string>();
  let already: Set<string> | undefined;
  try {
    already = new Set(electronApps().map((a) => a.pid));
  } catch {
    already = new Set();
  }
  const read = () => {
    try {
      const front = execFileSync("lsappinfo", ["front"], { encoding: "utf8" }).trim();
      const name = execFileSync("lsappinfo", ["info", "-only", "name", front], { encoding: "utf8" });
      const match = /"(?:LSDisplayName|name)"="([^"]*)"/.exec(name) ?? /^"([^"]*)"/m.exec(name);
      seen.add(`front:${match?.[1] ?? name.trim()}`);
      for (const app of electronApps()) if (!already?.has(app.pid)) seen.add(`electron:${app.type}`);
    } catch {
      // lsappinfo can fail for an instant while apps start or quit.
    }
  };
  // lsappinfo is macOS's own: elsewhere nothing is watched.
  if (process.platform !== "darwin") return { stop: () => [...seen] };
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
