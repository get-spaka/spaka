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
  /**
   * The window shown without taking the focus: the development run restarts
   * the app at each change of the main process, behind what the maker is doing.
   */
  showInactive: boolean;
  /** Where the app keeps its own data. Overridden by checks, to stay away from the maker's. */
  dataDir: string | undefined;
  /** Where new projects are created. */
  projectsDir: string;
  /**
   * The agent's configuration folder (its sign-in and conversations), when not
   * the one in the app's data: checks with the real agent share one folder
   * signed in once, while their app data stays temporary.
   */
  agentConfigDir: string | undefined;
  /** A recorded agent stream to play back instead of running the agent. */
  agentReplay: string | undefined;
  /** How much faster than recorded a playback runs. */
  agentReplaySpeed: number;
  /** A folder of made-up images the image search answers with, for the checks. */
  imagesFixture: string | undefined;
  /** Where to record the agent's stream, to play it back in later checks. */
  agentRecord: string | undefined;
  /** Recorded replies of a model of Upstart's own harness, played back instead of asking it (pi/replay.ts). */
  piReplay: string | undefined;
  /** Where to record the replies of the harness's models. */
  piRecord: string | undefined;
  /**
   * Where Upstart's templates are released (Q250): the app then reads their
   * catalogue and downloads them, as a packaged app does from the public
   * repository's releases; unset in development, where they are read from the
   * repository's folder.
   */
  templatesUrl: string | undefined;
  /** The catalogue and pictures shipped with the app, when not its own: checks start with none. */
  templatesSnapshot: string | undefined;
};

export function readEnvironment(env: NodeJS.ProcessEnv = process.env): Environment {
  return {
    background: env.UPSTART_BACKGROUND === "1",
    showInactive: env.UPSTART_SHOW_INACTIVE === "1",
    dataDir: env.UPSTART_DATA_DIR || undefined,
    projectsDir: env.UPSTART_PROJECTS_DIR || join(homedir(), "Documents", "Upstart"),
    agentConfigDir: env.UPSTART_AGENT_CONFIG_DIR || undefined,
    agentReplay: env.UPSTART_AGENT_REPLAY || undefined,
    agentReplaySpeed: Number(env.UPSTART_AGENT_REPLAY_SPEED) || 4,
    imagesFixture: env.UPSTART_IMAGES_FIXTURE || undefined,
    agentRecord: env.UPSTART_AGENT_RECORD || undefined,
    piReplay: env.UPSTART_PI_REPLAY || undefined,
    piRecord: env.UPSTART_PI_RECORD || undefined,
    templatesUrl: env.UPSTART_TEMPLATES_URL || undefined,
    templatesSnapshot: env.UPSTART_TEMPLATES_SNAPSHOT || undefined,
  };
}
