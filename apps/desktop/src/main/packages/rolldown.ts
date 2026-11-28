// Spaka's Rolldown (ADR 0013, packages plan, slice 3; Q557). Spaka's pnpm
// installs it in the app's tools folder (tools/rolldown/), the first time a
// website's scripts import a package, from the package.json and the lockfile
// this release ships (rolldown/), and without the optional packages: its
// native programs. The build host runs under Node's permissions, which refuse
// native code, so Rolldown runs as WebAssembly (@rolldown/binding-wasm32-wasi):
// the same on every system, and in the signed app, whose hardened runtime
// would refuse a library signed by someone else. Vite is not used: on Windows
// it hands Rolldown's WebAssembly paths it cannot read.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import host from "./build-host.mjs?raw";
import { type DownloadOptions, ensurePnpm, type PnpmFolders, runPnpm } from "./pnpm";
import manifest from "./rolldown/package.json";
import lockfile from "./rolldown/pnpm-lock.yaml?raw";
import drives from "./wasi-drives.mjs?raw";

export const ROLLDOWN_VERSION = manifest.dependencies.rolldown;

/** What every module made by this release's tools depends on: Rolldown's lockfile and the build host. */
export const TOOLS_KEY = createHash("sha256")
  .update(lockfile)
  .update("\0")
  .update(host)
  .update("\0")
  .update(drives)
  .digest("hex")
  .slice(0, 16);

export type RolldownTools = {
  /** The folder Rolldown is installed in, which the build host resolves it from. */
  dir: string;
  /** The build host's script. */
  host: string;
  /** What is loaded before it, in each of its threads (wasi-drives.mjs). */
  preload: string;
};

export type RolldownPlace = {
  folders: PnpmFolders;
  /** The folder of Spaka's `node` launcher, for pnpm. */
  nodeBinDir: string;
  env?: NodeJS.ProcessEnv;
  download?: DownloadOptions;
};

/** Where Spaka's Rolldown is installed: beside its pnpm, in the tools folder. */
export function rolldownDir(folders: PnpmFolders): string {
  return join(dirname(dirname(folders.program)), "rolldown");
}

const installs = new Map<string, Promise<RolldownTools>>();

/** Spaka's Rolldown, installed if it is not, or not as this release ships it; one install serving every caller. */
export function ensureRolldown(place: RolldownPlace): Promise<RolldownTools> {
  const dir = rolldownDir(place.folders);
  if (isInstalled(dir)) return Promise.resolve(withHost(dir));
  let pending = installs.get(dir);
  if (!pending) {
    pending = install(dir, place).finally(() => installs.delete(dir));
    installs.set(dir, pending);
  }
  return pending;
}

/** Written once pnpm has installed this release's lockfile: what it installed, the optional packages left out. */
const INSTALLED = "installed.txt";
const LOCKFILE_HASH = createHash("sha256").update(lockfile).digest("hex");

/** Whether the folder holds this release's Rolldown, installed to the end. */
function isInstalled(dir: string): boolean {
  try {
    return readFileSync(join(dir, INSTALLED), "utf8") === LOCKFILE_HASH;
  } catch {
    return false;
  }
}

/** The tools, the build host and its preload written again if this release's differ. */
function withHost(dir: string): RolldownTools {
  const written = (name: string, text: string) => {
    const file = join(dir, name);
    let current: string | undefined;
    try {
      current = readFileSync(file, "utf8");
    } catch {}
    if (current !== text) writeFileSync(file, text);
    return file;
  };
  return { dir, host: written("build-host.mjs", host), preload: written("wasi-drives.mjs", drives) };
}

async function install(dir: string, place: RolldownPlace): Promise<RolldownTools> {
  const program = await ensurePnpm(place.folders, place.download);
  // Installed in place: pnpm's junctions on Windows hold absolute paths, which a
  // folder moved afterwards would break. Its mark is written last, so an
  // install cut short is never taken for one done (isInstalled).
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(dir, "pnpm-lock.yaml"), lockfile);
  const run = await runPnpm("install", [], {
    program,
    projectDir: dir,
    folders: place.folders,
    nodeBinDir: place.nodeBinDir,
    ...(place.env ? { env: place.env } : {}),
    tools: true,
  });
  if (!run.ok)
    throw new Error(
      `Spaka could not install its Rolldown ${ROLLDOWN_VERSION}: ${run.report.errors.map((e) => e.message).join(" ") || `pnpm stopped (${run.code})`}`,
    );
  writeFileSync(join(dir, INSTALLED), LOCKFILE_HASH);
  return withHost(dir);
}
