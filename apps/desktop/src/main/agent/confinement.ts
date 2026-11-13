// What the agent may do and see (ADR 0007, ADR 0010): it starts with nothing
// of the maker's own Claude installation, writes only in the project and the
// system's temporary folder, has a shell inside the operating system's
// sandbox, which confines it on its own (Q221), and is never allowed to ask the maker.
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";

export const systemTmp = realpathSync(tmpdir());

/**
 * The app's environment without anything that belongs to the session that
 * launched it: every CLAUDE_* and ANTHROPIC_* variable is dropped, so the
 * agent behaves the same whether Upstart was started from the Dock or from a
 * terminal running Claude. Values are never read, only names.
 */
export function cleanEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || /^(ANTHROPIC_|CLAUDE_|CLAUDECODE$|ELECTRON_|UPSTART_)/.test(name)) continue;
    out[name] = value;
  }
  return out;
}

export type ConfinementInput = {
  projectDir: string;
  /** Folders the sandboxed shell may read although they are in a denied place (the `node` launcher, the app). */
  readable: string[];
  /** The assembled skills (ADR 0010): readable by the agent and its shell, never written. */
  skillsDir?: string;
  platform?: NodeJS.Platform;
};

/** The agent's options that confine it. */
export function confinement({ projectDir, readable, skillsDir, platform = process.platform }: ConfinementInput) {
  const skills = skillsDir ? [skillsDir] : [];
  return {
    cwd: projectDir,
    // The skills' folder is a working directory so that the agent can read the
    // files a skill refers to; a deny rule below keeps it from writing there.
    additionalDirectories: [systemTmp, ...skills],
    // Files in the project and the temporary folder written without asking;
    // sandboxed shell commands allowed by the sandbox setting below (Q221).
    // Elsewhere auto mode's classifier stays, the only guard on unconfined commands.
    permissionMode: SANDBOX_HOLDS.includes(platform) ? ("acceptEdits" as const) : ("auto" as const),
    // No user, project or local settings: nothing of the maker's own setup.
    settingSources: [] as [],
    // Only the connectors the app passes.
    strictMcpConfig: true,
    settings: {
      // Without these the agent inherits the connectors, skills and plugins
      // of the maker's claude.ai account (live-generation spike).
      disableClaudeAiConnectors: true,
      syncClaudeAiSkills: false,
      syncClaudeAiPlugins: false,
      // The binary's memory is keyed by the enclosing git repository.
      autoMemoryEnabled: false,
      permissions: {
        blockWritesOutsideWorkingDirectories: true,
        blockReadsOutsideWorkingDirectories: true,
        denyInsteadOfPrompting: true,
        deny: skills.map((dir) => `Edit(/${dir}/**)`),
      },
      sandbox: {
        enabled: true,
        failIfUnavailable: true,
        autoAllowBashIfSandboxed: true,
        allowUnsandboxedCommands: false,
        filesystem: {
          allowWrite: [systemTmp],
          denyRead: ["/Users", "/Volumes"],
          allowRead: [projectDir, ...readable, ...skills],
          denyWrite: skills,
        },
        network: { allowedDomains: ["*"] },
      },
    },
  };
}

/** Where the sandbox was shown to confine the agent on its own (Q221): auto mode is off there. */
const SANDBOX_HOLDS: NodeJS.Platform[] = ["darwin"];

/**
 * What Upstart grants itself when the agent tool would ask (Q220, Q221): with
 * auto mode off, a shell command run in the operating system's sandbox, which
 * confines it to the project and the temporary folder whatever it does (the
 * tool asks for a cd joined to a write, or an rm among several commands,
 * because it cannot tell statically where they write); a connector's tool or
 * Upstart's own; a skill. A file tool asks only to write outside the project,
 * and is refused, like anything else (ADR 0007).
 */
export function grantedInSandbox(toolName: string, input: unknown, platform = process.platform): boolean {
  // Where the sandbox is not known to hold, auto mode stays, and nothing is granted.
  if (!SANDBOX_HOLDS.includes(platform)) return false;
  if (toolName.startsWith("mcp__") || toolName === "Skill") return true;
  if (toolName !== "Bash" || !input || typeof input !== "object") return false;
  const { command, dangerouslyDisableSandbox } = input as { command?: unknown; dangerouslyDisableSandbox?: unknown };
  return typeof command === "string" && !dangerouslyDisableSandbox;
}

/** The official agent binary, from the SDK's package for this platform (ADR 0002). */
export function agentBinary(): string {
  const appRequire = createRequire(import.meta.url);
  const sdkRequire = createRequire(appRequire.resolve("@anthropic-ai/claude-agent-sdk"));
  const resolved = sdkRequire.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude`);
  // Inside a packaged app the binary sits outside the archive, to be executable.
  return resolved.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`);
}

/**
 * A `node` command for the agent's shell: the app's own executable, run as
 * Node. Returns the folder to put first on the agent's PATH, and the folders
 * the sandbox must let it read.
 */
export function nodeLauncher(dataDir: string): { binDir: string; readable: string[] } {
  const binDir = join(dataDir, "bin");
  mkdirSync(binDir, { recursive: true });
  const launcher = join(binDir, "node");
  writeFileSync(launcher, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${JSON.stringify(process.execPath)} "$@"\n`);
  chmodSync(launcher, 0o755);
  // The whole app bundle (Electron loads its frameworks from there).
  const bundle =
    process.platform === "darwin"
      ? process.execPath.replace(/\/Contents\/MacOS\/[^/]+$/, "")
      : dirname(process.execPath);
  return { binDir, readable: [binDir, bundle] };
}
