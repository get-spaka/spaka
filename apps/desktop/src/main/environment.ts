// How this run of the app was started. Read once, before the app is ready.
import { homedir } from "node:os";
import { join } from "node:path";

export type Environment = {
  /**
   * Background mode, for automated checks: the window is never shown, the app
   * has no Dock icon and never takes the keyboard focus. Launch it with the
   * agent-app copy of Electron (scripts/background-electron.ts) so that macOS
   * never activates it, even for the instant before the Dock icon is hidden.
   */
  background: boolean;
  /** Where the app keeps its own data. Overridden by checks, to stay away from the maker's. */
  dataDir: string | undefined;
  /** Where new projects are created. */
  projectsDir: string;
};

export function readEnvironment(env: NodeJS.ProcessEnv = process.env): Environment {
  return {
    background: env.UPSTART_BACKGROUND === "1",
    dataDir: env.UPSTART_DATA_DIR || undefined,
    projectsDir: env.UPSTART_PROJECTS_DIR || join(homedir(), "Documents", "Upstart"),
  };
}
