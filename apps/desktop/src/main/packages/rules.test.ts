// The rules on answers recorded on 2026-11-27 from npm's registry (trimmed to
// a few versions), npm's download counts, OSV and deps.dev.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { oneEditApart, similarName } from "./names";
import { flawOf, type OsvVuln, scanFlaws } from "./osv";
import {
  chooseVersion,
  doubtLine,
  judge,
  type Packument,
  readSignals,
  refusalLine,
  repositoryUrl,
  type Signals,
  Unreachable,
} from "./rules";

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"));
const NOW = Date.parse("2026-11-27T12:00:00Z");
const DAY = 86_400_000;

/** A fetch that answers from the recorded files, and records what was asked. */
function recorded(extra: Record<string, unknown> = {}) {
  const asked: string[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetcher = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    asked.push(url);
    if (url in extra) return json(extra[url]);
    const registry = /^https:\/\/registry\.npmjs\.org\/(.+)$/.exec(url);
    if (registry) {
      try {
        return json(fixture(`${decodeURIComponent(registry[1] ?? "")}.registry.json`));
      } catch {
        return json({ error: "Not found" }, 404);
      }
    }
    const downloads = /^https:\/\/api\.npmjs\.org\/downloads\/point\/last-week\/(.+)$/.exec(url);
    if (downloads) {
      try {
        return json(fixture(`${downloads[1]}.downloads.json`));
      } catch {
        return json({ error: `package ${downloads[1]} not found` }, 404);
      }
    }
    if (url === "https://api.osv.dev/v1/query") {
      const name = JSON.parse(String(init?.body)).package.name;
      try {
        return json(fixture(`${name}.osv.json`));
      } catch {
        return json({});
      }
    }
    if (url === "https://api.osv.dev/v1/querybatch") return json(fixture("querybatch.json"));
    const vuln = /^https:\/\/api\.osv\.dev\/v1\/vulns\/(.+)$/.exec(url);
    if (vuln) {
      const all = [...fixture("lodash.osv.json").vulns, ...fixture("nanoid.osv.json").vulns] as OsvVuln[];
      return json(all.find((v) => v.id === decodeURIComponent(vuln[1] ?? "")));
    }
    if (url === "https://api.deps.dev/v3/systems/npm/packages/nanoid/versions/6.0.2")
      return json(fixture("nanoid.deps-dev.json"));
    if (url.startsWith("https://api.deps.dev/")) return json({ error: "not found" }, 404);
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  return { fetcher, asked };
}

async function signalsOf(name: string, wanted?: string, extra?: Record<string, unknown>) {
  const read = await readSignals(name, wanted, { fetch: recorded(extra).fetcher, now: NOW });
  if ("problem" in read) throw new Error(read.problem);
  return read.signals;
}

test("nanoid: the newest version, checked by deps.dev against its provenance, accepted", async () => {
  const signals = await signalsOf("nanoid");
  expect(signals).toMatchObject({
    name: "nanoid",
    version: "6.0.2",
    license: "MIT",
    repository: "https://github.com/ai/nanoid",
    provenance: true,
    installScripts: {},
    flaws: [],
  });
  expect(signals.weeklyDownloads).toBeGreaterThan(1_000_000);
  expect(signals.similarTo).toBeUndefined();
  expect(judge(signals, NOW)).toEqual({ kind: "accepted" });
});

test("an older nanoid asked for: its known flaws refuse it, each with the version that fixes it", async () => {
  const signals = await signalsOf("nanoid", "5.1.6");
  expect(signals.version).toBe("5.1.6");
  expect(signals.flaws.map((f) => [f.id, f.fixed])).toEqual([
    ["GHSA-28wg-ghj8-5hjv", "5.1.16"],
    ["GHSA-xwg4-73v4-xw9w", "5.1.11"],
  ]);
  const verdict = judge(signals, NOW);
  expect(verdict.kind).toBe("refused");
  if (verdict.kind !== "refused") return;
  expect(refusalLine(verdict.refusals[0]!)).toBe(
    "a known flaw, GHSA-28wg-ghj8-5hjv (high severity): nanoid: non-secure generators can loop indefinitely with negative size, fixed in 5.1.16",
  );
});

test("lodash: 4.18.1 fixed the last flaw and is accepted, 4.17.20 is refused", async () => {
  const signals = await signalsOf("lodash");
  expect(signals.version).toBe("4.18.1");
  expect(judge(signals, NOW)).toEqual({ kind: "accepted" });
  const old = await signalsOf("lodash", "4.17.20");
  expect(old.flaws.map((f) => f.id)).toContain("GHSA-29mw-wpgm-hmr9");
  expect(old.flaws.find((f) => f.id === "GHSA-29mw-wpgm-hmr9")?.fixed).toBe("4.17.21");
  expect(judge(old, NOW).kind).toBe("refused");
});

test("sqlite3 compiles native code when installed: refused (Q539)", async () => {
  const signals = await signalsOf("sqlite3");
  expect(signals.compiles).toBe("prebuild-install -r napi || node-gyp rebuild");
  const verdict = judge(signals, NOW);
  expect(verdict).toMatchObject({ kind: "refused", refusals: [{ kind: "compiles" }] });
});

test("core-js has an install script that compiles nothing: accepted, the script named", async () => {
  const signals = await signalsOf("core-js");
  // 4.0.0-alpha.1 is a pre-release: the newest released version is chosen.
  expect(signals.version).toBe("3.51.0");
  expect(signals.installScripts).toEqual({ postinstall: `node -e "try{require('./postinstall')}catch(e){}"` });
  expect(signals.compiles).toBeUndefined();
  expect(judge(signals, NOW)).toEqual({ kind: "accepted" });
});

test("a young package, barely downloaded, named like nanoid, with no repository: put to the maker", async () => {
  const doc: Packument = {
    name: "nanoidd",
    "dist-tags": { latest: "1.0.0" },
    versions: { "1.0.0": { version: "1.0.0", license: "MIT" } },
    time: { created: new Date(NOW - 30 * DAY).toISOString(), "1.0.0": new Date(NOW - 30 * DAY).toISOString() },
  };
  const signals = await signalsOf("nanoidd", undefined, {
    "https://registry.npmjs.org/nanoidd": doc,
    "https://api.npmjs.org/downloads/point/last-week/nanoidd": { downloads: 12, package: "nanoidd" },
  });
  const verdict = judge(signals, NOW);
  expect(verdict).toEqual({
    kind: "ask",
    doubts: [
      { kind: "young", days: 30 },
      { kind: "few-downloads", downloads: 12 },
      { kind: "similar", to: "nanoid" },
      { kind: "no-repository" },
    ],
  });
  if (verdict.kind === "ask")
    expect(verdict.doubts.map(doubtLine)).toEqual([
      "it was first published 30 days ago",
      "it was downloaded 12 times last week",
      "its name is close to nanoid, a well-known package",
      "it links to no source repository",
    ]);
});

test("a package npm's registry does not know, and services out of reach", async () => {
  expect(await readSignals("no-such-package-zz9", undefined, { fetch: recorded().fetcher, now: NOW })).toEqual({
    problem: "npm's registry has no package named no-such-package-zz9.",
  });
  const offline = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  await expect(readSignals("nanoid", undefined, { fetch: offline, now: NOW })).rejects.toBeInstanceOf(Unreachable);
  const { fetcher } = recorded();
  const noOsv = (async (url: string | URL, init?: RequestInit) =>
    String(url).startsWith("https://api.osv.dev/")
      ? new Response("", { status: 503 })
      : fetcher(url, init)) as typeof fetch;
  await expect(readSignals("nanoid", undefined, { fetch: noOsv, now: NOW })).rejects.toThrow(/OSV/);
});

test("the version chosen: within a range or a tag, never younger than seven days, nor deprecated", () => {
  const nanoid = fixture("nanoid.registry.json") as Packument;
  // 6.0.2 was published on 2026-10-05: three days later, 6.0.1 is the newest old enough.
  const published = Date.parse(nanoid.time!["6.0.2"]!);
  expect(chooseVersion(nanoid, undefined, published + 3 * DAY)).toEqual({ version: "6.0.1" });
  expect(chooseVersion(nanoid, "^5", NOW)).toEqual({ version: "5.1.16" });
  expect(chooseVersion(nanoid, "latest", NOW)).toEqual({ version: "6.0.2" });
  expect(chooseVersion(nanoid, "6.0.2", published + DAY)).toEqual({
    problem:
      "nanoid 6.0.2 was published on 2026-10-05: Spaka installs a version once it is 7 days old, here from 2026-10-12.",
  });
  expect(chooseVersion(nanoid, "^9", NOW)).toEqual({ problem: "nanoid has no version ^9." });
  expect(chooseVersion(nanoid, "not a range", NOW)).toEqual({
    problem: '"not a range" is not a version or a range of versions, such as 4.2.1 or ^4.',
  });
  const deprecated: Packument = {
    ...nanoid,
    versions: Object.fromEntries(
      Object.entries(nanoid.versions!).map(([v, m]) => [v, v.startsWith("6") ? { ...m, deprecated: "Use 7" } : m]),
    ),
  };
  expect(chooseVersion(deprecated, undefined, NOW)).toEqual({ version: "5.1.16" });
  expect(chooseVersion(deprecated, "^6", NOW)).toEqual({ problem: "nanoid 6.0.2 is deprecated: Use 7" });
});

test("a repository's address as a person opens it", () => {
  expect(repositoryUrl({ url: "git+https://github.com/ai/nanoid.git" })).toBe("https://github.com/ai/nanoid");
  expect(repositoryUrl("git://github.com/WiseLibs/better-sqlite3.git")).toBe(
    "https://github.com/WiseLibs/better-sqlite3",
  );
  expect(repositoryUrl("git@github.com:user/repo.git")).toBe("https://github.com/user/repo");
  expect(repositoryUrl("user/repo")).toBe("https://github.com/user/repo");
  expect(repositoryUrl("gitlab:user/repo")).toBe("https://gitlab.com/user/repo");
  expect(repositoryUrl({ url: " " })).toBeUndefined();
  expect(repositoryUrl(undefined)).toBeUndefined();
});

test("names like a well-known package's", () => {
  expect(oneEditApart("axois", "axios")).toBe(true);
  expect(oneEditApart("reactt", "react")).toBe(true);
  expect(oneEditApart("raect", "react")).toBe(true);
  expect(oneEditApart("lodahs", "lodash")).toBe(true);
  expect(oneEditApart("lodash", "lodash")).toBe(false);
  expect(oneEditApart("lodash", "ldoahs")).toBe(false);
  expect(similarName("axois")).toBe("axios");
  expect(similarName("reactdom")).toBe("react-dom");
  expect(similarName("types-node")).toBe("@types/node");
  expect(similarName("lodash")).toBeUndefined();
  expect(similarName("embla-carousel")).toBeUndefined();
  // Short names are one letter from many others by chance.
  expect(similarName("mz9")).toBeUndefined();
});

test("OSV ranges: introduced, fixed, last affected, and versions named one by one", () => {
  const vuln = (affected: OsvVuln["affected"]): OsvVuln => ({ id: "GHSA-x", summary: "A flaw", affected });
  const ranged = vuln([
    {
      package: { name: "a", ecosystem: "npm" },
      ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "1.2.0" }] }],
    },
    {
      package: { name: "a", ecosystem: "npm" },
      ranges: [{ type: "SEMVER", events: [{ introduced: "2.0.0" }, { last_affected: "2.1.0" }] }],
    },
    { package: { name: "b", ecosystem: "npm" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }] }] },
  ]);
  expect(flawOf(ranged, "a", "1.1.9")).toMatchObject({ id: "GHSA-x", fixed: "1.2.0", malicious: false });
  expect(flawOf(ranged, "a", "1.2.0")).toBeUndefined();
  expect(flawOf(ranged, "a", "2.1.0")).toMatchObject({ id: "GHSA-x" });
  expect(flawOf(ranged, "a", "2.1.0")?.fixed).toBeUndefined();
  expect(flawOf(ranged, "a", "2.1.1")).toBeUndefined();
  const listed: OsvVuln = {
    id: "MAL-2025-1",
    summary: "Malicious code in c",
    affected: [{ package: { name: "c", ecosystem: "npm" }, versions: ["4.1.1"] }],
  };
  expect(flawOf(listed, "c", "4.1.1")).toMatchObject({ malicious: true });
  expect(flawOf(listed, "c", "4.1.2")).toBeUndefined();
  expect(flawOf({ ...listed, withdrawn: "2025-01-01T00:00:00Z" }, "c", "4.1.1")).toBeUndefined();
});

test("the installed versions' flaws, in one batch, each flaw read once", async () => {
  const { fetcher, asked } = recorded();
  const found = await scanFlaws(
    [
      { name: "lodash", version: "4.17.21" },
      { name: "nanoid", version: "5.1.6" },
      { name: "nanoid", version: "6.0.2" },
    ],
    fetcher,
  );
  expect(found.map((f) => [f.name, f.version, f.flaw.id])).toEqual([
    ["lodash", "4.17.21", "GHSA-r5fr-rjxr-66jc"],
    ["lodash", "4.17.21", "GHSA-xxjr-mmjv-4gpg"],
    ["nanoid", "5.1.6", "GHSA-28wg-ghj8-5hjv"],
    ["nanoid", "5.1.6", "GHSA-xwg4-73v4-xw9w"],
  ]);
  expect(asked.filter((url) => url.includes("/vulns/"))).toHaveLength(4);
});

test("the doubts and refusals read for the agent", () => {
  const base: Signals = {
    name: "x",
    version: "1.0.0",
    created: new Date(NOW - 400 * DAY).toISOString(),
    published: new Date(NOW - 30 * DAY).toISOString(),
    weeklyDownloads: 5000,
    repository: "https://github.com/x/x",
    provenance: false,
    installScripts: {},
    flaws: [],
  };
  expect(judge(base, NOW)).toEqual({ kind: "accepted" });
  expect(judge({ ...base, created: new Date(NOW - 3600_000).toISOString() }, NOW)).toEqual({
    kind: "ask",
    doubts: [{ kind: "young", days: 0 }],
  });
  expect(doubtLine({ kind: "young", days: 0 })).toBe("it was first published today");
  expect(doubtLine({ kind: "few-downloads", downloads: 1 })).toBe("it was downloaded 1 time last week");
  expect(refusalLine({ kind: "compiles", script: "node-gyp rebuild" })).toMatch(/^it compiles native code/);
  const malicious = { id: "MAL-1", summary: "Malicious code in x", malicious: true };
  expect(refusalLine({ kind: "flaw", flaw: malicious })).toBe(
    "a known flaw, MAL-1 (a malicious version): Malicious code in x, not fixed yet",
  );
});
