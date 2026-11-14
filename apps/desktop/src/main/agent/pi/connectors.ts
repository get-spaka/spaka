// The maker's connectors in Upstart's own harness (Q277, ADR 0010): Upstart
// connects them itself, through pi-mcp, as Claude's kit does for Claude. A
// local one is a program launched outside the sandbox, in the project's
// folder; a remote one is reached over Streamable HTTP, and its OAuth sign-in
// goes through the maker's browser and back to Upstart on this computer. The
// tokens are encrypted by the system's keychain (the Vault), as connectors'
// secrets are, never written in a project's files.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import {
  type CallToolResult,
  createMcpToolName,
  limitMcpContent,
  McpClient,
  normalizeMcpInputSchema,
  StdioTransport,
  StreamableHttpTransport,
  type Tool,
  toLlmContent,
} from "@earendil-works/pi-mcp";
import {
  completeMcpSignIn,
  createMcpAuthProvider,
  listenForLoopbackSignIn,
  McpOAuthAuthorizationRequiredError,
  type McpOAuthServerStore,
  type McpOAuthSettings,
  type McpOAuthState,
  type OAuthCallbackPage,
  type OAuthChallenge,
  startMcpSignIn,
  waitForLoopbackSignIn,
} from "@earendil-works/pi-mcp/oauth";
import { en } from "../../../shared/strings/en";
import type { McpConfig, Vault } from "../../connectors/connectors";
import type { HarnessTool } from "./tools";

/** As the interface shows a connector (ConnectorInfo.status). */
export type ConnectorState = "connected" | "failed" | "needs-auth" | "pending";
export type ConnectorStatus = { name: string; status: ConnectorState; error?: string };

/** How long the agent's first message waits for its connectors. */
const READY_WAIT_MS = 15_000;
const CLIENT = { name: "Upstart", version: "2" };

/** The sign-ins of remote connectors, encrypted in one file; one store per server. */
export class VaultSignIns {
  private locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly file: string,
    private readonly vault: Vault,
  ) {}

  /** The store of one connector, known by its name and address. */
  store(name: string, url: string): McpOAuthServerStore {
    const key = `${name} ${url}`;
    return {
      load: () => this.all()[key],
      save: (state: McpOAuthState) => this.write({ ...this.all(), [key]: state }),
      withRefreshLock: <T>(fn: () => Promise<T>) => {
        const run = (this.locks.get(key) ?? Promise.resolve()).then(fn);
        this.locks.set(
          key,
          run.catch(() => {}),
        );
        return run;
      },
    };
  }

  private all(): Record<string, McpOAuthState> {
    try {
      if (!existsSync(this.file)) return {};
      return JSON.parse(this.vault.decrypt(readFileSync(this.file)));
    } catch {
      return {};
    }
  }

  private write(all: Record<string, McpOAuthState>) {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, this.vault.encrypt(JSON.stringify(all)));
    renameSync(tmp, this.file);
  }
}

type Server = {
  name: string;
  config: McpConfig;
  client?: McpClient;
  tools: Tool[];
  status: ConnectorState;
  error?: string;
  challenge?: OAuthChallenge;
  signIn?: AbortController;
  /** It was connected, then its connection closed. */
  dropped?: boolean;
};

export type PiConnectorsOptions = {
  /** The connectors that are on, with their secrets (Connectors.servers). */
  servers: Record<string, McpConfig>;
  signIns: VaultSignIns;
  /** Where a local connector runs, and its environment besides its own variables. */
  cwd: string;
  env: () => Record<string, string>;
  /** A connector's state or tools changed. */
  onChange: () => void;
  /** Whether the sign-in page may be opened (not in a background launch). */
  openBrowser?: (url: string) => void;
};

/** One project's connectors, for the harness: their tools, their state, their sign-in. */
export class PiConnectors {
  private readonly servers = new Map<string, Server>();
  private connecting: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(private readonly o: PiConnectorsOptions) {
    for (const [name, config] of Object.entries(o.servers))
      this.servers.set(name, { name, config, tools: [], status: "pending" });
  }

  get names() {
    return [...this.servers.keys()];
  }

  /** Connects every connector; their failures are kept as their state. */
  connect() {
    this.connecting = Promise.all([...this.servers.values()].map((s) => this.open(s))).then(() => {});
    return this.connecting;
  }

  /** Connects again those whose connection closed since. */
  reconnect() {
    const dropped = [...this.servers.values()].filter((s) => s.dropped);
    if (!dropped.length) return;
    for (const s of dropped) {
      s.dropped = false;
      s.status = "pending";
    }
    this.connecting = Promise.all([this.connecting, ...dropped.map((s) => this.open(s))]).then(() => {});
  }

  /** Waits for the connectors to answer, at most a few seconds: a slow one joins at a later message. */
  async ready(timeoutMs = READY_WAIT_MS) {
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([this.connecting, new Promise((r) => (timer = setTimeout(r, timeoutMs)))]);
    clearTimeout(timer);
  }

  status(): ConnectorStatus[] {
    return [...this.servers.values()].map((s) => ({
      name: s.name,
      status: s.status,
      ...(s.error ? { error: s.error } : {}),
    }));
  }

  /** The connected connectors' tools, named mcp__<connector>__<tool> as Claude's are. */
  tools(): HarnessTool[] {
    const taken = new Set<string>();
    const tools: HarnessTool[] = [];
    for (const server of this.servers.values()) {
      if (server.status !== "connected" || !server.client) continue;
      const client = server.client;
      for (const tool of server.tools) {
        const name = createMcpToolName(server.name, tool.name, (n) => taken.has(n));
        taken.add(name);
        tools.push({
          name,
          label: tool.title ?? tool.name,
          description: tool.description ?? tool.name,
          parameters: normalizeMcpInputSchema(tool.inputSchema),
          // A connector's tool may change things, unless it says it only reads.
          executionMode: tool.annotations?.readOnlyHint ? "parallel" : "sequential",
          execute: async (_id, params, signal): Promise<AgentToolResult<undefined>> => {
            const result: CallToolResult = await client.callTool(tool.name, params as Record<string, unknown>, {
              signal,
            });
            const { content } = await limitMcpContent(toLlmContent(result));
            return { content, details: undefined, ...(result.isError ? { isError: true } : {}) };
          },
        });
      }
    }
    return tools;
  }

  /**
   * Starts signing in to a remote connector: answers the page to open in the
   * browser, or nothing when its stored sign-in could be renewed. The browser
   * comes back to Upstart on this computer, which finishes the sign-in and
   * connects the connector.
   */
  async signIn(name: string): Promise<string | undefined> {
    const server = this.servers.get(name);
    if (!server) throw new Error(en.connectors.signInUnknown);
    if (server.config.type !== "http") throw new Error(en.connectors.signInUnsupported);
    server.signIn?.abort();
    const abort = new AbortController();
    server.signIn = abort;
    const options = this.oauth(server);
    const callback = await listenForLoopbackSignIn({ ...options, renderPage: signInPage });
    const signIn = {
      ...options,
      clientName: "Upstart",
      redirectUrl: callback.redirectUrl,
      challenge: server.challenge,
    };
    let started: Awaited<ReturnType<typeof startMcpSignIn>>;
    try {
      started = await startMcpSignIn({ ...signIn, signal: abort.signal });
    } catch (e) {
      callback.callback.close();
      throw e;
    }
    if (started.kind === "authorized") {
      callback.callback.close();
      await this.reopen(server);
      return undefined;
    }
    const authorization = started;
    void (async () => {
      try {
        const response = await waitForLoopbackSignIn({
          callback: callback.callback,
          authorization,
          signal: abort.signal,
        });
        await completeMcpSignIn({ ...signIn, authorization, response });
        await this.reopen(server);
      } catch (e) {
        if (!abort.signal.aborted) {
          server.error = message(e);
          this.o.onChange();
        }
      } finally {
        callback.callback.close();
        if (server.signIn === abort) server.signIn = undefined;
      }
    })();
    if (/^https?:\/\//.test(authorization.authorizationUrl)) return authorization.authorizationUrl;
    return undefined;
  }

  async close() {
    this.closed = true;
    await Promise.all(
      [...this.servers.values()].map(async (s) => {
        s.signIn?.abort();
        await s.client?.close().catch(() => {});
        s.client = undefined;
      }),
    );
  }

  private oauth(server: Server) {
    const config = server.config as Extract<McpConfig, { type: "http" | "sse" }>;
    const settings: McpOAuthSettings = {
      ...(config.oauth?.clientId ? { clientId: config.oauth.clientId } : {}),
      ...(config.oauth?.callbackPort ? { callbackPort: config.oauth.callbackPort } : {}),
      ...(config.oauth?.authServerMetadataUrl
        ? { authServerMetadataUrl: new URL(config.oauth.authServerMetadataUrl) }
        : {}),
    };
    return { serverUrl: config.url, store: this.o.signIns.store(server.name, config.url), settings };
  }

  private async reopen(server: Server) {
    await server.client?.close().catch(() => {});
    server.client = undefined;
    server.status = "pending";
    server.error = undefined;
    this.o.onChange();
    await this.open(server);
  }

  private async open(server: Server) {
    const { config } = server;
    const client = new McpClient(CLIENT);
    try {
      if (config.type === "sse") throw new Error(en.connectors.sseUnsupported);
      const transport =
        config.type === "stdio"
          ? new StdioTransport({
              command: config.command,
              args: config.args,
              cwd: this.o.cwd,
              env: { ...this.o.env(), ...config.env },
              inheritEnv: false,
              stderr: "pipe",
            })
          : new StreamableHttpTransport({
              url: config.url,
              headers: config.headers,
              // A connector reached with a key in its headers is not signed in to: a refused key is a failure.
              ...(config.headers && !config.oauth
                ? {}
                : {
                    authProvider: createMcpAuthProvider({
                      ...this.oauth(server),
                      settings: () => this.oauth(server).settings,
                      clientName: "Upstart",
                      onChallenge: (challenge) => {
                        server.challenge = challenge;
                      },
                    }),
                  }),
            });
      await client.connect(transport);
      server.tools = await client.listTools();
      if (this.closed) return void (await client.close().catch(() => {}));
      server.client = client;
      server.status = "connected";
      server.error = undefined;
      client.onClose(() => {
        if (server.client !== client || this.closed) return;
        server.client = undefined;
        server.status = "failed";
        server.error = en.connectors.disconnected;
        server.dropped = true;
        this.o.onChange();
      });
    } catch (e) {
      await client.close().catch(() => {});
      if (this.closed) return;
      const needsSignIn =
        e instanceof McpOAuthAuthorizationRequiredError ||
        (config.type === "http" && !config.headers && (e as { status?: number })?.status === 401);
      const refused = !needsSignIn && (e as { status?: number })?.status === 401;
      server.status = needsSignIn ? "needs-auth" : "failed";
      server.error = needsSignIn ? undefined : refused ? en.connectors.keyRefused : message(e);
    }
    this.o.onChange();
  }
}

/** The page the browser shows when it comes back to Upstart. */
function signInPage(page: OAuthCallbackPage): string {
  const text = page.ok ? en.connectors.signedInPage : en.connectors.signInFailedPage(page.message);
  const escaped = text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><meta charset="utf-8"><title>Upstart</title><body style="font:16px system-ui;margin:20vh auto;max-width:28rem;text-align:center"><p>${escaped}</p></body>`;
}

function message(e: unknown) {
  return String((e as Error)?.message ?? e).slice(0, 300);
}
