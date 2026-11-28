// Whether Spaka installs a package (Q493, Q500, Q539), judged on free public
// signals: npm's registry (its dates, the version's install scripts and
// provenance), npm's weekly downloads, OSV's known flaws, deps.dev's licence
// and source repository, and the name against the most downloaded packages.
// Spaka picks the version: the newest its rules allow.
import semver from "semver";
import { similarName } from "./names";
import { type Flaw, flawOf, vulnsOf } from "./osv";

const REGISTRY = "https://registry.npmjs.org";
const DOWNLOADS = "https://api.npmjs.org/downloads/point/last-week";
const DEPS_DEV = "https://api.deps.dev/v3/systems/npm/packages";

const DAY = 86_400_000;
/** Every version installed is at least this old, dependencies included (Q500): pnpm's minimum release age. */
export const MINIMUM_AGE_DAYS = 7;
/** A package younger than this is put to the maker (Q500). */
const YOUNG_DAYS = 90;
/** As is one downloaded fewer times a week. */
const FEW_DOWNLOADS = 1000;
const INSTALL_SCRIPTS = ["preinstall", "install", "postinstall"] as const;
/** What compiles native code when a package is installed (Q539). */
const COMPILES = /\b(node-gyp|prebuild-install|node-pre-gyp|cmake-js)\b/;

type Manifest = {
  version: string;
  license?: string | { type?: string };
  licenses?: { type?: string }[];
  description?: string;
  repository?: string | { url?: string };
  scripts?: Record<string, string>;
  gypfile?: boolean;
  deprecated?: string;
  dist?: { attestations?: { provenance?: unknown } };
};
export type Packument = {
  name: string;
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, Manifest>;
  time?: Record<string, string>;
  repository?: string | { url?: string };
  license?: string;
};

/** What the rules read of one version of a package. */
export type Signals = {
  name: string;
  version: string;
  license?: string;
  description?: string;
  /** When the package was first published, and this version. */
  created: string;
  published: string;
  weeklyDownloads: number;
  repository?: string;
  /** Published with a Sigstore provenance, from a build the registry can trace. */
  provenance: boolean;
  /** The install scripts it has, which Spaka never runs. */
  installScripts: Record<string, string>;
  /** What compiles native code when it is installed, if anything (Q539). */
  compiles?: string;
  flaws: Flaw[];
  /** The well-known package its name looks like. */
  similarTo?: string;
};

/** Why a package is refused (Q500, Q539). */
export type Refusal = { kind: "flaw"; flaw: Flaw } | { kind: "compiles"; script: string };
/** What puts a package to the maker (Q500). */
export type Doubt =
  | { kind: "young"; days: number }
  | { kind: "few-downloads"; downloads: number }
  | { kind: "similar"; to: string }
  | { kind: "no-repository" };

export type Verdict =
  | { kind: "accepted" }
  | { kind: "refused"; refusals: Refusal[] }
  | { kind: "ask"; doubts: Doubt[] };

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The newest version Spaka may install: within the range asked for, or no
 * newer than the one tagged latest; neither a pre-release (unless the range
 * names one) nor deprecated; published at least seven days ago.
 */
export function chooseVersion(
  doc: Packument,
  wanted: string | undefined,
  now: number,
): { version: string } | { problem: string } {
  const asked = wanted?.trim() || undefined;
  // A tag, such as "latest" or "next", names one version.
  const range = (asked && doc["dist-tags"]?.[asked]) || asked;
  if (range && !semver.validRange(range))
    return { problem: `"${range}" is not a version or a range of versions, such as 4.2.1 or ^4.` };
  const latest = doc["dist-tags"]?.latest;
  const versions = doc.versions ?? {};
  const matching = Object.keys(versions).filter((v) =>
    !semver.valid(v)
      ? false
      : range
        ? semver.satisfies(v, range)
        : !semver.prerelease(v) && (!latest || !semver.valid(latest) || semver.lte(v, latest)),
  );
  if (!matching.length)
    return { problem: range ? `${doc.name} has no version ${range}.` : `${doc.name} has no released version.` };
  const current = matching.filter((v) => !versions[v]?.deprecated);
  if (!current.length) {
    const newest = semver.rsort(matching)[0]!;
    return { problem: `${doc.name} ${newest} is deprecated: ${versions[newest]?.deprecated}` };
  }
  const published = (v: string) => Date.parse(doc.time?.[v] ?? "");
  const old = current.filter((v) => published(v) <= now - MINIMUM_AGE_DAYS * DAY);
  if (!old.length) {
    const newest = semver.rsort(current)[0]!;
    const at = published(newest);
    return {
      problem: Number.isNaN(at)
        ? `npm's registry gives no date for ${doc.name} ${newest}, and Spaka installs only versions at least ${MINIMUM_AGE_DAYS} days old.`
        : `${doc.name} ${newest} was published on ${day(at)}: Spaka installs a version once it is ${MINIMUM_AGE_DAYS} days old, here from ${day(at + MINIMUM_AGE_DAYS * DAY)}.`,
    };
  }
  return { version: semver.rsort(old)[0]! };
}

/** A repository's address as a person opens it: https, without git+ or .git. */
export function repositoryUrl(repository: Packument["repository"]): string | undefined {
  const raw = (typeof repository === "string" ? repository : repository?.url)?.trim();
  if (!raw) return undefined;
  const shorthand = /^(?:(github|gitlab|bitbucket):)?([\w.-]+\/[\w.-]+)$/.exec(raw);
  if (shorthand) {
    const host = { github: "github.com", gitlab: "gitlab.com", bitbucket: "bitbucket.org" }[shorthand[1] ?? "github"];
    return `https://${host}/${(shorthand[2] ?? "").replace(/\.git$/, "")}`;
  }
  return raw
    .replace(/^git\+/, "")
    .replace(/^(?:git|ssh):\/\/(?:git@)?/, "https://")
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git(#.*)?$/, "");
}

function licenseOf(manifest: Manifest, doc: Packument): string | undefined {
  const license = manifest.license ?? doc.license;
  if (typeof license === "string") return license;
  if (license?.type) return license.type;
  const old = manifest.licenses?.flatMap((l) => (l.type ? [l.type] : []));
  return old?.length ? old.join(" OR ") : undefined;
}

/** The services Spaka could not reach, named for the agent. */
export class Unreachable extends Error {}

/** How many times a service that says it was asked too much is asked again. */
const RETRIES = 2;

async function getJson(
  fetcher: typeof fetch,
  url: string,
  service: string,
): Promise<{ status: number; body: unknown }> {
  let response: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetcher(url, { headers: { accept: "application/json" } });
    } catch {
      throw new Unreachable(`Spaka could not reach ${service}: check the connection, then try again.`);
    }
    // Too many questions at once (npm's download counts take few a minute): asked again after the wait it says, twice at most.
    if (response.status !== 429 || attempt >= RETRIES) break;
    const wait = Number(response.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, Math.min(Number.isFinite(wait) && wait > 0 ? wait * 1000 : 2000, 10_000)));
  }
  if (response.status === 404) return { status: 404, body: undefined };
  if (!response.ok) throw new Unreachable(`${service} answered with an error (${response.status}): try again later.`);
  try {
    return { status: response.status, body: await response.json() };
  } catch {
    throw new Unreachable(`${service} sent an answer Spaka could not read: try again later.`);
  }
}

/** deps.dev's licence and source repository for a version, which it checks against the provenance: nothing if it cannot say. */
async function depsDev(fetcher: typeof fetch, name: string, version: string) {
  try {
    const response = await fetcher(`${DEPS_DEV}/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`);
    if (!response.ok) return {};
    const body = (await response.json()) as {
      licenses?: string[];
      links?: { label?: string; url?: string }[];
      relatedProjects?: { projectKey?: { id?: string }; relationType?: string; relationProvenance?: string }[];
    };
    const attested = body.relatedProjects?.find(
      (p) => p.relationType === "SOURCE_REPO" && p.relationProvenance === "SLSA_ATTESTATION",
    )?.projectKey?.id;
    const linked = body.links?.find((l) => l.label === "SOURCE_REPO")?.url;
    const licenses = body.licenses?.filter((l) => l && l !== "non-standard");
    return {
      license: licenses?.length ? licenses.join(" AND ") : undefined,
      repository: attested ? `https://${attested}` : repositoryUrl(linked),
    };
  } catch {
    return {};
  }
}

export type SignalsOptions = { fetch?: typeof fetch; now?: number };

/**
 * Reads the signals of the version Spaka would install of a package (the
 * newest its rules allow, within `wanted` if given), or says why there is none.
 */
export async function readSignals(
  name: string,
  wanted: string | undefined,
  options: SignalsOptions = {},
): Promise<{ signals: Signals } | { problem: string }> {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now();
  const path = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
  const registry = await getJson(fetcher, `${REGISTRY}/${path}`, "npm's registry");
  if (registry.status === 404 || !registry.body) return { problem: `npm's registry has no package named ${name}.` };
  const doc = registry.body as Packument;
  const chosen = chooseVersion(doc, wanted, now);
  if ("problem" in chosen) return chosen;
  const { version } = chosen;
  const manifest = doc.versions?.[version] as Manifest;
  const [downloads, vulns, checked] = await Promise.all([
    getJson(fetcher, `${DOWNLOADS}/${name}`, "npm's download counts"),
    vulnsOf(name, fetcher).catch(() => {
      throw new Unreachable("Spaka could not reach OSV, which lists packages' known flaws: try again later.");
    }),
    depsDev(fetcher, name, version),
  ]);
  const installScripts = Object.fromEntries(
    INSTALL_SCRIPTS.flatMap((key) => (manifest.scripts?.[key] ? [[key, manifest.scripts[key]]] : [])),
  );
  const compiles =
    Object.values(installScripts).find((script) => COMPILES.test(script)) ??
    (manifest.gypfile ? "node-gyp rebuild" : undefined);
  const similarTo = similarName(name);
  const repository = checked.repository ?? repositoryUrl(manifest.repository ?? doc.repository);
  const license = checked.license ?? licenseOf(manifest, doc);
  return {
    signals: {
      name,
      version,
      ...(license ? { license } : {}),
      ...(manifest.description ? { description: manifest.description } : {}),
      created: doc.time?.created ?? doc.time?.[version] ?? "",
      published: doc.time?.[version] ?? "",
      // The download counts know nothing of a package with none yet.
      weeklyDownloads: (downloads.body as { downloads?: number } | undefined)?.downloads ?? 0,
      ...(repository ? { repository } : {}),
      provenance: !!manifest.dist?.attestations?.provenance,
      installScripts,
      ...(compiles ? { compiles } : {}),
      flaws: vulns.flatMap((vuln) => flawOf(vuln, name, version) ?? []),
      ...(similarTo ? { similarTo } : {}),
    },
  };
}

/** Refused, put to the maker, or accepted (Q500, Q539). */
export function judge(signals: Signals, now = Date.now()): Verdict {
  const refusals: Refusal[] = [
    ...signals.flaws.map((flaw): Refusal => ({ kind: "flaw", flaw })),
    ...(signals.compiles ? [{ kind: "compiles", script: signals.compiles } as const] : []),
  ];
  if (refusals.length) return { kind: "refused", refusals };
  const days = Math.floor((now - Date.parse(signals.created)) / DAY);
  const doubts: Doubt[] = [
    ...(Number.isNaN(days) || days < YOUNG_DAYS
      ? [{ kind: "young", days: Number.isNaN(days) ? 0 : days } as const]
      : []),
    ...(signals.weeklyDownloads < FEW_DOWNLOADS
      ? [{ kind: "few-downloads", downloads: signals.weeklyDownloads } as const]
      : []),
    ...(signals.similarTo ? [{ kind: "similar", to: signals.similarTo } as const] : []),
    ...(signals.repository ? [] : [{ kind: "no-repository" } as const]),
  ];
  return doubts.length ? { kind: "ask", doubts } : { kind: "accepted" };
}

/** A flaw in a line: what it is, how bad, and the version that fixes it. */
export function flawLine(flaw: Flaw): string {
  const grade = flaw.malicious ? "a malicious version" : flaw.severity ? `${flaw.severity.toLowerCase()} severity` : "";
  return `${flaw.id}${grade ? ` (${grade})` : ""}: ${flaw.summary}${flaw.fixed ? `, fixed in ${flaw.fixed}` : ", not fixed yet"}`;
}

/** Why a package is refused, for the agent. */
export function refusalLine(refusal: Refusal): string {
  return refusal.kind === "flaw"
    ? `a known flaw, ${flawLine(refusal.flaw)}`
    : `it compiles native code when it is installed (${refusal.script}), which Spaka never runs, and a website's server modules cannot load such code`;
}

/** What puts a package to the maker, for the agent and the maker's card. */
export function doubtLine(doubt: Doubt): string {
  if (doubt.kind === "young")
    return doubt.days < 1 ? "it was first published today" : `it was first published ${doubt.days} days ago`;
  if (doubt.kind === "few-downloads")
    return `it was downloaded ${doubt.downloads.toLocaleString("en-US")} ${doubt.downloads === 1 ? "time" : "times"} last week`;
  if (doubt.kind === "similar") return `its name is close to ${doubt.to}, a well-known package`;
  return "it links to no source repository";
}
