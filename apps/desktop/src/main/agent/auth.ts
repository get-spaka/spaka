// Signing the agent in (ADR 0002). Upstart never handles a Claude credential:
// it runs the official binary's own sign-in, which opens the maker's browser
// and keeps what it gets in the agent's configuration folder. The one secret
// Upstart keeps is an API key the maker types in, encrypted by the system.
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { SignInMethod } from "../../shared/ipc";

/** What the binary says about its sign-in (`auth status --json`). */
export type AuthState = { loggedIn: boolean; method: string };

/** Encrypts and decrypts with a key the operating system keeps (Electron's safeStorage). */
export type Vault = { encrypt: (text: string) => Buffer; decrypt: (data: Buffer) => string };

export class AgentAuth {
  private login: ChildProcess | undefined;
  /** The page to open when the browser did not open by itself. */
  signInUrl: string | undefined;
  signInFailed = false;
  private cachedKey: string | null | undefined;

  constructor(
    private readonly deps: {
      binary: string;
      /** The agent's environment without the API key. */
      env: () => Record<string, string>;
      keyFile: string;
      vault: Vault;
      onChange: () => void;
    },
  ) {}

  get signingIn() {
    return !!this.login;
  }

  /** The environment the agent runs with: its own, plus the maker's API key if there is one. */
  env(): Record<string, string> {
    const key = this.apiKey();
    return { ...this.deps.env(), ...(key ? { ANTHROPIC_API_KEY: key } : {}) };
  }

  status(): Promise<AuthState> {
    return new Promise((resolve) => {
      execFile(
        this.deps.binary,
        ["auth", "status", "--json"],
        { env: this.env(), timeout: 20_000 },
        (_error, stdout) => {
          resolve(parseAuthStatus(stdout));
        },
      );
    });
  }

  /** Starts the binary's own sign-in, which opens the maker's browser. */
  signIn(method: SignInMethod) {
    if (this.login) return;
    this.signInUrl = undefined;
    this.signInFailed = false;
    const child = spawn(this.deps.binary, ["auth", "login", method === "console" ? "--console" : "--claudeai"], {
      env: this.deps.env(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.login = child;
    let output = "";
    const read = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-8000);
      const url = findSignInUrl(output);
      if (url && url !== this.signInUrl) {
        this.signInUrl = url;
        this.deps.onChange();
      }
    };
    child.stdout?.on("data", read);
    child.stderr?.on("data", read);
    child.on("exit", (code, signal) => {
      if (this.login !== child) return;
      this.login = undefined;
      this.signInUrl = undefined;
      this.signInFailed = code !== 0 && signal !== "SIGTERM";
      this.deps.onChange();
    });
    this.deps.onChange();
  }

  cancelSignIn() {
    const child = this.login;
    if (!child) return;
    this.login = undefined;
    this.signInUrl = undefined;
    child.kill("SIGTERM");
    this.deps.onChange();
  }

  get hasApiKey() {
    return !!this.apiKey();
  }

  setApiKey(key: string | null) {
    const value = key?.trim();
    if (value) {
      writeFileSync(this.deps.keyFile, this.deps.vault.encrypt(value), { mode: 0o600 });
      this.cachedKey = value;
    } else {
      rmSync(this.deps.keyFile, { force: true });
      this.cachedKey = null;
    }
    this.deps.onChange();
  }

  private apiKey(): string | undefined {
    if (this.cachedKey === undefined) {
      // The system's key store is touched only when there is a key to read.
      try {
        this.cachedKey = existsSync(this.deps.keyFile)
          ? this.deps.vault.decrypt(readFileSync(this.deps.keyFile))
          : null;
      } catch {
        this.cachedKey = null;
      }
    }
    return this.cachedKey ?? undefined;
  }
}

export function parseAuthStatus(stdout: string): AuthState {
  try {
    const raw = JSON.parse(stdout);
    return { loggedIn: raw?.loggedIn === true, method: typeof raw?.authMethod === "string" ? raw.authMethod : "none" };
  } catch {
    return { loggedIn: false, method: "none" };
  }
}

/** The sign-in page the binary prints, for when the browser did not open. */
export function findSignInUrl(output: string): string | undefined {
  const urls = output.match(/https:\/\/[^\s"'<>]+/g);
  return urls?.find((u) => /oauth|authorize|login/i.test(u)) ?? urls?.[0];
}
