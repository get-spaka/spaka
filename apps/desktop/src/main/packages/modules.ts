// The packages in the browser (ADR 0013, packages plan, slice 3): one ES
// module for each package, or path inside one, that a website's scripts
// import, made by Spaka's Rolldown in its build host (build-host.mjs) from the
// version installed, with the licence notices of what it bundles at its head.
// The page's import map points to them, in the preview and once exported.
// They are kept in the app's data folder for every website, by what they are
// made of: the package's version and those of what it brings, what the
// import map shares with it, and this release's tools.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import type { PackageImport } from "@spaka/runtime";
import { readLockfile } from "./lockfile";
import { type RolldownTools, TOOLS_KEY } from "./rolldown";

/** A package whose code a module bundles, as its notice names it. */
export type Bundled = { name: string; version: string; license?: string };

/** A module made, as served: its notices first. */
export type MadeModule = { code: string; gzip: number; bundled: Bundled[]; warnings: string[] };

/** What a specifier's module is, or why Spaka could not make it. */
export type ModuleResult = { module: MadeModule } | { error: string };

/** A build host's answer for one specifier. */
type HostResult =
  | { specifier: string; code: string; moduleIds: string[]; exports: string[]; warnings: string[] }
  | { specifier: string; error: string };

export type ModulesOptions = {
  /** Where the modules are kept, for every website. */
  cacheDir: string;
  /** Spaka's Rolldown, installed if need be. */
  tools: () => Promise<RolldownTools>;
  /**
   * Whether the build host runs under Node's permissions: always, but for
   * the unit tests, which run it with the repository's own Vite.
   */
  confined?: boolean;
  timeoutMs?: number;
};

/** The packages a project's package brings, as installed: name@version, its own included. */
function closureOf(projectDir: string, name: string, version: string): string[] {
  let installed: { name: string; version: string; via: string[] }[] = [];
  try {
    installed = readLockfile(projectDir).installed;
  } catch {}
  const brought = installed.filter((i) => i.via.includes(name)).map((i) => `${i.name}@${i.version}`);
  return [...new Set([`${name}@${version}`, ...brought])].sort();
}

/**
 * What a specifier's module leaves to the import map: the other entries,
 * unless the package brings another version of theirs, which it then
 * bundles. So `three/addons/…` imports the page's `three`.
 */
function externalsOf(entry: PackageImport, all: PackageImport[], closure: string[]): string[] {
  return all
    .filter((other) => other.specifier !== entry.specifier)
    .filter(
      (other) =>
        other.name === entry.name ||
        !closure.some((id) => id.startsWith(`${other.name}@`) && id !== `${other.name}@${other.version}`),
    )
    .map((other) => other.specifier)
    .sort();
}

export class PackageModules {
  /** The modules being made, by key: one build serves every request. */
  private readonly pending = new Map<string, Promise<ModuleResult>>();

  constructor(private readonly o: ModulesOptions) {}

  /** What a module is made of, hashed: its name in the cache. */
  private keyOf(projectDir: string, entry: PackageImport, all: PackageImport[]) {
    const closure = closureOf(projectDir, entry.name, entry.version);
    const external = externalsOf(entry, all, closure);
    const key = createHash("sha256")
      .update(JSON.stringify({ tools: TOOLS_KEY, specifier: entry.specifier, closure, external }))
      .digest("hex");
    return { key, external };
  }

  private cached(key: string): MadeModule | undefined {
    try {
      return JSON.parse(readFileSync(join(this.o.cacheDir, `${key}.json`), "utf8")) as MadeModule;
    } catch {
      return undefined;
    }
  }

  /**
   * The modules of a project's import map (`all`), made if need be: those
   * not kept yet in one run of the build host. Nothing but `wanted` is
   * awaited, all of them by default.
   */
  async modules(
    projectDir: string,
    all: PackageImport[],
    wanted: PackageImport[] = all,
  ): Promise<Map<string, ModuleResult>> {
    const keys = new Map(all.map((entry) => [entry.specifier, this.keyOf(projectDir, entry, all)]));
    const toMake: { entry: PackageImport; key: string; external: string[] }[] = [];
    for (const entry of all) {
      const { key, external } = keys.get(entry.specifier)!;
      if (!this.pending.has(key) && !this.cached(key)) toMake.push({ entry, key, external });
    }
    if (toMake.length) {
      const run = this.make(projectDir, toMake);
      for (const { entry, key } of toMake) {
        const one = run
          .then((made) => made.get(entry.specifier) ?? { error: "the build host said nothing of it" })
          .finally(() => this.pending.delete(key));
        this.pending.set(key, one);
      }
    }
    const results = new Map<string, ModuleResult>();
    for (const entry of wanted) {
      const { key } = keys.get(entry.specifier)!;
      const kept = this.cached(key);
      results.set(entry.specifier, kept ? { module: kept } : await (this.pending.get(key) ?? this.retry(key)));
    }
    return results;
  }

  /** A module whose build ended between the two looks: kept now, or failed. */
  private async retry(key: string): Promise<ModuleResult> {
    const kept = this.cached(key);
    return kept ? { module: kept } : { error: "it could not be made" };
  }

  /** The module served at an address of a project's import map, made if need be. */
  async served(projectDir: string, all: PackageImport[], url: string): Promise<ModuleResult | undefined> {
    const entry = all.find((p) => p.url === url);
    if (!entry) return undefined;
    return (await this.modules(projectDir, all, [entry])).get(entry.specifier);
  }

  /** What visitors download of each package, compressed, for the modules already made (Q520). */
  weights(projectDir: string, all: PackageImport[]): Map<string, number> {
    const weights = new Map<string, number>();
    for (const entry of all) {
      const kept = this.cached(this.keyOf(projectDir, entry, all).key);
      if (kept) weights.set(entry.name, (weights.get(entry.name) ?? 0) + kept.gzip);
    }
    return weights;
  }

  private async make(
    projectDir: string,
    toMake: { entry: PackageImport; key: string; external: string[] }[],
  ): Promise<Map<string, ModuleResult>> {
    const failed = (error: string) => new Map(toMake.map(({ entry }) => [entry.specifier, { error }]));
    let tools: RolldownTools;
    try {
      tools = await this.o.tools();
    } catch (error) {
      return failed(error instanceof Error ? error.message : String(error));
    }
    let answer: HostResult[];
    try {
      answer = await runHost(
        tools,
        { root: projectDir, modules: toMake.map(({ entry, external }) => ({ specifier: entry.specifier, external })) },
        this.o.confined ?? true,
        this.o.timeoutMs ?? 120_000,
      );
    } catch (error) {
      return failed(error instanceof Error ? error.message : String(error));
    }
    const made = new Map<string, ModuleResult>();
    mkdirSync(this.o.cacheDir, { recursive: true });
    for (const { entry, key } of toMake) {
      const result = answer.find((r) => r.specifier === entry.specifier);
      if (!result) made.set(entry.specifier, { error: "the build host said nothing of it" });
      else if ("error" in result) made.set(entry.specifier, { error: result.error });
      else {
        const bundled = bundledBy(projectDir, result.moduleIds);
        const code = `${notices(bundled)}${result.code}`;
        const module: MadeModule = {
          code,
          gzip: gzipSync(code).length,
          bundled: bundled.map(({ name, version, license }) => ({ name, version, ...(license ? { license } : {}) })),
          warnings: result.warnings,
        };
        const file = join(this.o.cacheDir, `${key}.json`);
        const partial = `${file}.${process.pid}.partial`;
        writeFileSync(partial, JSON.stringify(module));
        renameSync(partial, file);
        made.set(entry.specifier, { module });
      }
    }
    return made;
  }
}

/** Runs the build host once: the request on stdin, its answer on stdout. */
function runHost(
  tools: RolldownTools,
  request: { root: string; modules: { specifier: string; external: string[] }[] },
  confined: boolean,
  timeoutMs: number,
): Promise<HostResult[]> {
  // Reading only: no writing, no other program, no native code (Rolldown runs as WebAssembly);
  // what reads Windows' drives for it loaded first, in each of its threads (Q557).
  const permissions = confined ? ["--permission", "--allow-fs-read=*", "--allow-wasi", "--allow-worker"] : [];
  const preload = [`--import=${pathToFileURL(tools.preload).href}`];
  const env: Record<string, string> = {
    ELECTRON_RUN_AS_NODE: "1",
    NAPI_RS_FORCE_WASI: confined ? "error" : "false",
    SPAKA_ROLLDOWN_DIR: tools.dir,
  };
  for (const [name, value] of Object.entries(process.env))
    if (/^(systemroot|windir|temp|tmp|tmpdir)$/i.test(name) && value) env[name] = value;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", ...permissions, ...preload, tools.host], {
      cwd: tools.dir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(out) as HostResult[]);
      } catch {
        const last = err.trim().split("\n").filter(Boolean).slice(-3).join(" ");
        reject(new Error(`Spaka's Rolldown stopped (${code ?? "killed"})${last ? `: ${last}` : ""}`));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

type BundledPackage = Bundled & { dir: string };

/** The packages whose files a module bundles, from rolldown's module ids, in the order first met. */
function bundledBy(projectDir: string, moduleIds: string[]): BundledPackage[] {
  const bundled = new Map<string, BundledPackage>();
  const roots = new Map<string, BundledPackage | undefined>();
  // The project's folder and each file taken by their real paths, through pnpm's
  // links, and on Windows by their long names, as the native realpath gives them
  // (C:\Users\RUNNER~1 is C:\Users\runneradmin): a file named one way and the
  // folder the other would seem outside the project, its package not found.
  let root = projectDir;
  try {
    root = realpathSync.native(projectDir);
  } catch {}
  const packageAt = (dir: string): BundledPackage | undefined => {
    if (roots.has(dir)) return roots.get(dir);
    let found: BundledPackage | undefined;
    try {
      const json = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      // A package.json without a name and a version only marks its folder's module type.
      if (typeof json.name === "string" && typeof json.version === "string") {
        const license = typeof json.license === "string" ? json.license : json.license?.type;
        found = { name: json.name, version: json.version, dir, ...(typeof license === "string" ? { license } : {}) };
      }
    } catch {}
    if (!found) {
      const parent = dirname(dir);
      const outside = relative(root, parent).startsWith("..");
      found = parent !== dir && !outside ? packageAt(parent) : undefined;
    }
    roots.set(dir, found);
    return found;
  };
  for (const named of moduleIds) {
    if (!isAbsolute(named) || !existsSync(named)) continue;
    let id = named;
    try {
      id = realpathSync.native(named);
    } catch {}
    const of = packageAt(dirname(id));
    if (of) bundled.set(`${of.name}@${of.version}`, of);
  }
  return [...bundled.values()];
}

/** A package's licence text, from the file it ships. */
function licenceText(dir: string): string | undefined {
  try {
    const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i.test(f));
    return file ? readFileSync(join(dir, file), "utf8").trim().slice(0, 20_000) : undefined;
  } catch {
    return undefined;
  }
}

/** The notices at the head of a module: each package it bundles, its licence and the licence's text. */
function notices(bundled: BundledPackage[]): string {
  return bundled
    .map((p) => {
      const text = licenceText(p.dir);
      const lines = [
        `${p.name} ${p.version}${p.license ? ` · ${p.license}` : ""}`,
        ...(text ? ["", ...text.split("\n")] : []),
      ];
      return `/*!\n${lines.map((l) => ` *${l ? ` ${l.replaceAll("*/", "* /")}` : ""}`).join("\n")}\n */\n`;
    })
    .join("");
}
