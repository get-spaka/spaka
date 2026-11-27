// A website's packages: add_package and remove_package, the agent's own
// writes put back, a package.json changed by hand installed by the rules,
// the settings' list and the known flaws. pnpm is played by a small script
// that writes package.json and the lockfile as pnpm does; the services answer
// from the recorded files of rules.test.ts.
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { installedAsLocked, readLockfile, readYamlMaps } from "./lockfile";
import { type AskMaker, type GreyPackage, Packages } from "./packages";
import { pnpmFolders } from "./pnpm";

const NOW = Date.parse("2026-11-27T12:00:00Z");
const DAY = 86_400_000;
const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"));

/** A pnpm that installs nothing, writing package.json and the lockfile as pnpm does. */
const FAKE_PNPM = join(__dirname, "fixtures", "fake-pnpm.cjs");

/** The recorded services, and a package of no renown for the grey zone. */
function services(): typeof fetch {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const grey = {
    name: "nanoidd",
    "dist-tags": { latest: "1.0.0" },
    versions: { "1.0.0": { version: "1.0.0", license: "MIT" } },
    time: { created: new Date(NOW - 30 * DAY).toISOString(), "1.0.0": new Date(NOW - 30 * DAY).toISOString() },
  };
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const registry = /^https:\/\/registry\.npmjs\.org\/(.+)$/.exec(url)?.[1];
    if (registry === "nanoidd") return json(grey);
    if (registry) {
      try {
        return json(fixture(`${decodeURIComponent(registry)}.registry.json`));
      } catch {
        return json({ error: "Not found" }, 404);
      }
    }
    const downloads = /last-week\/(.+)$/.exec(url)?.[1];
    if (downloads === "nanoidd") return json({ downloads: 3 });
    if (downloads) return json(fixture(`${downloads}.downloads.json`));
    if (url === "https://api.osv.dev/v1/query") {
      try {
        return json(fixture(`${JSON.parse(String(init?.body)).package.name}.osv.json`));
      } catch {
        return json({});
      }
    }
    if (url === "https://api.osv.dev/v1/querybatch") {
      const { queries } = JSON.parse(String(init?.body));
      const batch = fixture("querybatch.json").results as unknown[];
      const known = ["lodash@4.17.21", "nanoid@5.1.6", "nanoid@6.0.2"];
      return json({
        results: queries.map((q: { package: { name: string }; version: string }) => {
          const at = known.indexOf(`${q.package.name}@${q.version}`);
          return at >= 0 ? batch[at] : {};
        }),
      });
    }
    const vuln = /\/v1\/vulns\/(.+)$/.exec(url)?.[1];
    if (vuln)
      return json(
        [...fixture("lodash.osv.json").vulns, ...fixture("nanoid.osv.json").vulns].find((v) => v.id === vuln),
      );
    return json({}, 404);
  }) as typeof fetch;
}

let dir: string;
let project: string;
let packages: Packages;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "spaka-packages-"));
  project = join(dir, "site");
  mkdirSync(project);
  const folders = pnpmFolders(join(dir, "data"));
  mkdirSync(join(folders.program, ".."), { recursive: true });
  writeFileSync(folders.program, `#!${process.execPath}\nrequire(${JSON.stringify(FAKE_PNPM)});\n`);
  chmodSync(folders.program, 0o755);
  packages = new Packages({
    folders,
    nodeBinDir: join(dir, "bin"),
    env: { ...process.env, FAKE_VERSIONS: JSON.stringify({ "nanoid@^5": "5.1.16" }) },
    fetch: services(),
    now: () => NOW,
  });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const calls = () =>
  existsSync(join(project, "pnpm-calls.txt"))
    ? readFileSync(join(project, "pnpm-calls.txt"), "utf8").trim().split("\n")
    : [];
const manifest = () => JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
const never: AskMaker = async () => {
  throw new Error("asked");
};

const unix = test.skipIf(process.platform === "win32");

unix("add_package installs the version Spaka chose, exact, and answers with its licence and provenance", async () => {
  const answer = await packages.add(project, "nanoid", undefined, never);
  expect(answer).toMatch(
    /^Installed nanoid 6\.0\.2 \(MIT\) in the website's node_modules, published with provenance from https:\/\/github\.com\/ai\/nanoid\./,
  );
  // The project put right first (ADR 0013): a new package.json is private, and a module.
  expect(manifest()).toEqual({ private: true, type: "module", dependencies: { nanoid: "6.0.2" } });
  expect(calls()).toEqual(["add nanoid@6.0.2"]);
  expect(await packages.add(project, "nanoid", undefined, never)).toBe("nanoid 6.0.2 is already installed.");
  expect(await packages.add(project, "nanoid", "^5", never)).toMatch(/^Updated nanoid from 6\.0\.2 to 5\.1\.16/);
  expect(await packages.remove(project, "nanoid")).toEqual({ ok: true, text: "Removed nanoid." });
  expect(manifest().dependencies).toEqual({});
  expect(await packages.remove(project, "nanoid")).toEqual({
    ok: false,
    text: "nanoid is not one of the website's packages.",
  });
});

unix("add_package refuses a flaw or native code, and installs nothing", async () => {
  expect(await packages.add(project, "nanoid", "5.1.6", never)).toBe(
    "Spaka refused nanoid 5.1.6: a known flaw, GHSA-28wg-ghj8-5hjv (high severity): nanoid: non-secure generators can loop indefinitely with negative size, fixed in 5.1.16; a known flaw, GHSA-xwg4-73v4-xw9w (high severity): nanoid: Integer Overflow or Wraparound, fixed in 5.1.11. Ask for 5.1.16 or later, or for no version to get the newest Spaka allows.",
  );
  const sqlite = await packages.add(project, "sqlite3", undefined, never);
  expect(sqlite).toMatch(/^Spaka refused sqlite3 6\.0\.1: it compiles native code when it is installed/);
  expect(sqlite).toMatch(/Look for a package written in JavaScript that does the same\.$/);
  expect(await packages.add(project, "Not A Name", undefined, never)).toBe(
    '"Not A Name" is not the name of a package on npm.',
  );
  expect(await packages.add(project, "no-such-package-zz9", undefined, never)).toBe(
    "npm's registry has no package named no-such-package-zz9.",
  );
  expect(calls()).toEqual([]);
});

unix("add_package asks the maker in the grey zone: installed on yes, not on no, nor without an answer", async () => {
  const asked: GreyPackage[] = [];
  const yes: AskMaker = async (grey) => {
    asked.push(grey);
    return { install: true };
  };
  expect(
    await packages.add(project, "nanoidd", undefined, async () => ({ install: false, words: "Not this one" })),
  ).toBe(
    "The maker chose not to install nanoidd, and said: Not this one Go on without it, or ask them about another package.",
  );
  expect(await packages.add(project, "nanoidd", undefined, async () => undefined)).toBe(
    "The maker did not answer about nanoidd: it is not installed.",
  );
  expect(calls()).toEqual([]);
  const answer = await packages.add(project, "nanoidd", undefined, yes);
  expect(asked[0]).toEqual({
    name: "nanoidd",
    version: "1.0.0",
    doubts: [
      { kind: "young", days: 30 },
      { kind: "few-downloads", downloads: 3 },
      { kind: "similar", to: "nanoid" },
      { kind: "no-repository" },
    ],
  });
  expect(answer).toMatch(/^Installed nanoidd 1\.0\.0 \(MIT\)/);
  expect(answer).toMatch(/The maker chose to install it although it was first published 30 days ago,/);
});

unix("what the agent writes in package.json's dependencies is put back, with a note (Q536)", async () => {
  await packages.add(project, "nanoid", undefined, never);
  const written = { ...manifest(), name: "bakery", dependencies: { "left-pad": "^1.3.0" } };
  writeFileSync(join(project, "package.json"), JSON.stringify(written));
  expect(packages.putBackAfterAgent(project)).toBe(
    "Spaka put package.json's dependencies back as installed (left-pad (^1.3.0), nanoid taken out): packages are added with add_package, which picks the version, checks it and asks the maker when in doubt, and taken out with remove_package.",
  );
  // Its other changes stay.
  expect(manifest()).toEqual({ private: true, type: "module", name: "bakery", dependencies: { nanoid: "6.0.2" } });
  expect(packages.putBackAfterAgent(project)).toBeUndefined();
  writeFileSync(join(project, "package.json"), "{ not json");
  expect(packages.putBackAfterAgent(project)).toMatch(/^package\.json no longer reads as JSON/);
});

unix(
  "a package.json changed by hand: refused lines taken out, the grey zone installed with its doubts (Q536, Q540)",
  async () => {
    writeFileSync(
      join(project, "package.json"),
      JSON.stringify({
        dependencies: { nanoid: "^5", sqlite3: "^6.0.0", nanoidd: "1.0.0", mine: "github:me/mine", lodash: "4.17.20" },
      }),
    );
    const report = await packages.sync(project);
    expect(report?.failed).toBeUndefined();
    expect(report?.refused.map((r) => [r.name, r.why.kind])).toEqual([
      ["sqlite3", "rules"],
      ["mine", "elsewhere"],
      ["lodash", "rules"],
    ]);
    expect(report?.installed).toEqual([
      { name: "nanoid", version: "5.1.16", doubts: [] },
      { name: "nanoidd", version: "1.0.0", doubts: expect.arrayContaining([{ kind: "no-repository" }]) },
    ]);
    expect(manifest()).toEqual({ type: "module", dependencies: { nanoid: "^5", nanoidd: "1.0.0" } });
    expect(calls()).toEqual(["install"]);
    // As installed now: nothing to do, and pnpm is not run again.
    expect(await packages.sync(project)).toBeUndefined();
    expect(calls()).toEqual(["install"]);
    // node_modules gone (a folder copied without it): installed again from the lockfile.
    rmSync(join(project, "node_modules"), { recursive: true });
    expect(installedAsLocked(project)).toBe(false);
    expect(await packages.sync(project)).toMatchObject({ installed: [], refused: [] });
    expect(calls()).toEqual(["install", "install"]);
  },
);

unix("a site without packages never runs pnpm; a package.json that does not read says so", async () => {
  expect(await packages.sync(project)).toBeUndefined();
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "bakery" }));
  expect(await packages.sync(project)).toBeUndefined();
  writeFileSync(join(project, "package.json"), "{");
  expect((await packages.sync(project))?.failed).toBe("package.json does not read as JSON: nothing was installed.");
  expect(calls()).toEqual([]);
});

unix("the settings' list: version, licence and the side that imports each package", async () => {
  await packages.add(project, "nanoid", undefined, never);
  await packages.add(project, "core-js", undefined, never);
  mkdirSync(join(project, "scripts"));
  writeFileSync(join(project, "scripts", "site.js"), 'import { nanoid } from "nanoid";\nimport "./local.js";\n');
  mkdirSync(join(project, "server"));
  writeFileSync(join(project, "server", "book.ts"), 'const { nanoid } = await import("nanoid/non-secure");\n');
  expect(packages.list(project)).toEqual([
    { name: "core-js", specifier: "3.51.0", version: "3.51.0", license: "MIT", source: "npm", sides: [] },
    {
      name: "nanoid",
      specifier: "6.0.2",
      version: "6.0.2",
      license: "MIT",
      source: "npm",
      sides: ["browser", "server"],
    },
  ]);
});

unix("the installed versions' flaws, with the website's packages that bring them", async () => {
  // Installed before its flaws were known: the lockfile pnpm wrote then.
  writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { nanoid: "5.1.6" } }));
  writeFileSync(
    join(project, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      nanoid:\n        specifier: 5.1.6\n        version: 5.1.6\n\nsnapshots:\n\n  nanoid@5.1.6: {}\n",
  );
  const flaws = await packages.flaws(project);
  expect(flaws.map((f) => [f.name, f.version, f.flaw.id, f.flaw.fixed, f.via])).toEqual([
    ["nanoid", "5.1.6", "GHSA-28wg-ghj8-5hjv", "5.1.16", ["nanoid"]],
    ["nanoid", "5.1.6", "GHSA-xwg4-73v4-xw9w", "5.1.11", ["nanoid"]],
  ]);
});

test("pnpm's lockfile read: the project's packages, and what brings each package installed", () => {
  cpSync(join(__dirname, "fixtures", "tools.pnpm-lock.yaml"), join(project, "pnpm-lock.yaml"));
  const { direct, installed } = readLockfile(project);
  expect(direct).toEqual([
    { name: "vite", specifier: "8.3.8", version: "8.3.8(esbuild@0.28.2)", field: "dependencies" },
    { name: "wrangler", specifier: "4.165.0", version: "4.165.0", field: "dependencies" },
  ]);
  const of = (name: string) => installed.find((p) => p.name === name);
  expect(of("vite")).toEqual({ name: "vite", version: "8.3.8", via: ["vite"] });
  expect(of("@cspotcode/source-map-support")).toMatchObject({ version: "0.8.1", via: ["wrangler"] });
  expect(of("esbuild")?.via).toEqual(["vite", "wrangler"]);
  expect(installed.length).toBeGreaterThan(50);
});

test("the lockfile's maps: quoted keys, values on their line, lists and one-line maps passed over", () => {
  expect(
    readYamlMaps(
      [
        "lockfileVersion: '9.0'",
        "packages:",
        "  '@a/b@1.0.0':",
        "    resolution: {integrity: sha512-x}",
        "    cpu: [arm64]",
        "  c@2.0.0: {}",
        "snapshots:",
        "  d@1.0.0:",
        "    transitivePeerDependencies:",
        "      - e",
        "    dependencies:",
        "      '@a/b': 1.0.0",
      ].join("\n"),
    ),
  ).toEqual({
    lockfileVersion: "9.0",
    packages: { "@a/b@1.0.0": { resolution: "{integrity: sha512-x}", cpu: "[arm64]" }, "c@2.0.0": {} },
    snapshots: { "d@1.0.0": { transitivePeerDependencies: {}, dependencies: { "@a/b": "1.0.0" } } },
  });
});
