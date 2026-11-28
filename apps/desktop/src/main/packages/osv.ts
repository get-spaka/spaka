// The known flaws of npm packages, from OSV (osv.dev): GitHub's advisories
// and the malicious packages OpenSSF lists. A package's flaws are read once
// with every version they touch, so that Spaka can say which version fixes
// one (Q500, Q521).
import semver from "semver";

const OSV = "https://api.osv.dev/v1";

/** A known flaw of one version of a package. */
export type Flaw = {
  /** GHSA-…, or MAL-… for a malicious package. */
  id: string;
  summary: string;
  /** GitHub's grade: LOW, MODERATE, HIGH or CRITICAL. */
  severity?: string;
  /** The first version after this one without the flaw, if there is one. */
  fixed?: string;
  malicious: boolean;
};

type OsvEvent = { introduced?: string; fixed?: string; last_affected?: string; limit?: string };
type OsvAffected = {
  package?: { name?: string; ecosystem?: string };
  ranges?: { type?: string; events?: OsvEvent[] }[];
  versions?: string[];
};
export type OsvVuln = {
  id: string;
  summary?: string;
  details?: string;
  withdrawn?: string;
  database_specific?: { severity?: string };
  affected?: OsvAffected[];
};

/** A version as semver reads it; "0" is before every version. */
const ordered = (version: string) =>
  version === "0" ? "0.0.0-0" : (semver.valid(version) ?? semver.coerce(version)?.version ?? "0.0.0-0");

const compare = (a: string, b: string) => semver.compare(ordered(a), ordered(b));

/** Whether one OSV range touches the version: its events read in order (OSV's rule). */
function inRange(events: OsvEvent[], version: string): boolean {
  const points = events
    .map((event) => ({ event, at: event.introduced ?? event.fixed ?? event.last_affected ?? event.limit }))
    .filter((point): point is { event: OsvEvent; at: string } => point.at !== undefined)
    .sort((a, b) => compare(a.at, b.at));
  let affected = false;
  for (const { event } of points) {
    if (event.introduced !== undefined && compare(version, event.introduced) >= 0) affected = true;
    else if (event.fixed !== undefined && compare(version, event.fixed) >= 0) affected = false;
    else if (event.last_affected !== undefined && compare(version, event.last_affected) > 0) affected = false;
    else if (event.limit !== undefined && compare(version, event.limit) >= 0) affected = false;
  }
  return affected;
}

/** The flaw a vulnerability is for this version of this package, if it touches it. */
export function flawOf(vuln: OsvVuln, name: string, version: string): Flaw | undefined {
  if (vuln.withdrawn) return undefined;
  const entries = (vuln.affected ?? []).filter((a) => a.package?.ecosystem === "npm" && a.package.name === name);
  let touched = false;
  const fixes: string[] = [];
  for (const entry of entries) {
    if (entry.versions?.includes(version)) touched = true;
    for (const range of entry.ranges ?? []) {
      if (range.type !== "SEMVER" && range.type !== "ECOSYSTEM") continue;
      const events = range.events ?? [];
      if (!inRange(events, version)) continue;
      touched = true;
      for (const event of events) if (event.fixed && compare(event.fixed, version) > 0) fixes.push(event.fixed);
    }
  }
  if (!touched) return undefined;
  const fixed = fixes.sort(compare)[0];
  const summary = vuln.summary?.trim() || vuln.details?.trim().split("\n")[0] || vuln.id;
  return {
    id: vuln.id,
    summary,
    ...(vuln.database_specific?.severity ? { severity: vuln.database_specific.severity } : {}),
    ...(fixed ? { fixed } : {}),
    malicious: vuln.id.startsWith("MAL-"),
  };
}

/** Every known flaw of a package, with the versions it touches: one request, then the pages that follow. */
export async function vulnsOf(name: string, fetcher: typeof fetch = fetch): Promise<OsvVuln[]> {
  const vulns: OsvVuln[] = [];
  let page: string | undefined;
  for (let i = 0; i < 10; i++) {
    const response = await fetcher(`${OSV}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ package: { name, ecosystem: "npm" }, ...(page ? { page_token: page } : {}) }),
    });
    if (!response.ok) throw new Error(`OSV answered ${response.status}`);
    const body = (await response.json()) as { vulns?: OsvVuln[]; next_page_token?: string };
    vulns.push(...(body.vulns ?? []));
    page = body.next_page_token;
    if (!page) break;
  }
  return vulns;
}

/** One installed package, at the version installed. */
export type Installed = { name: string; version: string };

/**
 * The known flaws of installed packages, dependencies included: OSV's batch
 * query names the flaws of each version, then each flaw is read once for its
 * summary and the version that fixes it.
 */
export async function scanFlaws(
  installed: Installed[],
  fetcher: typeof fetch = fetch,
): Promise<{ name: string; version: string; flaw: Flaw }[]> {
  const found: { name: string; version: string; ids: string[] }[] = [];
  // OSV takes up to 1,000 queries a batch.
  for (let at = 0; at < installed.length; at += 1000) {
    const slice = installed.slice(at, at + 1000);
    const response = await fetcher(`${OSV}/querybatch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        queries: slice.map((p) => ({ package: { name: p.name, ecosystem: "npm" }, version: p.version })),
      }),
    });
    if (!response.ok) throw new Error(`OSV answered ${response.status}`);
    const body = (await response.json()) as { results?: { vulns?: { id: string }[] }[] };
    (body.results ?? []).forEach((result, i) => {
      const ids = (result.vulns ?? []).map((v) => v.id);
      const asked = slice[i];
      if (asked && ids.length) found.push({ ...asked, ids });
    });
  }
  const details = new Map<string, OsvVuln>();
  for (const id of new Set(found.flatMap((f) => f.ids))) {
    const response = await fetcher(`${OSV}/vulns/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(`OSV answered ${response.status}`);
    details.set(id, (await response.json()) as OsvVuln);
  }
  return found.flatMap(({ name, version, ids }) =>
    ids.flatMap((id) => {
      const vuln = details.get(id);
      const flaw = vuln && flawOf(vuln, name, version);
      return flaw ? [{ name, version, flaw }] : [];
    }),
  );
}
