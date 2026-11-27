// A template's packages checked online (Q542, Q546), on answers written here
// as npm's registry, its download counts, OSV and deps.dev give them: each
// package as add_package would judge it, with no doubt let pass, under an open
// licence; then the flaws of what they bring, from the lockfile.
import { describe, expect, test } from "vitest";
import { checkPackagesOnline, openLicence } from "./check-packages";
import type { TemplateFiles } from "./reader";

const NOW = Date.parse("2026-11-27T12:00:00Z");
const LONG_AGO = "2024-01-10T00:00:00Z";

type Package = { license?: string; created?: string; downloads?: number; repository?: boolean; deprecated?: string };

/** The services, answering for these packages; what was asked, by address. */
function services(packages: Record<string, Package>, flawed: Record<string, string> = {}) {
  const asked: string[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetcher = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    asked.push(url);
    const registry = /^https:\/\/registry\.npmjs\.org\/(.+)$/.exec(url)?.[1];
    if (registry) {
      const name = decodeURIComponent(registry);
      const p = packages[name];
      if (!p) return json({ error: "Not found" }, 404);
      return json({
        name,
        "dist-tags": { latest: "1.0.0" },
        versions: {
          "1.0.0": {
            name,
            version: "1.0.0",
            ...(p.license ? { license: p.license } : {}),
            ...(p.repository === false ? {} : { repository: { url: `git+https://github.com/example/${name}.git` } }),
            ...(p.deprecated ? { deprecated: p.deprecated } : {}),
          },
        },
        time: { created: p.created ?? LONG_AGO, "1.0.0": p.created ?? LONG_AGO },
      });
    }
    const downloads = /^https:\/\/api\.npmjs\.org\/downloads\/point\/last-week\/(.+)$/.exec(url)?.[1];
    if (downloads) return json({ downloads: packages[decodeURIComponent(downloads)]?.downloads ?? 50_000 });
    if (url === "https://api.osv.dev/v1/query") return json({});
    if (url === "https://api.osv.dev/v1/querybatch") {
      const { queries } = JSON.parse(String(init?.body)) as {
        queries: { package: { name: string }; version: string }[];
      };
      return json({
        results: queries.map((q) => {
          const id = flawed[`${q.package.name}@${q.version}`];
          return id ? { vulns: [{ id }] } : {};
        }),
      });
    }
    const vuln = /^https:\/\/api\.osv\.dev\/v1\/vulns\/(.+)$/.exec(url)?.[1];
    if (vuln)
      return json({
        id: vuln,
        summary: "Prototype pollution",
        database_specific: { severity: "HIGH" },
        affected: [
          {
            package: { name: "tiny-util", ecosystem: "npm" },
            ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "2.0.1" }] }],
          },
        ],
      });
    if (url.startsWith("https://api.deps.dev/")) return json({ error: "not found" }, 404);
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  return { fetcher, asked };
}

/** A template's package.json and lockfile, with what each brings. */
function template(dependencies: Record<string, string>, brought: Record<string, string> = {}): TemplateFiles {
  const lock = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
${Object.entries(dependencies)
  .map(([n, v]) => `      ${n}:\n        specifier: ${v}\n        version: ${v}\n`)
  .join("")}
packages:

snapshots:

${Object.entries(dependencies)
  .map(
    ([n, v]) =>
      `  ${n}@${v}:\n${
        Object.keys(brought).length
          ? `    dependencies:\n${Object.entries(brought)
              .map(([b, bv]) => `      ${b}: ${bv}\n`)
              .join("")}`
          : ""
      }`,
  )
  .join("\n")}
${Object.entries(brought)
  .map(([b, bv]) => `  ${b}@${bv}: {}\n`)
  .join("\n")}`;
  return new Map([
    ["package.json", Buffer.from(JSON.stringify({ private: true, type: "module", dependencies }))],
    ["pnpm-lock.yaml", Buffer.from(lock)],
  ]);
}

describe("a template's packages, online", () => {
  test("a package Spaka's rules accept with no doubt, under an open licence, brings nothing flawed: no error", async () => {
    const { fetcher } = services({ "pebble-glider": { license: "MIT" }, "tiny-util": { license: "ISC" } });
    expect(
      await checkPackagesOnline(template({ "pebble-glider": "1.0.0" }, { "tiny-util": "2.0.0" }), {
        fetch: fetcher,
        now: NOW,
      }),
    ).toEqual([]);
  });

  test("a doubt the maker would answer, a licence that is not open, or none, is an error", async () => {
    const { fetcher } = services({
      young: { license: "MIT", created: "2026-10-30T00:00:00Z" },
      quiet: { license: "MIT", downloads: 12 },
      closed: { license: "GPL-3.0-only" },
      bare: { repository: false },
    });
    const errors = await checkPackagesOnline(
      template({ young: "1.0.0", quiet: "1.0.0", closed: "1.0.0", bare: "1.0.0" }),
      {
        fetch: fetcher,
        now: NOW,
      },
    );
    // In the order of their names, as package.json is read.
    expect(errors).toEqual([
      expect.stringMatching(
        /^package\.json: bare 1\.0\.0 would be put to the maker \(it links to no source repository\)/,
      ),
      expect.stringMatching(/^package\.json: bare: it has no licence/),
      expect.stringMatching(/^package\.json: closed: GPL-3\.0-only is not an open licence \(MIT, ISC/),
      expect.stringMatching(
        /^package\.json: quiet 1\.0\.0 would be put to the maker \(it was downloaded 12 times last week\)/,
      ),
      expect.stringMatching(
        /^package\.json: young 1\.0\.0 would be put to the maker \(it was first published 28 days ago\): a template's packages leave no doubt\.$/,
      ),
    ]);
  });

  test("a version npm deprecated, or that it does not have, is an error", async () => {
    const { fetcher } = services({ old: { license: "MIT", deprecated: "use new" } });
    const errors = await checkPackagesOnline(template({ old: "1.0.0", gone: "1.0.0" }), { fetch: fetcher, now: NOW });
    expect(errors).toEqual([
      "package.json: gone 1.0.0: npm's registry has no package named gone.",
      "package.json: old 1.0.0: old 1.0.0 is deprecated: use new",
    ]);
  });

  test("a known flaw in what a package brings is an error, naming what brings it", async () => {
    const { fetcher } = services({ "pebble-glider": { license: "MIT" } }, { "tiny-util@2.0.0": "GHSA-0000-1111-2222" });
    const errors = await checkPackagesOnline(template({ "pebble-glider": "1.0.0" }, { "tiny-util": "2.0.0" }), {
      fetch: fetcher,
      now: NOW,
    });
    expect(errors).toEqual([
      "pnpm-lock.yaml: tiny-util 2.0.0, which pebble-glider brings, has a known flaw, GHSA-0000-1111-2222 (high severity): Prototype pollution, fixed in 2.0.1.",
    ]);
  });

  test("a template without packages asks nothing", async () => {
    const { fetcher, asked } = services({});
    expect(await checkPackagesOnline(new Map(), { fetch: fetcher, now: NOW })).toEqual([]);
    expect(asked).toEqual([]);
  });

  test("an open licence, alone or among the choices of an SPDX expression", () => {
    expect(openLicence("MIT")).toBe(true);
    expect(openLicence("(MIT OR GPL-3.0)")).toBe(true);
    expect(openLicence("GPL-3.0 OR AGPL-3.0")).toBe(false);
    expect(openLicence(undefined)).toBe(false);
  });
});
