import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, expect, test } from "vitest";
import {
  ensurePnpm,
  fileInTarball,
  integrityOf,
  packageSpec,
  pnpmEnv,
  pnpmFlags,
  pnpmFolders,
  readReport,
  runPnpm,
} from "./pnpm";

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/** One entry of a ustar archive. */
function tarEntry(name: string, body: Buffer, type = "0"): Buffer {
  const header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0);
  header.write("0000644\0", 100);
  header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
  header.write(type, 156);
  header.write("ustar\0", 257);
  header.write("00", 263);
  const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512);
  body.copy(padded);
  return Buffer.concat([header, padded]);
}
const tar = (...entries: Buffer[]) => Buffer.concat([...entries, Buffer.alloc(1024)]);

test("Spaka's pnpm and everything it writes live in the app's data folder", () => {
  const folders = pnpmFolders("/data", "darwin");
  // Written with the system's separator, as every path Spaka makes.
  expect(folders.program).toBe(join("/data", "tools", "pnpm-12.23.0", "pnpm"));
  expect(folders).toMatchObject({
    store: join("/data", "pnpm", "store"),
    config: join("/data", "pnpm", "config"),
    npmrc: join("/data", "pnpm", "npmrc"),
  });
  expect(pnpmFolders("/data", "win32").program.endsWith("pnpm.exe")).toBe(true);
});

test("an integrity is written as npm's registry writes it", () => {
  expect(integrityOf(Buffer.from("abc"))).toBe(
    "sha512-3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw==",
  );
});

test("a file is found in a tarball by its path, long names included", () => {
  const archive = tar(
    tarEntry("package/LICENSE", Buffer.from("MIT")),
    tarEntry("package/pnpm", Buffer.from("program")),
    tarEntry("././@LongLink", Buffer.from(`package/${"a".repeat(120)}\0`), "L"),
    tarEntry("ignored", Buffer.from("long")),
    tarEntry("PaxHeader", Buffer.from("30 path=package/from-pax.txt\n"), "x"),
    tarEntry("short", Buffer.from("pax")),
  );
  expect(fileInTarball(archive, "package/pnpm")?.toString()).toBe("program");
  expect(fileInTarball(archive, `package/${"a".repeat(120)}`)?.toString()).toBe("long");
  expect(fileInTarball(archive, "package/from-pax.txt")?.toString()).toBe("pax");
  expect(fileInTarball(archive, "package/pnpm.exe")).toBeUndefined();
});

test("a pnpm whose integrity is not the pinned one is refused and not kept; one download serves every caller", async () => {
  dir = mkdtempSync(join(tmpdir(), "spaka-pnpm-"));
  const folders = pnpmFolders(dir, "darwin");
  let calls = 0;
  const fake: typeof fetch = async () => {
    calls++;
    return new Response(gzipSync(tar(tarEntry("package/pnpm", Buffer.from("not pnpm")))));
  };
  const options = { fetch: fake, platform: "darwin" as const, arch: "arm64" };
  const both = await Promise.allSettled([ensurePnpm(folders, options), ensurePnpm(folders, options)]);
  expect(calls).toBe(1);
  for (const result of both) {
    expect(result.status).toBe("rejected");
    expect(String((result as PromiseRejectedResult).reason)).toMatch(/not the one this release of Spaka expects/);
  }
  expect(existsSync(folders.program)).toBe(false);
  await expect(ensurePnpm(folders, { fetch: fake, platform: "aix", arch: "ppc64" })).rejects.toThrow(
    /no pnpm for this system \(aix-ppc64\)/,
  );
});

test("pnpm's environment keeps nothing of npm, pnpm, Corepack, XDG or a CI, and finds only the system and Spaka's node", () => {
  const folders = pnpmFolders("/data", "darwin");
  const env = pnpmEnv(
    {
      HOME: "/Users/x",
      PATH: "/Users/x/.nvm/bin:/usr/bin",
      HTTPS_PROXY: "http://proxy:8080",
      npm_config_registry: "https://elsewhere",
      NPM_CONFIG_USERCONFIG: "/x",
      PNPM_HOME: "/Users/x/Library/pnpm",
      pnpm_config_store_dir: "/x",
      XDG_CONFIG_HOME: "/Users/x/.config",
      COREPACK_ENABLE_AUTO_PIN: "0",
      CI: "true",
      NODE_OPTIONS: "--require x",
      ELECTRON_RUN_AS_NODE: "1",
      ANTHROPIC_API_KEY: "k",
    },
    folders,
    "/data/bin",
    "darwin",
  );
  expect(env).toEqual({
    HOME: "/Users/x",
    HTTPS_PROXY: "http://proxy:8080",
    PNPM_HOME: join("/data", "pnpm", "home"),
    PNPM_CONFIG_HOME: join("/data", "pnpm", "config"),
    XDG_RUNTIME_DIR: join("/data", "pnpm", "run"),
    PATH: "/data/bin:/usr/bin:/bin:/usr/sbin:/sbin",
  });
  const windows = pnpmEnv({ Path: "C:\\nvm", SystemRoot: "C:\\Windows" }, folders, "C:\\data\\bin", "win32");
  expect(windows.Path).toBe("C:\\data\\bin;C:\\Windows\\System32;C:\\Windows;C:\\Windows\\System32\\Wbem");
  expect(windows).not.toHaveProperty("PATH");
});

test("every call carries Spaka's folders and settings, as the probe ran them", () => {
  const flags = pnpmFlags("/site", pnpmFolders("/data", "darwin"));
  expect(flags.slice(0, 3)).toEqual(["--dir", "/site", "--ignore-workspace"]);
  expect(flags).toEqual(
    expect.arrayContaining([
      "--store-dir",
      join("/data", "pnpm", "store"),
      "--npmrc-auth-file",
      join("/data", "pnpm", "npmrc"),
      "--registry=https://registry.npmjs.org/",
      "--config.ignore-scripts=true",
      "--config.ignore-pnpmfile=true",
      "--config.runtime=false",
      "--config.minimum-release-age=10080",
      "--config.minimum-release-age-strict=true",
      "--config.trust-policy=no-downgrade",
      "--config.node-linker=isolated",
      "--config.package-import-method=clone-or-copy",
    ]),
  );
});

test("only a name of npm's registry, with an exact version or none, reaches pnpm", () => {
  expect(packageSpec("motion")).toBe("motion");
  expect(packageSpec("@fontsource/inter", "5.2.8")).toBe("@fontsource/inter@5.2.8");
  for (const name of [
    "jsr:@std/path",
    "gh:owner/pkg",
    "crate:serde",
    "../x",
    "https://x.dev/y.tgz",
    "Motion",
    ".x",
    "",
  ])
    expect(() => packageSpec(name)).toThrow(/not the name of a package/);
  for (const name of ["npm", "node", "deno", "bun", "yarn"]) expect(() => packageSpec(name)).toThrow(/a program/);
  for (const version of ["^1.0.0", "latest", "1.x", "1.0"])
    expect(() => packageSpec("motion", version)).toThrow(/exact version/);
});

test("pnpm's ndjson gives the packages added and removed, its warnings and its errors", () => {
  const report = readReport(
    [
      '{"name":"pnpm:root","level":"debug","added":{"name":"nanoid","realName":"nanoid","version":"6.0.2","dependencyType":"prod"}}',
      '{"name":"pnpm:root","level":"debug","removed":{"name":"left-pad","version":"1.3.0","dependencyType":"prod"}}',
      '{"name":"pnpm:progress","level":"debug","status":"resolved"}',
      '{"name":"pnpm:install-check","level":"warn","message":"Unsupported engine for x"}',
      '[WARN] The "pnpm" field in package.json is no longer read by pnpm.',
      '{"name":"pnpm","level":"error","code":"ERR_PNPM_NO_MATURE_MATCHING_VERSION","message":"1 version does not meet the minimumReleaseAge constraint"}',
      "",
    ].join("\n"),
  );
  expect(report).toEqual({
    added: [{ name: "nanoid", version: "6.0.2" }],
    removed: [{ name: "left-pad", version: "1.3.0" }],
    warnings: ["Unsupported engine for x", 'The "pnpm" field in package.json is no longer read by pnpm.'],
    errors: [
      {
        code: "ERR_PNPM_NO_MATURE_MATCHING_VERSION",
        message: "1 version does not meet the minimumReleaseAge constraint",
      },
    ],
  });
});

test.skipIf(process.platform === "win32")(
  "pnpm runs in the project, with no terminal, its arguments and environment Spaka's",
  async () => {
    dir = mkdtempSync(join(tmpdir(), "spaka-pnpm-"));
    const program = join(dir, "fake-pnpm");
    const seen = join(dir, "seen.txt");
    writeFileSync(
      program,
      `#!/bin/sh\n{ pwd; echo "$@"; echo "$PNPM_HOME"; echo "$PATH"; [ -t 0 ] && echo tty || echo no-tty; } > ${JSON.stringify(seen)}\necho '{"name":"pnpm:root","added":{"name":"nanoid","version":"6.0.2"}}' >&2\n`,
    );
    chmodSync(program, 0o755);
    const folders = pnpmFolders(join(dir, "data"));
    const run = await runPnpm("add", ["nanoid"], { program, projectDir: dir, folders, nodeBinDir: "/spaka/bin" });
    expect(run).toMatchObject({ ok: true, code: 0, report: { added: [{ name: "nanoid", version: "6.0.2" }] } });
    const [cwd, args, home, path, tty] = readFileSync(seen, "utf8").trim().split("\n");
    expect(cwd).toMatch(/spaka-pnpm-/);
    expect(args).toMatch(/^add nanoid --save-exact --dir .* --reporter=ndjson$/);
    expect(home).toBe(folders.home);
    expect(path?.startsWith("/spaka/bin:")).toBe(true);
    expect(tty).toBe("no-tty");
    expect(readFileSync(folders.npmrc, "utf8")).toBe("");
  },
);

test.skipIf(process.platform === "win32")("pnpm's errors and a failed exit make the run fail", async () => {
  dir = mkdtempSync(join(tmpdir(), "spaka-pnpm-"));
  const program = join(dir, "fake-pnpm");
  writeFileSync(program, `#!/bin/sh\necho '{"name":"pnpm","level":"error","code":"E","message":"no"}' >&2\nexit 1\n`);
  chmodSync(program, 0o755);
  const run = await runPnpm("install", [], {
    program,
    projectDir: dir,
    folders: pnpmFolders(join(dir, "data")),
    nodeBinDir: "/spaka/bin",
  });
  expect(run).toMatchObject({ ok: false, code: 1, report: { errors: [{ code: "E", message: "no" }] } });
});
