// The preview's server process (ADR 0014, Q496, Q510): one for each open site
// that has server modules, started at the first page or form that needs one.
// Spaka's Node (Electron run as Node) runs out/hosts/modules.mjs under Node's
// permissions, reading the project and writing only the site's folder and
// database in Spaka's data; on macOS, inside a sandbox profile of Spaka's own
// too. Its environment holds the site's secrets alone. It answers over Node's
// IPC channel, and is started again once server/, package.json or the
// lockfile change.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ActionAnswer, DataApi, ModuleKind, ServerHost } from "@spaka/runtime";
import {
  type DataAnswer,
  fromWireResponse,
  type HostCall,
  type HostMessage,
  moduleFiles,
  wireRequest,
} from "@spaka/runtime/node";
import { confinedProfile, sandboxAvailable } from "../agent/pi/shell";

/** Something the process said: an error, or what a module printed. */
export type ServerSaid = { kind: "error" | "console"; source: string; message: string; at: number };

export type ServerProcessOptions = {
  root: string;
  /** The folder modules may write in (Q524, Q528): `<userData>/server-files/<id>/`. */
  filesDir: string;
  /** The site's database in the preview: `<userData>/server-db/<id>/data.sqlite`. */
  dbFile: string;
  /** The process's script, modules.mjs. */
  hostFile: string;
  /** Spaka's data API on this site's records. */
  data: () => DataApi;
  /** The site's secrets (Q501), read at each start. */
  secrets?: () => Record<string, string>;
  /** An error, or a line a module printed, for the page's errors (look_at_preview). */
  onSaid?: (said: ServerSaid) => void;
  executable?: string;
  /** Folders the sandbox lets Electron read besides the project: the app bundle. */
  readable?: string[];
  platform?: NodeJS.Platform;
  /** How long a call may take before the process is stopped and started again. */
  timeoutMs?: number;
};

type Waiting = { resolve: (message: HostMessage) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

const real = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/** The few variables Windows needs for a program's network and files, besides the secrets. */
const WINDOWS_BASICS = ["SystemRoot", "SYSTEMROOT", "windir", "TEMP", "TMP"];

export class ServerProcess implements ServerHost {
  private child: ChildProcess | undefined;
  private started: Promise<ChildProcess> | undefined;
  private next = 0;
  private readonly waiting = new Map<number, Waiting>();
  private stderr = "";
  private stopped = false;

  constructor(private readonly o: ServerProcessOptions) {}

  /** The site's modules by name, as they are on the disk now. */
  modules(): Record<string, string> {
    return moduleFiles(join(this.o.root, "server"));
  }

  async kinds(name: string): Promise<ModuleKind[] | undefined> {
    if (!Object.hasOwn(this.modules(), name)) return undefined;
    const answer = await this.call({ op: "kinds", name });
    return ("kinds" in answer && answer.kinds) || undefined;
  }

  async load(name: string, args: Record<string, unknown>): Promise<unknown> {
    this.known(name);
    const answer = await this.call({ op: "load", name, args });
    return "value" in answer ? answer.value : undefined;
  }

  async action(name: string, fields: Record<string, string | string[]>, request: Request): Promise<ActionAnswer> {
    this.known(name);
    const answer = await this.call({ op: "action", name, fields, request: await wireRequest(request) });
    if (!("action" in answer) || !answer.action) throw new Error(`server/${name} gave no answer`);
    return answer.action;
  }

  async route(name: string, request: Request): Promise<Response> {
    this.known(name);
    const answer = await this.call({ op: "route", name, request: await wireRequest(request) });
    if (!("response" in answer)) throw new Error(`server/${name} gave no response`);
    return fromWireResponse(answer.response);
  }

  /** Stops the process: the next call starts it again, with the modules as they are then. */
  restart() {
    const child = this.child;
    this.child = undefined;
    this.started = undefined;
    child?.kill();
    this.fail(new Error("the server modules changed, and their process was started again"));
  }

  /** Stops it for good, the site being closed. */
  stop() {
    this.stopped = true;
    this.restart();
  }

  private known(name: string) {
    if (!Object.hasOwn(this.modules(), name))
      throw new Error(`there is no server module named ${name} (server/${name}.ts or .js)`);
  }

  private async call(call: DistributiveOmit<HostCall, "id">): Promise<HostMessage> {
    const child = await this.start();
    const id = ++this.next;
    const timeoutMs = this.o.timeoutMs ?? 30_000;
    return new Promise<HostMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error(`server/${call.name} did not answer within ${timeoutMs / 1000} s, and was stopped`));
        // A module stuck in a loop holds the whole process: it starts again.
        if (this.child === child) this.restart();
      }, timeoutMs);
      this.waiting.set(id, { resolve, reject, timer });
      child.send({ ...call, id } as HostCall);
    });
  }

  private start(): Promise<ChildProcess> {
    if (this.stopped) return Promise.reject(new Error("the site is closed"));
    if (!this.started) {
      this.started = this.spawn();
      this.started.catch(() => {
        this.started = undefined;
      });
    }
    return this.started;
  }

  private spawn(): Promise<ChildProcess> {
    const platform = this.o.platform ?? process.platform;
    const executable = real(this.o.executable ?? process.execPath);
    mkdirSync(this.o.filesDir, { recursive: true });
    mkdirSync(dirname(this.o.dbFile), { recursive: true });
    const root = real(this.o.root);
    const files = real(this.o.filesDir);
    const db = real(dirname(this.o.dbFile));
    const hostDir = real(dirname(this.o.hostFile));
    const node = [
      "--permission",
      `--allow-fs-read=${root}`,
      `--allow-fs-read=${hostDir}`,
      `--allow-fs-read=${files}`,
      `--allow-fs-write=${files}`,
      `--allow-fs-read=${db}`,
      `--allow-fs-write=${db}`,
      "--experimental-transform-types",
      "--disable-warning=ExperimentalWarning",
      real(this.o.hostFile),
      root,
      files,
      join(db, "data.sqlite"),
    ];
    const [file, args] =
      sandboxAvailable(platform) && platform === process.platform
        ? [
            "/usr/bin/sandbox-exec",
            [
              "-p",
              confinedProfile({
                readable: [root, hostDir, files, db, ...(this.o.readable ?? [])],
                writable: [files, db],
                executables: [executable],
              }),
              executable,
              ...node,
            ],
          ]
        : [executable, node];
    const secrets = this.o.secrets?.() ?? {};
    const env: NodeJS.ProcessEnv = {
      ...(platform === "win32"
        ? Object.fromEntries(WINDOWS_BASICS.filter((k) => process.env[k]).map((k) => [k, process.env[k]]))
        : {}),
      ...secrets,
      ELECTRON_RUN_AS_NODE: "1",
      SPAKA_SECRET_NAMES: JSON.stringify(Object.keys(secrets)),
    };
    this.stderr = "";
    const child = spawn(file, args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    this.child = child;
    child.stdout?.on("data", (chunk: Buffer) => this.say("console", "server", chunk.toString("utf8").trimEnd()));
    child.stderr?.on("data", (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString("utf8")).slice(-4000);
    });
    return new Promise<ChildProcess>((resolve, reject) => {
      child.on("message", (message: HostMessage) => {
        if (message.type === "ready") resolve(child);
        else this.received(message);
      });
      child.on("error", (error) => {
        reject(error);
        this.exited(child, error.message);
      });
      child.on("exit", (code, signal) => {
        const why = this.stderr.trim().split("\n").filter(Boolean).slice(-3).join(" ");
        const message = `the server process stopped (${code ?? signal})${why ? `: ${why}` : ""}`;
        reject(new Error(message));
        this.exited(child, message);
      });
    });
  }

  private received(message: HostMessage) {
    if (message.type === "error") return this.say("error", message.source, message.message);
    if (message.type === "console")
      return this.say(
        message.level === "error" || message.level === "warn" ? "error" : "console",
        "server",
        message.text,
      );
    if (message.type === "data") return void this.answerData(message);
    if (message.type === "ready") return;
    const waiting = this.waiting.get(message.id);
    if (!waiting) return;
    this.waiting.delete(message.id);
    clearTimeout(waiting.timer);
    if (message.type === "failed") waiting.reject(new Error(message.message));
    else waiting.resolve(message);
  }

  private async answerData(message: Extract<HostMessage, { type: "data" }>) {
    const reply = (answer: DataAnswer) => this.child?.send(answer);
    try {
      const data = this.o.data();
      const value =
        message.call === "list"
          ? await data.list(message.datasource)
          : await data.add(message.datasource, message.fields ?? {});
      reply({ type: "data", id: message.id, value });
    } catch (error) {
      reply({ type: "data", id: message.id, message: error instanceof Error ? error.message : String(error) });
    }
  }

  private exited(child: ChildProcess, message: string) {
    if (this.child !== child) return;
    this.child = undefined;
    this.started = undefined;
    this.fail(new Error(message));
    if (!this.stopped) this.say("error", "server", message);
  }

  private fail(error: Error) {
    for (const [id, waiting] of this.waiting) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
      this.waiting.delete(id);
    }
  }

  private say(kind: ServerSaid["kind"], source: string, message: string) {
    if (message) this.o.onSaid?.({ kind, source, message, at: Date.now() });
  }
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
