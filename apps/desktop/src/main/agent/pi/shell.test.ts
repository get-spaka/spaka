import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { nodeLauncher, withPathFirst } from "../confinement";
import { findGitBash } from "../git-bash";
import { runShell, sandboxAvailable, sandboxProfile } from "./shell";

let dir: string | undefined;
let data: string | undefined;
afterEach(() => {
  for (const d of [dir, data]) if (d) rmSync(d, { recursive: true, force: true });
  dir = undefined;
  data = undefined;
});

const env = { PATH: "/usr/bin:/bin" };
/** A folder under the maker's home that the shell is let read: this app's own sources. */
const appDir = resolve(__dirname, "../../../..");

test("the profile lets the shell write the project and the temporary folders, and read the project and the folders given", () => {
  const profile = sandboxProfile({
    projectDir: "/tmp",
    readable: ["/Applications/Spaka.app"],
    skillsDir: "/nonexistent/skills",
  });
  expect(profile).toContain('(deny file-read* (subpath "/Users") (subpath "/Volumes"))');
  expect(profile).toContain('(subpath "/Applications/Spaka.app")');
  expect(profile).toContain('(deny file-write* (subpath "/nonexistent/skills"))');
});

test.runIf(sandboxAvailable())(
  "in the sandbox, a command writes in the project only, and reads none of the maker's other files",
  async () => {
    dir = mkdtempSync(join(tmpdir(), "spaka-shell-"));
    const place = { projectDir: dir, readable: [appDir] };
    const ok = await runShell("echo bonjour > note.txt && cat note.txt", place, env);
    expect(ok).toMatchObject({ code: 0, output: "bonjour\n" });
    const probe = join(homedir(), `spaka-sandbox-probe-${Date.now()}`);
    const write = await runShell(`echo x > ${JSON.stringify(probe)}`, place, env);
    expect(write.code).not.toBe(0);
    expect(existsSync(probe)).toBe(false);
    const home = await runShell(`ls ${JSON.stringify(homedir())}`, place, env);
    expect(home.output).toMatch(/Operation not permitted/);
    const allowed = await runShell(`head -c 1 ${JSON.stringify(join(appDir, "package.json"))}`, place, env);
    expect(allowed).toMatchObject({ code: 0, output: "{" });
    expect(readFileSync(join(dir, "note.txt"), "utf8")).toBe("bonjour\n");
  },
);

test("the profile lets programs read the metadata of the folders above a readable folder in a denied place, and nothing more", () => {
  const profile = sandboxProfile({ projectDir: "/tmp", readable: ["/Users/maker/Applications/Spaka.app"] });
  expect(profile).toContain(
    '(allow file-read-metadata (literal "/Users/maker/Applications") (literal "/Users/maker"))',
  );
  expect(sandboxProfile({ projectDir: "/tmp", readable: ["/Applications/Spaka.app"] })).not.toContain(
    "file-read-metadata",
  );
});

test.runIf(sandboxAvailable())(
  "in the sandbox, the app's node runs when the app sits under /Users, as a checkout or an app in ~/Applications does",
  async () => {
    dir = mkdtempSync(join(tmpdir(), "spaka-shell-"));
    data = mkdtempSync(join(tmpdir(), "spaka-data-"));
    // This repository's Electron, under the maker's home in a checkout (and on CI's runners).
    const electron = createRequire(import.meta.url)("electron") as unknown as string;
    const launcher = nodeLauncher(data, "darwin", electron);
    const place = { projectDir: dir, readable: launcher.readable };
    const ran = await runShell(
      "node -e 'console.log(process.versions.node)'",
      place,
      withPathFirst(env, launcher.binDir, "darwin"),
    );
    expect(ran).toMatchObject({ code: 0 });
    expect(ran.output).toMatch(/^\d+\.\d+\.\d+\n$/);
    const home = await runShell(`ls ${JSON.stringify(homedir())}`, place, env);
    expect(home.output).toMatch(/Operation not permitted/);
  },
);

test.runIf(sandboxAvailable())("a command that runs too long is stopped", async () => {
  dir = mkdtempSync(join(tmpdir(), "spaka-shell-"));
  const result = await runShell("sleep 5", { projectDir: dir, readable: [] }, env, { timeoutMs: 200 });
  expect(result.timedOut).toBe(true);
});

/** Git Bash on Windows (on CI's runners too); bash elsewhere, to run the same way. */
const bash = process.platform === "win32" ? findGitBash() : "/bin/bash";

test.skipIf(!bash)(
  "with Git Bash given, as on Windows, a command runs in it in the project folder, with no sandbox (Q381)",
  async () => {
    dir = mkdtempSync(join(tmpdir(), "spaka-shell-"));
    const ran = await runShell("echo bonjour > note.txt && cat note.txt", { projectDir: dir, readable: [], bash }, {
      ...process.env,
    } as Record<string, string>);
    expect(ran).toMatchObject({ code: 0, output: "bonjour\n" });
    expect(readFileSync(join(dir, "note.txt"), "utf8")).toBe("bonjour\n");
  },
);
