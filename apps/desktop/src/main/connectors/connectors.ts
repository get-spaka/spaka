// Connectors extend the agent (ADR 0010): a remote one is an address the
// agent's kit talks to; a local one is a program it launches, outside the
// sandbox. The maker adds them for all their websites or for one, in which
// case they are kept in the project's .upstart/connectors.json and travel
// with it, without their secrets.
//
// - Secrets (a header's value, an environment variable's value) are kept by
//   the app, encrypted by the system keychain, never in a project's files.
// - A local connector found in a project stays off until the maker approves
//   it on this machine. The approval is kept outside the project and tied to
//   the exact command: an agent that edits the command turns it off again.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ConnectorDraft, ConnectorInfo, ConnectorScope } from "../../shared/ipc";
import { replaceFile } from "../replace-file";

/** Where a project keeps its connectors. */
export const PROJECT_CONNECTORS = ".upstart/connectors.json";
/** Taken by Upstart's own tools. */
const RESERVED = new Set(["upstart"]);
const NAME = /^[a-z0-9]+([_-][a-z0-9]+)*$/;
const KEY = /^[A-Za-z][\w-]*$/;

/**
 * How the official program signs in to a remote connector that asks for it
 * (Q108): by default on its own (a return to this computer, the app
 * registered on the fly); for a service that wants an app declared with it,
 * that app's identifier, the fixed port it returns to, and where the
 * service's sign-in is described.
 */
export type SignIn = { clientId?: string; callbackPort?: number; authServerMetadataUrl?: string };

/** A connector as written in connectors.json: no secret values, only their names. */
export type ConnectorDef =
  | { name: string; kind: "remote"; url: string; transport?: "http" | "sse"; headers?: string[]; oauth?: SignIn }
  | { name: string; kind: "local"; command: string; args?: string[]; env?: string[] };

export type McpConfig =
  | { type: "http" | "sse"; url: string; headers?: Record<string, string>; oauth?: SignIn }
  | { type: "stdio"; command: string; args: string[]; env?: Record<string, string> };

export type Vault = { encrypt(text: string): Buffer; decrypt(data: Buffer): string };

type Secrets = Record<string, Record<string, string>>;
type Approval = { projectId: string; name: string; command: string };

export class Connectors {
  constructor(
    private readonly dataDir: string,
    private readonly vault: Vault,
  ) {}

  /** Every connector the open project's agent could get, with what keeps each off. */
  list(project?: { id: string; path: string }): Omit<ConnectorInfo, "status" | "error">[] {
    const secrets = this.secrets();
    const approvals = this.approvals();
    const all: [ConnectorScope, ConnectorDef][] = [
      ...this.defs("app").map((d) => ["app", d] as [ConnectorScope, ConnectorDef]),
      ...(project
        ? this.defs("project", project.path).map((d) => ["project", d] as [ConnectorScope, ConnectorDef])
        : []),
    ];
    return all.map(([scope, def]) => {
      const key = secretKey(scope, def.name, project?.id);
      const needed = secretNames(def);
      const missing = needed.filter((n) => !secrets[key]?.[n]);
      const approved =
        def.kind === "remote" ||
        scope === "app" ||
        approvals.some((a) => a.projectId === project?.id && a.name === def.name && a.command === commandId(def));
      // A project's connector takes the place of the app's of the same name.
      const shadowed = scope === "app" && all.some(([s, d]) => s === "project" && d.name === def.name);
      return {
        scope,
        name: def.name,
        kind: def.kind,
        target: def.kind === "remote" ? def.url : commandLine(def),
        ...(def.kind === "remote" && def.oauth ? { oauth: def.oauth } : {}),
        secrets: needed.map((n) => ({ name: n, set: !missing.includes(n) })),
        state: shadowed ? "replaced" : !approved ? "needs-approval" : missing.length ? "needs-secret" : "on",
      };
    });
  }

  /** The connectors the agent is given: those that are on, with their secrets. */
  servers(project: { id: string; path: string }): Record<string, McpConfig> {
    const secrets = this.secrets();
    const on = new Set(
      this.list(project)
        .filter((c) => c.state === "on")
        .map((c) => `${c.scope}:${c.name}`),
    );
    const out: Record<string, McpConfig> = {};
    for (const scope of ["app", "project"] as const) {
      for (const def of this.defs(scope, project.path)) {
        if (!on.has(`${scope}:${def.name}`)) continue;
        const values = secrets[secretKey(scope, def.name, project.id)] ?? {};
        const pick = (names: string[] = []) =>
          names.length ? Object.fromEntries(names.map((n) => [n, values[n] ?? ""])) : undefined;
        out[def.name] =
          def.kind === "remote"
            ? {
                type: def.transport ?? "http",
                url: def.url,
                ...(def.headers?.length ? { headers: pick(def.headers) } : {}),
                ...(def.oauth ? { oauth: def.oauth } : {}),
              }
            : {
                type: "stdio",
                ...launchedBy(def.command, def.args ?? []),
                ...(def.env?.length ? { env: pick(def.env) } : {}),
              };
      }
    }
    return out;
  }

  /** Changes when what the agent would be given changes. */
  fingerprint(project: { id: string; path: string }): string {
    return createHash("sha256")
      .update(JSON.stringify(this.servers(project)))
      .digest("hex");
  }

  add(scope: ConnectorScope, draft: ConnectorDraft, project?: { id: string; path: string }) {
    const name = draft.name.trim().toLowerCase();
    if (!NAME.test(name) || name.length > 40)
      throw new Error("A connector's name is lowercase letters, digits, hyphens or underscores.");
    if (RESERVED.has(name)) throw new Error(`"${name}" is taken by Upstart itself.`);
    const secretPairs = (draft.secrets ?? []).filter((s) => s.name.trim());
    for (const s of secretPairs) if (!KEY.test(s.name.trim())) throw new Error(`"${s.name}" is not a valid name.`);
    let def: ConnectorDef;
    if (draft.kind === "remote") {
      let url: URL;
      try {
        url = new URL(draft.target.trim());
      } catch {
        throw new Error("This is not a web address.");
      }
      if (url.protocol !== "https:" && !(url.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)))
        throw new Error("A remote connector's address starts with https://.");
      const oauth = signInFrom(draft.oauth);
      def = {
        name,
        kind: "remote",
        url: url.toString(),
        ...(draft.transport === "sse" ? { transport: "sse" as const } : {}),
        ...(secretPairs.length ? { headers: secretPairs.map((s) => s.name.trim()) } : {}),
        ...(oauth ? { oauth } : {}),
      };
    } else {
      const [command, ...args] = splitCommand(draft.target);
      if (!command) throw new Error("Write the command that starts the connector.");
      def = {
        name,
        kind: "local",
        command,
        ...(args.length ? { args } : {}),
        ...(secretPairs.length ? { env: secretPairs.map((s) => s.name.trim()) } : {}),
      };
    }
    const defs = this.defs(scope, project?.path).filter((d) => d.name !== name);
    this.saveDefs(scope, [...defs, def], project?.path);
    if (secretPairs.length)
      this.setSecrets(scope, name, Object.fromEntries(secretPairs.map((s) => [s.name.trim(), s.value])), project?.id);
    // The maker typed this command: a local connector they add is approved.
    if (scope === "project" && def.kind === "local" && project) this.approve(project.id, def);
  }

  remove(scope: ConnectorScope, name: string, project?: { id: string; path: string }) {
    this.saveDefs(
      scope,
      this.defs(scope, project?.path).filter((d) => d.name !== name),
      project?.path,
    );
    const secrets = this.secrets();
    delete secrets[secretKey(scope, name, project?.id)];
    this.saveSecrets(secrets);
  }

  /** The values of a connector's secrets, merged with those already set. */
  setSecrets(scope: ConnectorScope, name: string, values: Record<string, string>, projectId?: string) {
    const secrets = this.secrets();
    const key = secretKey(scope, name, projectId);
    secrets[key] = { ...secrets[key], ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "")) };
    this.saveSecrets(secrets);
  }

  /** Approves a project's local connector, as its command is now. */
  approveByName(name: string, project: { id: string; path: string }) {
    const def = this.defs("project", project.path).find((d) => d.name === name);
    if (def?.kind !== "local") throw new Error("Unknown connector.");
    this.approve(project.id, def);
  }

  private approve(projectId: string, def: ConnectorDef) {
    const approvals = this.approvals().filter((a) => !(a.projectId === projectId && a.name === def.name));
    approvals.push({ projectId, name: def.name, command: commandId(def) });
    writeJson(join(this.dataDir, "connector-approvals.json"), approvals);
  }

  private defs(scope: ConnectorScope, projectDir?: string): ConnectorDef[] {
    const file = this.fileFor(scope, projectDir);
    if (!file) return [];
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as { connectors?: unknown };
      return (Array.isArray(parsed.connectors) ? parsed.connectors : []).filter(isDef);
    } catch {
      return [];
    }
  }

  private saveDefs(scope: ConnectorScope, defs: ConnectorDef[], projectDir?: string) {
    const file = this.fileFor(scope, projectDir);
    if (!file) throw new Error("No project is open.");
    writeJson(file, { connectors: defs });
  }

  private fileFor(scope: ConnectorScope, projectDir?: string) {
    if (scope === "app") return join(this.dataDir, "connectors.json");
    return projectDir ? join(projectDir, PROJECT_CONNECTORS) : undefined;
  }

  private approvals(): Approval[] {
    try {
      return JSON.parse(readFileSync(join(this.dataDir, "connector-approvals.json"), "utf8")) as Approval[];
    } catch {
      return [];
    }
  }

  private secrets(): Secrets {
    try {
      return JSON.parse(this.vault.decrypt(readFileSync(join(this.dataDir, "connector-secrets.bin")))) as Secrets;
    } catch {
      return {};
    }
  }

  private saveSecrets(secrets: Secrets) {
    const file = join(this.dataDir, "connector-secrets.bin");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, this.vault.encrypt(JSON.stringify(secrets)));
    replaceFile(`${file}.tmp`, file);
  }
}

function isDef(value: unknown): value is ConnectorDef {
  const d = value as Record<string, unknown>;
  if (!d || typeof d.name !== "string" || !NAME.test(d.name) || RESERVED.has(d.name)) return false;
  const strings = (v: unknown) => v === undefined || (Array.isArray(v) && v.every((x) => typeof x === "string"));
  if (d.kind === "remote")
    return (
      typeof d.url === "string" &&
      /^https?:\/\//.test(d.url) &&
      strings(d.headers) &&
      [undefined, "http", "sse"].includes(d.transport as string) &&
      (d.oauth === undefined || isSignIn(d.oauth))
    );
  if (d.kind === "local") return typeof d.command === "string" && !!d.command && strings(d.args) && strings(d.env);
  return false;
}

const CLIENT_ID = /^[\w.:@/-]{1,200}$/;
const isPort = (v: unknown) => Number.isInteger(v) && (v as number) >= 1024 && (v as number) <= 65535;
const isHttps = (v: unknown) => typeof v === "string" && /^https:\/\/[^\s]+$/.test(v) && v.length <= 2000;

function isSignIn(value: unknown): value is SignIn {
  const o = value as Record<string, unknown>;
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  if (Object.keys(o).some((k) => !["clientId", "callbackPort", "authServerMetadataUrl"].includes(k))) return false;
  return (
    (o.clientId === undefined || (typeof o.clientId === "string" && CLIENT_ID.test(o.clientId))) &&
    (o.callbackPort === undefined || isPort(o.callbackPort)) &&
    (o.authServerMetadataUrl === undefined || isHttps(o.authServerMetadataUrl))
  );
}

/** The sign-in settings the maker typed, checked; none when all are empty. */
function signInFrom(draft: ConnectorDraft["oauth"]): SignIn | undefined {
  if (!draft) return undefined;
  const clientId = draft.clientId?.trim() || undefined;
  const port = draft.callbackPort?.trim() || undefined;
  const metadata = draft.authServerMetadataUrl?.trim() || undefined;
  if (clientId && !CLIENT_ID.test(clientId)) throw new Error("This is not an app identifier.");
  const callbackPort = port === undefined ? undefined : Number(port);
  if (callbackPort !== undefined && !isPort(callbackPort))
    throw new Error("The return port is a number from 1024 to 65535.");
  if (metadata && !isHttps(metadata)) throw new Error("The sign-in description's address starts with https://.");
  const out: SignIn = {
    ...(clientId ? { clientId } : {}),
    ...(callbackPort !== undefined ? { callbackPort } : {}),
    ...(metadata ? { authServerMetadataUrl: metadata } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

function secretNames(def: ConnectorDef): string[] {
  return (def.kind === "remote" ? def.headers : def.env) ?? [];
}

function secretKey(scope: ConnectorScope, name: string, projectId?: string) {
  return scope === "app" ? `app:${name}` : `project:${projectId ?? ""}:${name}`;
}

/** What an approval is tied to: the program, its arguments and the names of its variables. */
function commandId(def: ConnectorDef): string {
  if (def.kind !== "local") return "";
  return createHash("sha256")
    .update(JSON.stringify([def.command, def.args ?? [], def.env ?? []]))
    .digest("hex");
}

/**
 * How the binary launches a local connector's program. On Windows a command
 * such as npx is a .cmd script, which only cmd runs: it goes through `cmd /c`,
 * as Claude's documentation says; a program named with its .exe runs itself.
 */
export function launchedBy(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  if (platform !== "win32" || /\.exe$/i.test(command)) return { command, args };
  return { command: "cmd", args: ["/c", command, ...args] };
}

export function commandLine(def: { command: string; args?: string[] }, platform = process.platform): string {
  const parts = [def.command, ...(def.args ?? [])];
  // Windows: a backslash is a folder's separator, never an escape.
  if (platform === "win32") return parts.map((p) => (/[\s"']/.test(p) ? `"${p.replace(/"/g, '\\"')}"` : p)).join(" ");
  return parts.map((p) => (/[\s"'\\]/.test(p) ? JSON.stringify(p) : p)).join(" ");
}

/**
 * Splits a command line the way a shell would for plain words and quotes;
 * nothing is expanded. On Windows a backslash stays a folder's separator, and
 * escapes only a double quote inside double quotes.
 */
export function splitCommand(line: string, platform = process.platform): string[] {
  const windows = platform === "win32";
  const out: string[] = [];
  let current = "";
  let quote: string | undefined;
  let started = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === quote) quote = undefined;
      else if (c === "\\" && quote === '"' && i + 1 < line.length && (!windows || line[i + 1] === '"'))
        current += line[++i];
      else current += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      started = true;
    } else if (/\s/.test(c)) {
      if (started) out.push(current);
      current = "";
      started = false;
    } else {
      if (c === "\\" && !windows && i + 1 < line.length) current += line[++i];
      else current += c;
      started = true;
    }
  }
  if (started) out.push(current);
  return out;
}

function writeJson(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  replaceFile(`${file}.tmp`, file);
}
