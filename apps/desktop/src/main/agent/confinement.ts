// What the agent may do and see (ADR 0007, ADR 0010): it starts with nothing
// of the maker's own Claude installation, writes only in the project and the
// system's temporary folder, has a shell inside the operating system's
// sandbox, which confines it on its own (Q221), and never asks the maker for permissions:
// it only asks its questions (Q283).
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";

export const systemTmp = realpathSync(tmpdir());

/**
 * The app's environment without anything that belongs to the session that
 * launched it: every CLAUDE_* and ANTHROPIC_* variable is dropped, so the
 * agent behaves the same whether Spaka was started from the Dock or from a
 * terminal running Claude. Values are never read, only names.
 */
export function cleanEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || /^(ANTHROPIC_|CLAUDE_|CLAUDECODE$|ELECTRON_|SPAKA_)/.test(name)) continue;
    out[name] = value;
  }
  return out;
}

/**
 * The environment with `dir` first on its search path, under one key: Windows
 * names it `Path` and reads it whatever its case, so a second `PATH` beside
 * it would leave the agent with two.
 */
export function withPathFirst(
  env: Record<string, string>,
  dir: string,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const out = { ...env };
  const keys = Object.keys(out).filter((k) => (platform === "win32" ? k.toUpperCase() === "PATH" : k === "PATH"));
  const key = keys[0] ?? "PATH";
  const rest = keys.map((k) => out[k]).filter(Boolean);
  for (const k of keys) delete out[k];
  out[key] = [dir, ...rest].join(platform === "win32" ? ";" : ":");
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

/**
 * A folder as the binary's permission rules write an absolute path: `//` then
 * the path with forward slashes, a Windows drive as its letter
 * (`C:\Users\x` is `//c/Users/x`).
 */
export function ruleDir(dir: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== "win32") return `/${dir}`;
  const posix = dir.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);
  return `/${posix}`;
}

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
      // A question waits for the maker as long as it takes (Q283).
      dialogExpiry: "never" as const,
      // Plan mode (Q286) asks canUseTool rather than auto mode's classifier.
      useAutoModeDuringPlan: false,
      permissions: {
        blockWritesOutsideWorkingDirectories: true,
        blockReadsOutsideWorkingDirectories: true,
        // No denyInsteadOfPrompting: it takes AskUserQuestion away from the
        // agent (agent-questions plan, slice 1). What it would ask for reaches
        // canUseTool, which refuses all but the agent's questions (ADR 0007).
        // Reading the web, granted rather than asked for (Q257): the maker is never asked (ADR 0007).
        allow: ["WebSearch", "WebFetch"],
        deny: skills.map((dir) => `Edit(${ruleDir(dir, platform)}/**)`),
      },
      // Native Windows has no sandbox for the binary's shell (ADR 0007): auto mode is its guard there.
      sandbox: SANDBOX_HOLDS.includes(platform) ? sandboxFor(projectDir, readable, skills) : { enabled: false },
    },
  };
}

function sandboxFor(projectDir: string, readable: string[], skills: string[]) {
  return {
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
  };
}

/** Where the sandbox was shown to confine the agent on its own (Q221): auto mode is off there. */
const SANDBOX_HOLDS: NodeJS.Platform[] = ["darwin"];

/**
 * What Spaka grants itself when the agent tool would ask (Q220, Q221): with
 * auto mode off, a shell command run in the operating system's sandbox, which
 * confines it to the project and the temporary folder whatever it does (the
 * tool asks for a cd joined to a write, or an rm among several commands,
 * because it cannot tell statically where they write); a connector's tool or
 * Spaka's own; a skill. A file tool asks only to write outside the project,
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
  const file = process.platform === "win32" ? "claude.exe" : "claude";
  const resolved = sdkRequire.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/${file}`);
  // Inside a packaged app the binary sits outside the archive, to be executable.
  return resolved.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`);
}

/**
 * A `node` command for the agent's shell: the app's own executable, run as
 * Node. Returns the folder to put first on the agent's PATH, and the folders
 * the sandbox must let it read.
 */
export function nodeLauncher(
  dataDir: string,
  platform = process.platform,
  executable = process.execPath,
): { binDir: string; readable: string[] } {
  const binDir = join(dataDir, "bin");
  mkdirSync(binDir, { recursive: true });
  // The executable's real path: macOS's sandbox refuses to run one through a
  // symbolic link that sits in a denied place, as pnpm's links in a checkout do.
  const app = realOrSame(executable);
  const launcher = join(binDir, "node");
  // A shell script for bash, Git Bash's included on Windows.
  writeFileSync(launcher, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${JSON.stringify(app)} "$@"\n`);
  chmodSync(launcher, 0o755);
  // And, on Windows, for what runs `node` through cmd (npx and the like).
  if (platform === "win32")
    writeFileSync(join(binDir, "node.cmd"), `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${app}" %*\r\n`);
  // The whole app bundle (Electron loads its frameworks from there).
  const bundle = platform === "darwin" ? app.replace(/\/Contents\/MacOS\/[^/]+$/, "") : dirname(app);
  return { binDir, readable: [binDir, bundle] };
}

function realOrSame(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
