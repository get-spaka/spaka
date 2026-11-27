// A template's packages, checked online (template:check, the templates'
// release; Q542, Q546): what Spaka's rules say of each package its
// package.json lists, as add_package would judge it, with no doubt let pass
// since no maker is there to answer, under an open licence; then the known
// flaws of every package its lockfile installs. checkTemplate() checks the
// rest offline: exact versions, the lockfile, the imports.
import { lockfileOf } from "../packages/lockfile";
import { scanFlaws } from "../packages/osv";
import { doubtLine, flawLine, judge, readSignals, refusalLine } from "../packages/rules";
import { EXACT_VERSION } from "./check";
import { OPEN_LICENCES } from "./manifest";
import { type TemplateFiles, templatePackages } from "./reader";

export type OnlineOptions = { fetch?: typeof fetch; now?: number };

/** Whether a package's licence, maybe an SPDX expression ("MIT OR Apache-2.0"), lets it be taken under an open one. */
export function openLicence(license: string | undefined): boolean {
  if (!license) return false;
  const choices = license.replace(/[()]/g, "").split(/\s+OR\s+/i);
  return choices.some((c) => (OPEN_LICENCES as readonly string[]).includes(c.trim()));
}

/**
 * What the rules say of each version, once a run: the templates of a release
 * share their packages, and npm's download counts take few questions a minute.
 */
const judged = new Map<string, Promise<string[]>>();

/** Its packages' problems, as Spaka's rules and OSV say; none when it has no packages. Throws when a service cannot be reached. */
export async function checkPackagesOnline(files: TemplateFiles, options: OnlineOptions = {}): Promise<string[]> {
  const errors: string[] = [];
  const packages = templatePackages(files).filter((p) => EXACT_VERSION.test(p.version));
  if (!packages.length) return errors;
  for (const { name, version } of packages) {
    // Kept only for the run's own fetch: a check given another one asks again.
    const key = options.fetch ? undefined : `${name}@${version}`;
    let verdict = key ? judged.get(key) : undefined;
    if (!verdict) {
      verdict = judgePackage(name, version, options);
      if (key) {
        judged.set(key, verdict);
        verdict.catch(() => judged.delete(key));
      }
    }
    errors.push(...(await verdict));
  }
  // The packages they bring: their own flaws were read above.
  const lock = files.get("pnpm-lock.yaml")?.toString("utf8");
  if (lock) {
    const direct = new Set(packages.map((p) => `${p.name}@${p.version}`));
    const brought = lockfileOf(lock).installed.filter((p) => !direct.has(`${p.name}@${p.version}`));
    for (const { name, version, flaw } of await scanFlaws(brought, options.fetch ?? fetch)) {
      const via = brought.find((p) => p.name === name && p.version === version)?.via ?? [];
      errors.push(
        `pnpm-lock.yaml: ${name} ${version}${via.length ? `, which ${via.join(" and ")} ${via.length > 1 ? "bring" : "brings"},` : ""} has a known flaw, ${flawLine(flaw)}.`,
      );
    }
  }
  return errors;
}

/** What Spaka's rules say of one version, as a template's error lines. */
async function judgePackage(name: string, version: string, options: OnlineOptions): Promise<string[]> {
  const errors: string[] = [];
  const now = options.now ?? Date.now();
  const read = await readSignals(name, version, { ...(options.fetch ? { fetch: options.fetch } : {}), now });
  if ("problem" in read) return [`package.json: ${name} ${version}: ${read.problem}`];
  const { signals } = read;
  const verdict = judge(signals, now);
  if (verdict.kind === "refused")
    for (const refusal of verdict.refusals)
      errors.push(`package.json: ${name} ${version} is refused: ${refusalLine(refusal)}.`);
  else if (verdict.kind === "ask")
    errors.push(
      `package.json: ${name} ${version} would be put to the maker (${verdict.doubts.map(doubtLine).join("; ")}): a template's packages leave no doubt.`,
    );
  if (!openLicence(signals.license))
    errors.push(
      `package.json: ${name}: ${signals.license ? `${signals.license} is not an open licence` : "it has no licence"} (${OPEN_LICENCES.join(", ")}).`,
    );
  return errors;
}
