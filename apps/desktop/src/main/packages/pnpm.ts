// The pnpm of Spaka's own (ADR 0013). Spaka downloads it the first time a
// website adds a package, at the version and integrity this release pins
// (pnpm.json). It runs apart from any pnpm or npm of the maker's:
// - its store, cache, state and configuration are folders of Spaka's;
// - the project's workspace file and pnpmfile are ignored;
// - no install script runs, and it downloads no Node and no other pnpm.
// The packages plan's probe checked every setting here (docs/spikes/packages.md).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { cleanEnv } from "../agent/confinement";
import pinned from "./pnpm.json";
import { prepareProject } from "./project";

export const PNPM_VERSION = pinned.version;
const REGISTRY = "https://registry.npmjs.org/";
/** A week, in minutes: no version younger than this is installed, dependencies included (Q500). */
const MINIMUM_RELEASE_AGE = 7 * 24 * 60;

/** Where Spaka keeps its pnpm and everything pnpm writes, in the app's data folder. */
export type PnpmFolders = {
  program: string;
  home: string;
  config: string;
  store: string;
  cache: string;
  state: string;
  run: string;
  /** An empty file, read instead of the maker's ~/.npmrc. */
  npmrc: string;
};

export function pnpmFolders(dataDir: string, platform = process.platform): PnpmFolders {
  const base = join(dataDir, "pnpm");
  return {
    program: join(dataDir, "tools", `pnpm-${PNPM_VERSION}`, platform === "win32" ? "pnpm.exe" : "pnpm"),
    home: join(base, "home"),
    config: join(base, "config"),
    store: join(base, "store"),
    cache: join(base, "cache"),
    state: join(base, "state"),
    run: join(base, "run"),
    npmrc: join(base, "npmrc"),
  };
}

/** Bytes' integrity as npm's registry writes it. */
export const integrityOf = (bytes: Buffer) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

/**
 * The file at `wanted` in a tar archive (npm's tarballs are ustar), or
 * undefined. GNU long names and pax paths are read too.
 */
export function fileInTarball(tar: Buffer, wanted: string): Buffer | undefined {
  let at = 0;
  let longName: string | undefined;
  while (at + 512 <= tar.length) {
    const header = tar.subarray(at, at + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start: number, length: number) =>
      header
        .subarray(start, start + length)
        .toString("utf8")
        .replace(/\0[\s\S]*$/, "");
    const size = Number.parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1) || "0";
    const prefix = field(345, 155);
    const name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    longName = undefined;
    const body = tar.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") longName = body.toString("utf8").replace(/\0[\s\S]*$/, "");
    else if (type === "x") longName = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString("utf8"))?.[1];
    else if (type === "0" && name === wanted) return Buffer.from(body);
  }
  return undefined;
}

export type DownloadOptions = { fetch?: typeof fetch; platform?: NodeJS.Platform; arch?: string };

const downloads = new Map<string, Promise<string>>();

/** Spaka's pnpm, downloaded and checked if it is not there yet; its path. */
export function ensurePnpm(folders: PnpmFolders, options: DownloadOptions = {}): Promise<string> {
  if (existsSync(folders.program)) return Promise.resolve(folders.program);
  let pending = downloads.get(folders.program);
  if (!pending) {
    pending = download(folders, options).finally(() => downloads.delete(folders.program));
    downloads.set(folders.program, pending);
  }
  return pending;
}

async function download(
  folders: PnpmFolders,
  { fetch: get = fetch, platform = process.platform, arch = process.arch }: DownloadOptions,
): Promise<string> {
  const key = `${platform}-${arch}`;
  const integrity = (pinned.platforms as Record<string, string>)[key];
  if (!integrity) throw new Error(`Spaka has no pnpm for this system (${key}), so it cannot install packages here.`);
  const url = `${REGISTRY}@pnpm/exe.${key}/-/exe.${key}-${PNPM_VERSION}.tgz`;
  const response = await get(url);
  if (!response.ok) throw new Error(`pnpm could not be downloaded: ${url} answered ${response.status}.`);
  const tgz = Buffer.from(await response.arrayBuffer());
  if (integrityOf(tgz) !== integrity)
    throw new Error(`The pnpm downloaded from ${url} is not the one this release of Spaka expects: it was not kept.`);
  const name = platform === "win32" ? "pnpm.exe" : "pnpm";
  const program = fileInTarball(gunzipSync(tgz), `package/${name}`);
  if (!program) throw new Error(`${url} holds no package/${name}.`);
  // Written beside its final folder, then moved there whole: a pnpm is never half there.
  const dir = dirname(folders.program);
  const partial = `${dir}.partial-${process.pid}-${Date.now()}`;
  mkdirSync(partial, { recursive: true });
  writeFileSync(join(partial, name), program);
  if (platform !== "win32") chmodSync(join(partial, name), 0o755);
  try {
    renameSync(partial, dir);
  } catch (error) {
    rmSync(partial, { recursive: true, force: true });
    if (!existsSync(folders.program)) throw error;
  }
  return folders.program;
}

/**
 * The environment pnpm runs in. It is the app's, cleaned as the agent's is,
 * less everything npm, pnpm, Corepack, XDG or a CI would set. pnpm's own
 * folders are Spaka's. The PATH holds the system's folders and Spaka's
 * `node`, which pnpm asks for its version, and no Node manager of the maker's.
 */
export function pnpmEnv(
  env: NodeJS.ProcessEnv,
  folders: PnpmFolders,
  nodeBinDir: string,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(cleanEnv(env)))
    if (!/^(npm_|pnpm_|xdg_|corepack_)|^(ci|node_options|path)$/i.test(name)) out[name] = value;
  out.PNPM_HOME = folders.home;
  out.PNPM_CONFIG_HOME = folders.config;
  out.XDG_RUNTIME_DIR = folders.run;
  if (platform === "win32") {
    const root = Object.entries(env).find(([name]) => /^systemroot$/i.test(name))?.[1] ?? "C:\\Windows";
    out.Path = [nodeBinDir, `${root}\\System32`, root, `${root}\\System32\\Wbem`].join(";");
  } else out.PATH = [nodeBinDir, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":");
  return out;
}

/** The settings of every pnpm call, as the probe ran them. */
export function pnpmFlags(projectDir: string, folders: PnpmFolders): string[] {
  const settings: Record<string, string | number | boolean> = {
    "cache-dir": folders.cache,
    "strict-ssl": true,
    "ignore-scripts": true,
    "ignore-pnpmfile": true,
    // A packageManager field naming another pnpm is let be, never followed.
    "pm-on-fail": "ignore",
    runtime: false,
    "minimum-release-age": MINIMUM_RELEASE_AGE,
    // Without a terminal, a version too young asked for by name is refused.
    "minimum-release-age-strict": true,
    "minimum-release-age-ignore-missing-time": false,
    "trust-policy": "no-downgrade",
    "trust-lockfile": false,
    "frozen-lockfile": false,
    "node-linker": "isolated",
    "virtual-store-type": "project",
    "package-import-method": "clone-or-copy",
    "update-notifier": false,
  };
  return [
    "--dir",
    projectDir,
    "--ignore-workspace",
    "--store-dir",
    folders.store,
    "--state-dir",
    folders.state,
    "--npmrc-auth-file",
    folders.npmrc,
    `--registry=${REGISTRY}`,
    ...Object.entries(settings).map(([name, value]) => `--config.${name}=${value}`),
  ];
}

/** Names that pnpm 12 takes for programs or other registries, never for a website's package. */
const NOT_PACKAGES = new Set(["npm", "node", "yarn", "bun", "deno", "pnpm", "pn", "pnx", "pnpx", "corepack"]);

/**
 * A package as pnpm is given it: a name of npm's registry, and an exact
 * version or none. A prefix (`jsr:`, `gh:`, `crate:`…), a path, a URL or a
 * range is refused, as are the programs pnpm would install instead.
 */
export function packageSpec(name: string, version?: string): string {
  if (name.length > 214 || !/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/.test(name))
    throw new Error(`"${name}" is not the name of a package on npm.`);
  if (NOT_PACKAGES.has(name)) throw new Error(`${name} is a program, not a package a website uses.`);
  if (version === undefined) return name;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error(`"${version}" is not an exact version, such as 1.4.2.`);
  return `${name}@${version}`;
}

export type PnpmReport = {
  added: { name: string; version: string }[];
  removed: { name: string; version: string }[];
  warnings: string[];
  errors: { code?: string; message: string }[];
};

/** What pnpm's ndjson reporter said: the packages added and removed, its warnings and errors. */
export function readReport(ndjson: string): PnpmReport {
  const report: PnpmReport = { added: [], removed: [], warnings: [], errors: [] };
  for (const line of ndjson.split("\n")) {
    const text = line.trim();
    if (!text) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(text);
    } catch {
      // A few warnings come as plain lines, such as the "pnpm" field of package.json being ignored.
      report.warnings.push(text.replace(/^\[WARN\]\s*/, ""));
      continue;
    }
    if (entry.name === "pnpm:root") {
      for (const key of ["added", "removed"] as const) {
        const dep = entry[key] as { name?: unknown; version?: unknown } | undefined;
        if (typeof dep?.name === "string" && typeof dep.version === "string")
          report[key].push({ name: dep.name, version: dep.version });
      }
    } else if (entry.level === "warn" && typeof entry.message === "string") report.warnings.push(entry.message);
    else if (entry.level === "error" && typeof entry.message === "string")
      report.errors.push({ ...(typeof entry.code === "string" ? { code: entry.code } : {}), message: entry.message });
  }
  report.warnings = [...new Set(report.warnings)];
  return report;
}

export type PnpmRun = { ok: boolean; code: number | null; report: PnpmReport; timedOut: boolean };

export type PnpmPlace = {
  program: string;
  projectDir: string;
  folders: PnpmFolders;
  /** The folder of Spaka's `node` launcher. */
  nodeBinDir: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** Runs pnpm once in a project, with no terminal: what it added, removed and said. */
export function runPnpm(command: "add" | "remove" | "install", specs: string[], place: PnpmPlace): Promise<PnpmRun> {
  const { program, projectDir, folders, nodeBinDir, env = process.env, signal, timeoutMs = 300_000 } = place;
  for (const dir of [folders.home, folders.config, folders.store, folders.cache, folders.state, folders.run])
    mkdirSync(dir, { recursive: true });
  if (!existsSync(folders.npmrc)) writeFileSync(folders.npmrc, "");
  const args = [
    command,
    ...specs,
    ...(command === "add" ? ["--save-exact"] : []),
    ...(command === "install" ? ["--no-runtime"] : []),
    ...pnpmFlags(projectDir, folders),
    "--reporter=ndjson",
  ];
  return new Promise((resolve) => {
    // stdin is closed: pnpm then refuses what it would otherwise ask about.
    const child = spawn(program, args, {
      cwd: projectDir,
      env: pnpmEnv(env, folders, nodeBinDir),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let ndjson = "";
    child.stderr.on("data", (chunk: Buffer) => {
      ndjson += chunk.toString("utf8");
    });
    child.stdout.resume();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const abort = () => child.kill();
    signal?.addEventListener("abort", abort, { once: true });
    const done = (code: number | null, error?: Error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      const report = readReport(ndjson);
      if (error) report.errors.push({ message: error.message });
      if (timedOut)
        report.errors.push({ message: `pnpm took more than ${Math.round(timeoutMs / 1000)} s and was stopped.` });
      resolve({ ok: code === 0 && !report.errors.length, code, report, timedOut });
    };
    child.on("close", (code) => done(code));
    child.on("error", (error) => done(null, error));
  });
}

/**
 * Adds, removes or installs a project's packages: the project put right
 * first (its notes are for the agent), Spaka's pnpm downloaded if need be,
 * then run.
 */
export async function pnpmInProject(
  command: "add" | "remove" | "install",
  specs: string[],
  place: Omit<PnpmPlace, "program"> & { download?: DownloadOptions },
): Promise<PnpmRun & { notes: string[] }> {
  const notes = prepareProject(place.projectDir);
  const program = await ensurePnpm(place.folders, place.download);
  return { ...(await runPnpm(command, specs, { ...place, program })), notes };
}
