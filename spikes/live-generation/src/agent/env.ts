// Environment and confinement for the agent under test (ADR 0007).
// Throwaway spike code.
import { realpathSync } from "node:fs";
import os from "node:os";

/**
 * The spike is launched from inside a Claude desktop session, whose environment
 * carries host-specific CLAUDE_* / ANTHROPIC_* variables. The agent under test
 * must behave as it would when started by the Upstart app, so every such
 * variable is dropped and the binary falls back to the machine's own sign-in.
 * ANTHROPIC_API_KEY is kept only when the caller asks for the API-key run.
 * Values are never read or logged here, only names.
 */
export function cleanEnv(opts: { keepApiKey?: boolean } = {}): Record<string, string> {
  const env: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    const hostSpecific = /^(ANTHROPIC_|CLAUDE_|CLAUDECODE$)/.test(name);
    if (hostSpecific && !(opts.keepApiKey && name === "ANTHROPIC_API_KEY")) {
      dropped.push(name);
      continue;
    }
    env[name] = value;
  }
  return env;
}

export const systemTmp = realpathSync(os.tmpdir());

export type ConfinementVariant = {
  /** Deny at once instead of prompting (permissions.denyInsteadOfPrompting). */
  denyInsteadOfPrompting?: boolean;
  /** Let sandboxed shell commands skip the classifier (the binary's default). */
  autoAllowBashIfSandboxed?: boolean;
  /** Route every shell command through the classifier. */
  classifyAllShell?: boolean;
  /** Paths sandboxed commands may not read; the project is re-allowed inside them. */
  denyRead?: string[];
  /** false = no operating-system sandbox, as on the platforms where it is missing: auto mode alone guards commands. */
  sandbox?: boolean;
  /** For baselines only: a mode other than auto, e.g. "dontAsk" with allow rules, so that no classifier runs. */
  permissionMode?: "auto" | "dontAsk";
  allow?: string[];
  /** Extra environment for the agent's process (and so for its shell commands). */
  env?: Record<string, string>;
};

/**
 * ADR 0007: the agent writes in the project folder and the system temporary
 * folder, reads only those (plus the system files its commands need), has a
 * shell with open network, runs in auto mode and never prompts.
 */
export function confinement(projectDir: string, variant: ConfinementVariant = {}) {
  const {
    denyInsteadOfPrompting = true,
    autoAllowBashIfSandboxed = true,
    classifyAllShell = false,
    denyRead = ["/Users", "/Volumes"],
    sandbox = true,
    permissionMode = "auto",
    allow = [],
  } = variant;
  return {
    cwd: projectDir,
    additionalDirectories: [systemTmp],
    permissionMode,
    // No user, project or local settings: nothing of the maker's own Claude Code
    // setup (CLAUDE.md, plugins, MCP servers, hooks) reaches the agent.
    settingSources: [] as [],
    // Only MCP servers the app itself passes (none in the spike).
    strictMcpConfig: true,
    settings: {
      // Found by the first probe: without these the agent inherits the connectors,
      // skills and plugins of the maker's claude.ai account (215k tokens of tool
      // definitions on the second request of a session on this machine).
      disableClaudeAiConnectors: true,
      syncClaudeAiSkills: false,
      syncClaudeAiPlugins: false,
      // Found by the first real run: the binary's auto-memory is keyed by the enclosing git
      // repository, so the maker's own Claude Code memory reached the agent (it answered in
      // French because a memory of this repository says so).
      autoMemoryEnabled: false,
      permissions: {
        ...(allow.length ? { allow } : {}),
        // File tools: nothing written or read outside the working directories.
        blockWritesOutsideWorkingDirectories: true,
        blockReadsOutsideWorkingDirectories: true,
        denyInsteadOfPrompting,
      },
      autoMode: { classifyAllShell },
      sandbox: {
        enabled: sandbox,
        failIfUnavailable: true,
        autoAllowBashIfSandboxed,
        allowUnsandboxedCommands: false,
        filesystem: {
          allowWrite: [systemTmp],
          denyRead,
          allowRead: [projectDir],
        },
        network: { allowedDomains: ["*"] },
      },
    },
  };
}
