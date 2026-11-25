// The app updates itself (Q367): it checks the editor's GitHub releases at
// launch and every few hours, downloads a new version without asking, then
// the sidebar's foot says "Update ready — Restart" (Q378); otherwise the
// update installs when the app quits. Only a packaged app run by a maker
// checks: never a development run nor a check in the background.

import type { UpdateState } from "../shared/ipc";

/** What Spaka uses of electron-updater's autoUpdater. */
export type Updater = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: "update-available" | "update-downloaded", fn: (info: { version: string }) => void): unknown;
  on(event: "update-not-available", fn: () => void): unknown;
  on(event: "error", fn: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
};

/** Every four hours, once the launch's check is done. */
export const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

export class Updates {
  private current: UpdateState = { state: "idle" };
  private started = false;

  constructor(
    private readonly deps: {
      updater: Updater;
      /** A packaged app, not in the background. */
      enabled: boolean;
      emit: (state: UpdateState) => void;
      log?: (message: string) => void;
      every?: number;
      setInterval?: (fn: () => void, ms: number) => unknown;
    },
  ) {}

  start() {
    if (!this.deps.enabled || this.started) return;
    this.started = true;
    const { updater } = this.deps;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.on("update-available", (info) => this.set({ state: "downloading", version: info.version }));
    updater.on("update-downloaded", (info) => this.set({ state: "ready", version: info.version }));
    updater.on("update-not-available", () => {
      if (this.current.state !== "ready") this.set({ state: "idle" });
    });
    updater.on("error", (error) => {
      // Offline, or GitHub unreachable: say nothing, the next check tries again.
      this.deps.log?.(`[spaka] update check failed: ${error.message}`);
      if (this.current.state !== "ready") this.set({ state: "idle" });
    });
    this.check();
    (this.deps.setInterval ?? setInterval)(() => this.check(), this.deps.every ?? CHECK_EVERY_MS);
  }

  state(): UpdateState {
    return this.current;
  }

  /** "Restart": quits and opens the new version. */
  restart() {
    if (this.current.state === "ready") this.deps.updater.quitAndInstall();
  }

  private check() {
    // A downloaded update waits for the restart; nothing more to check.
    if (this.current.state === "ready" || this.current.state === "downloading") return;
    this.deps.updater.checkForUpdates().catch(() => {
      // Reported through the "error" event.
    });
  }

  private set(state: UpdateState) {
    this.current = state;
    this.deps.emit(state);
  }
}

/**
 * Whether this launch is the first of a new version, from the version the
 * last launch wrote: an update was installed (statistics, Q331).
 */
export function updatedSince(previous: string | undefined, version: string): boolean {
  return previous !== undefined && previous !== version;
}
