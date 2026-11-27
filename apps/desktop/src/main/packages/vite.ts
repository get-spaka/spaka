// Spaka's Vite (ADR 0013, packages plan, slice 3). Spaka's pnpm installs it
// in the app's tools folder (tools/vite/), the first time a website's scripts
// import a package, from the package.json and the lockfile this release
// ships (vite/), and without the optional packages: Vite's native programs.
// The build host runs under Node's permissions, which refuse native code, so
// rolldown runs as WebAssembly (@rolldown/binding-wasm32-wasi): the same on
// every system, and in the signed app, whose hardened runtime would refuse a
// library signed by someone else.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import host from "./build-host.mjs?raw";
import { type DownloadOptions, ensurePnpm, type PnpmFolders, runPnpm } from "./pnpm";
import manifest from "./vite/package.json";
import lockfile from "./vite/pnpm-lock.yaml?raw";

export const VITE_VERSION = manifest.dependencies.vite;

/** What every module made by this release's tools depends on: Vite's lockfile and the build host. */
export const TOOLS_KEY = createHash("sha256").update(lockfile).update("\0").update(host).digest("hex").slice(0, 16);

export type ViteTools = {
  /** The folder Vite is installed in, which the build host resolves it from. */
  dir: string;
  /** The build host's script. */
  host: string;
};

export type VitePlace = {
  folders: PnpmFolders;
  /** The folder of Spaka's `node` launcher, for pnpm. */
  nodeBinDir: string;
  env?: NodeJS.ProcessEnv;
  download?: DownloadOptions;
};

/** Where Spaka's Vite is installed: beside its pnpm, in the tools folder. */
export function viteDir(folders: PnpmFolders): string {
  return join(dirname(dirname(folders.program)), "vite");
}

const installs = new Map<string, Promise<ViteTools>>();

/** Spaka's Vite, installed if it is not, or not as this release ships it; one install serving every caller. */
export function ensureVite(place: VitePlace): Promise<ViteTools> {
  const dir = viteDir(place.folders);
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

/** Whether the folder holds this release's Vite, installed to the end. */
function isInstalled(dir: string): boolean {
  try {
    return readFileSync(join(dir, INSTALLED), "utf8") === LOCKFILE_HASH;
  } catch {
    return false;
  }
}

/** The tools, the build host written again if this release's differs. */
function withHost(dir: string): ViteTools {
  const file = join(dir, "build-host.mjs");
  let current: string | undefined;
  try {
    current = readFileSync(file, "utf8");
  } catch {}
  if (current !== host) writeFileSync(file, host);
  return { dir, host: file };
}

async function install(dir: string, place: VitePlace): Promise<ViteTools> {
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
      `Spaka could not install its Vite ${VITE_VERSION}: ${run.report.errors.map((e) => e.message).join(" ") || `pnpm stopped (${run.code})`}`,
    );
  writeFileSync(join(dir, INSTALLED), LOCKFILE_HASH);
  return withHost(dir);
}
