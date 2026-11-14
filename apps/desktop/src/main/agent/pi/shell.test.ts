import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { runShell, sandboxProfile, shellAvailable } from "./shell";

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

const env = { PATH: "/usr/bin:/bin" };
/** A folder under the maker's home that the shell is let read: this app's own sources. */
const appDir = resolve(__dirname, "../../../..");

test("the profile lets the shell write the project and the temporary folders, and read the project and the folders given", () => {
  const profile = sandboxProfile({
    projectDir: "/tmp",
    readable: ["/Applications/Upstart.app"],
    skillsDir: "/tmp/skills",
  });
  expect(profile).toContain('(deny file-read* (subpath "/Users") (subpath "/Volumes"))');
  expect(profile).toContain('(subpath "/Applications/Upstart.app")');
  expect(profile).toContain('(deny file-write* (subpath "/tmp/skills"))');
});

test.runIf(shellAvailable())(
  "in the sandbox, a command writes in the project only, and reads none of the maker's other files",
  async () => {
    dir = mkdtempSync(join(tmpdir(), "upstart-shell-"));
    const place = { projectDir: dir, readable: [appDir] };
    const ok = await runShell("echo bonjour > note.txt && cat note.txt", place, env);
    expect(ok).toMatchObject({ code: 0, output: "bonjour\n" });
    const probe = join(homedir(), `upstart-sandbox-probe-${Date.now()}`);
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

test.runIf(shellAvailable())("a command that runs too long is stopped", async () => {
  dir = mkdtempSync(join(tmpdir(), "upstart-shell-"));
  const result = await runShell("sleep 5", { projectDir: dir, readable: [] }, env, { timeoutMs: 200 });
  expect(result.timedOut).toBe(true);
});
