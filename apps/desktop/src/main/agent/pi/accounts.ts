// The accounts of Upstart's own harness (Q269, Q275, Q280): ChatGPT Plus or
// Pro through Sign in with ChatGPT, under Upstart's own name, the maker's
// OpenAI and Gemini keys, and Vertex AI on a key of its express mode or on the
// Google Cloud sign-in the maker made with gcloud, with a project. What they
// give Upstart is encrypted by the system's keychain (the Vault) and kept in
// the app's data; the environment is never read for keys, so a key of the
// maker's shell never reaches the harness unasked. Claude's sign-in stays the
// official binary's alone (auth.ts).
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type ClientIdentity,
  type Credential,
  type CredentialInfo,
  type CredentialStore,
  createModels,
  type MutableModels,
} from "@earendil-works/pi-ai";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import type { Vault } from "../auth";
import { PI_MODELS, type PiAccount, piModel } from "./models";
import { GCLOUD_SIGN_IN, type VertexConfig, vertexProvider } from "./vertex";

export type KeyAccount = Extract<PiAccount, "openai" | "gemini" | "vertex">;

/** Vertex AI on gcloud's sign-in: the project, and the region, global unless said. */
export type VertexGcloud = { project: string; location: string };

/** Where gcloud keeps the sign-in made with `gcloud auth application-default login`. */
export function gcloudSignInFile(): string {
  return process.platform === "win32"
    ? join(
        process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
        "gcloud",
        "application_default_credentials.json",
      )
    : join(homedir(), ".config", "gcloud", "application_default_credentials.json");
}

/** The sign-ins pi-ai keeps (ChatGPT's tokens), encrypted in one file. */
export class VaultCredentials implements CredentialStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly vault: Vault,
  ) {}

  async read(providerId: string) {
    return this.all()[providerId];
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return Object.entries(this.all()).map(([providerId, c]) => ({ providerId, type: c.type }));
  }

  modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>) {
    const run = this.queue.then(async () => {
      const all = this.all();
      const next = await fn(all[providerId]);
      if (next === undefined) return all[providerId];
      this.write({ ...all, [providerId]: next });
      return next;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  delete(providerId: string) {
    const run = this.queue.then(() => {
      const { [providerId]: _, ...rest } = this.all();
      this.write(rest);
    });
    this.queue = run.catch(() => {});
    return run;
  }

  private all(): Record<string, Credential> {
    try {
      if (!existsSync(this.file)) return {};
      return JSON.parse(this.vault.decrypt(readFileSync(this.file)));
    } catch {
      return {};
    }
  }

  private write(all: Record<string, Credential>) {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, this.vault.encrypt(JSON.stringify(all)));
    renameSync(tmp, this.file);
  }
}

/** Where Sign in with ChatGPT stands. */
export type ChatGPTSignIn = { signingIn: boolean; url?: string; failed?: string };

export class PiAccounts {
  readonly models: MutableModels;
  private readonly credentials: VaultCredentials;
  private keys: Partial<Record<KeyAccount, string>> | undefined;
  private signIn: { abort: AbortController; url?: string } | undefined;
  private failed: string | undefined;
  private chatgpt = false;

  constructor(
    private readonly o: {
      /** The folder the accounts are kept in. */
      dir: string;
      vault: Vault;
      /** How requests and the sign-in name the app. */
      identity: ClientIdentity;
      onChange: () => void;
      /** Opens the sign-in page in the maker's browser. */
      openBrowser: (url: string) => void;
    },
  ) {
    mkdirSync(o.dir, { recursive: true });
    this.credentials = new VaultCredentials(join(o.dir, "sign-ins.bin"), o.vault);
    this.models = createModels({
      credentials: this.credentials,
      // Keys come from the maker through Upstart, never from the environment.
      authContext: { env: async () => undefined, fileExists: async () => false },
      identity: o.identity,
    });
    this.models.setProvider(openaiProvider());
    this.models.setProvider(googleProvider());
    this.models.setProvider(
      vertexProvider(
        () => this.vertexConfig(),
        PI_MODELS.filter((m) => m.account === "vertex").flatMap((m) => piModel("vertex", m.id) ?? []),
      ),
    );
  }

  /** Reads what is kept; call once before asking which accounts are connected. */
  async load() {
    this.chatgpt = (await this.credentials.read("openai"))?.type === "oauth";
  }

  /** The accounts the harness can use now. */
  connected(): PiAccount[] {
    const keys = this.readKeys();
    return [
      ...(this.chatgpt ? (["chatgpt"] as const) : []),
      ...(keys.openai ? (["openai"] as const) : []),
      ...(keys.gemini ? (["gemini"] as const) : []),
      ...(this.vertexConfig() ? (["vertex"] as const) : []),
    ];
  }

  /**
   * The key a request of this account carries; ChatGPT's sign-in is the
   * collection's own, and on gcloud's sign-in Vertex gets a stand-in that
   * pi-ai reads as none.
   */
  apiKey(account: PiAccount): string | undefined {
    if (account === "chatgpt") return undefined;
    if (account === "vertex") {
      const config = this.vertexConfig();
      return config ? ("key" in config ? config.key : GCLOUD_SIGN_IN) : undefined;
    }
    return this.readKeys()[account];
  }

  /** A key; a Vertex key replaces gcloud's sign-in, as only one of them is used. */
  setKey(account: KeyAccount, key: string | null) {
    const keys = { ...this.readKeys() };
    if (key?.trim()) keys[account] = key.trim();
    else delete keys[account];
    this.keys = keys;
    const file = join(this.o.dir, "keys.bin");
    if (!Object.keys(keys).length) rmSync(file, { force: true });
    else writeFileSync(file, this.o.vault.encrypt(JSON.stringify(keys)));
    if (account === "vertex" && key?.trim()) rmSync(this.gcloudFile(), { force: true });
    this.o.onChange();
  }

  /** Vertex AI on gcloud's sign-in, for a project; null stops using it. It replaces a Vertex key. */
  setVertexGcloud(project: string | null, location = "global") {
    if (project?.trim()) {
      writeFileSync(
        this.gcloudFile(),
        JSON.stringify({ project: project.trim(), location: location.trim() || "global" }),
      );
      if (this.readKeys().vertex) this.setKey("vertex", null);
    } else rmSync(this.gcloudFile(), { force: true });
    this.o.onChange();
  }

  hasVertexKey() {
    return !!this.readKeys().vertex;
  }

  /** Vertex AI as connected: gcloud's project, and whether gcloud's sign-in is on this computer. */
  vertexGcloud(): (VertexGcloud & { signedIn: boolean }) | undefined {
    const gcloud = this.readGcloud();
    return gcloud ? { ...gcloud, signedIn: existsSync(gcloudSignInFile()) } : undefined;
  }

  /** How Vertex AI is reached now, if it is: the express key, or gcloud's sign-in once it is made. */
  private vertexConfig(): VertexConfig | undefined {
    const key = this.readKeys().vertex;
    if (key) return { key };
    const gcloud = this.readGcloud();
    return gcloud && existsSync(gcloudSignInFile()) ? gcloud : undefined;
  }

  private gcloudFile() {
    return join(this.o.dir, "vertex-gcloud.json");
  }

  private readGcloud(): VertexGcloud | undefined {
    try {
      const { project, location } = JSON.parse(readFileSync(this.gcloudFile(), "utf8"));
      return typeof project === "string" && project ? { project, location: location || "global" } : undefined;
    } catch {
      return undefined;
    }
  }

  chatgptState(): ChatGPTSignIn {
    return { signingIn: !!this.signIn, url: this.signIn?.url, failed: this.failed };
  }

  /** Sign in with ChatGPT, under Upstart's name: opens the maker's browser and waits for its answer. */
  async signInChatGPT() {
    if (this.signIn) return;
    const abort = new AbortController();
    this.signIn = { abort };
    this.failed = undefined;
    this.o.onChange();
    try {
      await this.models.login(
        "openai",
        "oauth",
        {
          signal: abort.signal,
          notify: (event) => {
            if (event.type !== "auth_url" || !this.signIn) return;
            this.signIn.url = event.url;
            this.o.openBrowser(event.url);
            this.o.onChange();
          },
          // The browser comes back to Upstart by itself: no code to paste.
          prompt: (p) =>
            new Promise<string>((_, reject) => {
              const signal = p.signal ?? abort.signal;
              signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
            }),
        },
        { agentName: "Upstart", getDeviceId: () => this.deviceId() },
      );
      this.chatgpt = true;
    } catch (e) {
      if (!abort.signal.aborted) this.failed = String((e as Error)?.message ?? e);
    } finally {
      this.signIn = undefined;
      this.o.onChange();
    }
  }

  cancelChatGPT() {
    this.signIn?.abort.abort();
  }

  async signOutChatGPT() {
    await this.models.logout("openai");
    this.chatgpt = false;
    this.o.onChange();
  }

  /** This installation's stable id, which OpenAI knows Upstart's sign-ins by. */
  private deviceId(): string {
    const file = join(this.o.dir, "device-id");
    try {
      const id = readFileSync(file, "utf8").trim();
      if (id) return id;
    } catch {}
    const id = randomUUID();
    writeFileSync(file, id);
    return id;
  }

  private readKeys(): Partial<Record<KeyAccount, string>> {
    if (this.keys) return this.keys;
    const file = join(this.o.dir, "keys.bin");
    try {
      this.keys = existsSync(file) ? JSON.parse(this.o.vault.decrypt(readFileSync(file))) : {};
    } catch {
      this.keys = {};
    }
    return this.keys!;
  }
}
