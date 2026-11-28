// A website's packages (Q491, Q493, Q500, Q520, Q521, Q536-Q540): the agent
// adds and removes them through add_package and remove_package, Spaka
// choosing the version and judging it by its rules, the maker asked in the
// grey zone; a package.json changed by hand is installed with the same rules,
// what they refuse taken out of it; the site's settings list them; the
// installed versions are checked against the known flaws.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import semver from "semver";
import type { PackageInfo } from "../../shared/ipc";
import { DEPENDENCY_FIELDS, type DependencyField, type Direct, installedAsLocked, readLockfile } from "./lockfile";
import { type Flaw, scanFlaws } from "./osv";
import { type DownloadOptions, type PnpmFolders, type PnpmRun, packageSpec, pnpmInProject } from "./pnpm";
import {
  type Doubt,
  doubtLine,
  judge,
  type Refusal,
  readSignals,
  refusalLine,
  type Signals,
  Unreachable,
} from "./rules";

export type PackagesOptions = {
  folders: PnpmFolders;
  /** The folder of Spaka's `node` launcher. */
  nodeBinDir: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => number;
  download?: DownloadOptions;
};

/** A package in the grey zone, put to the maker on a card (Q493, Q536). */
export type GreyPackage = { name: string; version: string; description?: string; doubts: Doubt[] };
/** The maker's answer: install it or not, with their own words if they wrote some; nothing if the turn ended first. */
export type MakerAnswer = { install: boolean; words?: string } | undefined;
export type AskMaker = (grey: GreyPackage, signal?: AbortSignal) => Promise<MakerAnswer>;

/** What installing a package.json changed by hand did (Q536, Q540), for the notices. */
export type SyncReport = {
  /** The packages its new lines installed, with the doubts of those in the grey zone. */
  installed: { name: string; version: string; doubts: Doubt[] }[];
  /** The lines Spaka took out of package.json, and why. */
  refused: { name: string; specifier: string; why: Refused }[];
  /** The packages its removed lines took out. */
  removed: string[];
  /** Why nothing was installed: pnpm's error, or a service out of reach. */
  failed?: string;
  /** What Spaka put right in the project first (its .npmrc, devEngines). */
  notes: string[];
};
export type Refused =
  | { kind: "rules"; refusals: Refusal[] }
  | { kind: "problem"; text: string }
  /** A git repository, a folder, an address: not npm's registry (Q502 brings them later). */
  | { kind: "elsewhere" };

/** One flaw of an installed version, with the website's own packages that bring it. */
export type FoundFlaw = { name: string; version: string; flaw: Flaw; via: string[] };

type Manifest = Record<string, unknown> & Partial<Record<DependencyField, Record<string, string>>>;

/** The dependencies package.json asks for, by name. */
function wantedOf(json: Manifest): Map<string, { specifier: string; field: DependencyField }> {
  const wanted = new Map<string, { specifier: string; field: DependencyField }>();
  for (const field of DEPENDENCY_FIELDS) {
    const deps = json[field];
    if (deps && typeof deps === "object")
      for (const [name, specifier] of Object.entries(deps))
        if (!wanted.has(name)) wanted.set(name, { specifier: String(specifier), field });
  }
  return wanted;
}

/** Whether a line of package.json asks npm's registry: a version, a range or a tag. */
const fromRegistry = (specifier: string) =>
  semver.validRange(specifier) !== null || /^[a-z][a-z0-9._-]*$/i.test(specifier);

const writeJson = (file: string, json: unknown) => writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);

/** What pnpm said went wrong, in a line or two. */
const pnpmError = (run: PnpmRun) =>
  run.report.errors.map((e) => e.message.trim().split("\n")[0]).join(" ") ||
  `pnpm stopped with code ${run.code ?? "none"}.`;

/** Where a site's own modules import a package: scripts/ for the browser, server/ for its server (Q508). */
function importsIn(dir: string, extensions: RegExp): Set<string> {
  const names = new Set<string>();
  const walk = (folder: string, depth: number) => {
    if (depth > 6 || !existsSync(folder)) return;
    for (const entry of readdirSync(folder)) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const path = join(folder, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path, depth + 1);
      else if (extensions.test(entry) && stat.size < 2_000_000)
        for (const match of readFileSync(path, "utf8").matchAll(
          /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"'./][^"']*)["']/g,
        )) {
          const specifier = match[1] ?? "";
          const parts = specifier.split("/");
          names.add(specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? ""));
        }
    }
  };
  walk(dir, 0);
  return names;
}

export class Packages {
  /** One install at a time in a project, whoever asked for it. */
  private readonly queues = new Map<string, Promise<unknown>>();
  /** The projects pnpm is changing now, their package.json and lockfile not yet in step. */
  private readonly running = new Map<string, number>();

  constructor(private readonly o: PackagesOptions) {}

  private now() {
    return this.o.now?.() ?? Date.now();
  }

  private serial<T>(projectDir: string, work: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(projectDir) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        this.running.set(projectDir, (this.running.get(projectDir) ?? 0) + 1);
        try {
          return await work();
        } finally {
          const left = (this.running.get(projectDir) ?? 1) - 1;
          if (left) this.running.set(projectDir, left);
          else this.running.delete(projectDir);
        }
      });
    this.queues.set(
      projectDir,
      run.catch(() => undefined),
    );
    return run;
  }

  private pnpm(projectDir: string, command: "add" | "remove" | "install", specs: string[], signal?: AbortSignal) {
    return pnpmInProject(command, specs, {
      projectDir,
      folders: this.o.folders,
      nodeBinDir: this.o.nodeBinDir,
      ...(this.o.env ? { env: this.o.env } : {}),
      ...(signal ? { signal } : {}),
      ...(this.o.download ? { download: this.o.download } : {}),
    });
  }

  private async signals(name: string, wanted: string | undefined) {
    return readSignals(name, wanted, { fetch: this.o.fetch ?? fetch, now: this.now() });
  }

  /**
   * add_package (Q491): the newest version the rules allow, within `wanted`
   * if given, judged, the maker asked in the grey zone, installed; the answer
   * for the agent.
   */
  async add(
    projectDir: string,
    name: string,
    wanted: string | undefined,
    ask: AskMaker,
    signal?: AbortSignal,
  ): Promise<string> {
    try {
      packageSpec(name);
    } catch (error) {
      return (error as Error).message;
    }
    let read: Awaited<ReturnType<Packages["signals"]>>;
    try {
      read = await this.signals(name, wanted);
    } catch (error) {
      if (error instanceof Unreachable) return error.message;
      throw error;
    }
    if ("problem" in read) return read.problem;
    const { signals } = read;
    const verdict = judge(signals, this.now());
    if (verdict.kind === "refused") return refusedAnswer(signals, verdict.refusals);
    if (verdict.kind === "ask") {
      const answer = await ask(
        {
          name,
          version: signals.version,
          ...(signals.description ? { description: signals.description } : {}),
          doubts: verdict.doubts,
        },
        signal,
      );
      if (!answer) return `The maker did not answer about ${name}: it is not installed.`;
      if (!answer.install)
        return `The maker chose not to install ${name}${answer.words ? `, and said: ${answer.words}` : "."} Go on without it, or ask them about another package.`;
    }
    const before = readLockfile(projectDir).direct.find((d) => d.name === name);
    if (before && bareVersion(before.version) === signals.version)
      return `${name} ${signals.version} is already installed.`;
    const run = await this.serial(projectDir, () =>
      this.pnpm(projectDir, "add", [packageSpec(name, signals.version)], signal),
    );
    if (!run.ok) return `pnpm could not install ${name} ${signals.version}: ${pnpmError(run)}`;
    return installedAnswer(signals, before, run, verdict.kind === "ask" ? verdict.doubts : []);
  }

  /** remove_package and the settings' Remove (Q491, Q520): the package out of package.json and node_modules. */
  async remove(projectDir: string, name: string, signal?: AbortSignal): Promise<{ ok: boolean; text: string }> {
    const json = readManifest(projectDir);
    if (!json || !wantedOf(json).has(name)) return { ok: false, text: `${name} is not one of the website's packages.` };
    const run = await this.serial(projectDir, () => this.pnpm(projectDir, "remove", [name], signal));
    if (!run.ok) return { ok: false, text: `pnpm could not remove ${name}: ${pnpmError(run)}` };
    return { ok: true, text: [`Removed ${name}.`, ...run.notes].join("\n\n") };
  }

  /**
   * After the agent wrote package.json itself (Q536): its dependencies put
   * back as installed, and a note sending it to add_package and remove_package.
   */
  putBackAfterAgent(projectDir: string): string | undefined {
    const file = join(projectDir, "package.json");
    // add_package at work at the same time: what pnpm writes is not the agent's.
    if (this.running.has(projectDir) || !existsSync(file)) return undefined;
    let json: Manifest;
    try {
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return "package.json no longer reads as JSON: write it again. Its dependencies stay as Spaka installed them.";
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) return undefined;
    const locked = readLockfile(projectDir).direct;
    const wanted = wantedOf(json);
    const added = [...wanted].filter(([name, w]) => {
      const was = locked.find((d) => d.name === name);
      return !was || was.specifier !== w.specifier || was.field !== w.field;
    });
    const removed = locked.filter((d) => !wanted.has(d.name));
    if (!added.length && !removed.length) return undefined;
    for (const field of DEPENDENCY_FIELDS) {
      const deps = Object.fromEntries(locked.filter((d) => d.field === field).map((d) => [d.name, d.specifier]));
      if (Object.keys(deps).length) json[field] = deps;
      else delete json[field];
    }
    writeJson(file, json);
    const named = [
      ...added.map(([name, w]) => `${name} (${w.specifier})`),
      ...removed.map((d) => `${d.name} taken out`),
    ].join(", ");
    return `Spaka put package.json's dependencies back as installed (${named}): packages are added with add_package, which picks the version, checks it and asks the maker when in doubt, and taken out with remove_package.`;
  }

  /**
   * Installs a package.json changed by hand (Q491, Q536, Q540): each new line
   * judged by the rules, those refused taken out of the file, the grey zone
   * installed with its doubts said; nothing when it is as installed.
   */
  sync(projectDir: string): Promise<SyncReport | undefined> {
    return this.serial(projectDir, async () => {
      const json = readManifest(projectDir);
      if (json === null)
        return {
          installed: [],
          refused: [],
          removed: [],
          notes: [],
          failed: "package.json does not read as JSON: nothing was installed.",
        };
      const locked = readLockfile(projectDir).direct;
      const wanted = json ? wantedOf(json) : new Map<string, { specifier: string; field: DependencyField }>();
      const changed = [...wanted].filter(([name, w]) => {
        const was = locked.find((d) => d.name === name);
        return !was || was.specifier !== w.specifier;
      });
      const removed = locked.filter((d) => !wanted.has(d.name)).map((d) => d.name);
      if (!changed.length && !removed.length && installedAsLocked(projectDir)) return undefined;
      const report: SyncReport = { installed: [], refused: [], removed, notes: [] };
      const doubts = new Map<string, Doubt[]>();
      for (const [name, { specifier }] of changed) {
        let why: Refused | undefined;
        try {
          packageSpec(name);
        } catch (error) {
          why = { kind: "problem", text: (error as Error).message };
        }
        if (!why && !fromRegistry(specifier)) why = { kind: "elsewhere" };
        if (!why) {
          let read: Awaited<ReturnType<Packages["signals"]>>;
          try {
            read = await this.signals(name, specifier);
          } catch (error) {
            if (error instanceof Unreachable) return { ...report, failed: error.message };
            throw error;
          }
          if ("problem" in read) why = { kind: "problem", text: read.problem };
          else {
            const verdict = judge(read.signals, this.now());
            if (verdict.kind === "refused") why = { kind: "rules", refusals: verdict.refusals };
            else doubts.set(name, verdict.kind === "ask" ? verdict.doubts : []);
          }
        }
        if (why) report.refused.push({ name, specifier, why });
      }
      // What the rules refuse leaves package.json, so that the rest installs (Q540).
      if (json && report.refused.length) {
        for (const { name } of report.refused)
          for (const field of DEPENDENCY_FIELDS) {
            const deps = json[field];
            if (deps && typeof deps === "object" && name in deps) {
              delete deps[name];
              if (!Object.keys(deps).length) delete json[field];
            }
          }
        writeJson(join(projectDir, "package.json"), json);
      }
      const run = await this.pnpm(projectDir, "install", []);
      report.notes = run.notes;
      if (!run.ok) return { ...report, failed: pnpmError(run) };
      const now = readLockfile(projectDir).direct;
      report.installed = [...doubts].flatMap(([name, d]) => {
        const got = now.find((x) => x.name === name);
        return got ? [{ name, version: bareVersion(got.version), doubts: d }] : [];
      });
      return report;
    });
  }

  /** The site's packages for its settings (Q520): name, version, licence, source and side. */
  list(projectDir: string): PackageInfo[] {
    const json = readManifest(projectDir);
    if (!json) return [];
    const locked = readLockfile(projectDir).direct;
    const browser = importsIn(join(projectDir, "scripts"), /\.(m?js)$/);
    const server = importsIn(join(projectDir, "server"), /\.(m?[jt]s)$/);
    return [...wantedOf(json)]
      .map(([name, { specifier }]): PackageInfo => {
        const got = locked.find((d) => d.name === name);
        let license: string | undefined;
        try {
          const manifest = JSON.parse(readFileSync(join(projectDir, "node_modules", name, "package.json"), "utf8"));
          license = typeof manifest.license === "string" ? manifest.license : manifest.license?.type;
        } catch {}
        return {
          name,
          specifier,
          ...(got ? { version: bareVersion(got.version) } : {}),
          ...(license ? { license } : {}),
          source: "npm",
          sides: [...(browser.has(name) ? ["browser" as const] : []), ...(server.has(name) ? ["server" as const] : [])],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The known flaws of the installed versions, dependencies included (Q521). */
  async flaws(projectDir: string): Promise<FoundFlaw[]> {
    const { installed } = readLockfile(projectDir);
    if (!installed.length) return [];
    let found: Awaited<ReturnType<typeof scanFlaws>>;
    try {
      found = await scanFlaws(installed, this.o.fetch ?? fetch);
    } catch {
      throw new Unreachable("Spaka could not reach OSV, which lists packages' known flaws.");
    }
    return found.map((f) => ({
      ...f,
      via: installed.find((p) => p.name === f.name && p.version === f.version)?.via ?? [],
    }));
  }
}

const bareVersion = (version: string) => version.replace(/\(.*$/, "");

/** package.json, or undefined without one; null when it does not read as an object. */
function readManifest(projectDir: string): Manifest | undefined | null {
  const file = join(projectDir, "package.json");
  if (!existsSync(file)) return undefined;
  try {
    const json = JSON.parse(readFileSync(file, "utf8"));
    return json && typeof json === "object" && !Array.isArray(json) ? json : null;
  } catch {
    return null;
  }
}

/** Why Spaka refused a package, and what the agent may do instead. */
function refusedAnswer(signals: Signals, refusals: Refusal[]): string {
  const fixes = refusals.flatMap((r) => (r.kind === "flaw" && r.flaw.fixed ? [r.flaw.fixed] : []));
  const fix = fixes.sort(semver.rcompare)[0];
  const compiles = refusals.some((r) => r.kind === "compiles");
  return [
    `Spaka refused ${signals.name} ${signals.version}: ${refusals.map(refusalLine).join("; ")}.`,
    ...(fix && semver.gt(fix, signals.version)
      ? [`Ask for ${fix} or later, or for no version to get the newest Spaka allows.`]
      : []),
    ...(compiles ? ["Look for a package written in JavaScript that does the same."] : []),
  ].join(" ");
}

/** What add_package did, for the agent. */
function installedAnswer(
  signals: Signals,
  before: Direct | undefined,
  run: PnpmRun & { notes: string[] },
  doubts: Doubt[],
) {
  const { name, version, license, repository, provenance, installScripts } = signals;
  const what = before
    ? `Updated ${name} from ${bareVersion(before.version)} to ${version}`
    : `Installed ${name} ${version}`;
  const lines = [
    `${what}${license ? ` (${license})` : ""} in the website's node_modules${provenance && repository ? `, published with provenance from ${repository}` : ""}.`,
  ];
  if (doubts.length) lines.push(`The maker chose to install it although ${doubts.map(doubtLine).join(", ")}.`);
  const scripts = Object.entries(installScripts);
  if (scripts.length)
    lines.push(
      `Its ${scripts.map(([key]) => key).join(" and ")} script (${scripts.map(([, s]) => `\`${s}\``).join(", ")}) was not run: Spaka never runs install scripts.`,
    );
  if (run.report.warnings.length) lines.push(`pnpm said: ${run.report.warnings.join(" ")}`);
  return [...lines, ...run.notes].join("\n\n");
}
