// The shell of Upstart's own harness (Q278): each command runs under a
// sandbox-exec profile of Upstart's own, which lets it write in the project
// and the temporary folders only, and read the project, the system and
// Upstart's own Node, not the maker's other files: the same confinement as
// the official binary's sandbox gives Claude (confinement.ts). macOS only:
// elsewhere the harness has no shell.
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { systemTmp } from "../confinement";

export type ShellPlace = {
  projectDir: string;
  /** Folders the shell may read although they sit in a denied place (the `node` launcher, the app). */
  readable: string[];
  /** The assembled skills: readable, never written. */
  skillsDir?: string;
};

/** Whether this system has the sandbox the shell runs in. */
export const shellAvailable = (platform = process.platform) => platform === "darwin";

const real = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

const quote = (path: string) => JSON.stringify(path);

/** The sandbox profile for one project's shell. Later rules win over earlier ones. */
export function sandboxProfile({ projectDir, readable, skillsDir }: ShellPlace): string {
  const project = real(projectDir);
  const skills = skillsDir ? [real(skillsDir)] : [];
  const readHere = [project, real(systemTmp), ...readable.map(real), ...skills];
  return [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    `(allow file-write* (subpath ${quote(project)}) (subpath ${quote(real(systemTmp))}) (subpath "/private/tmp") (subpath "/private/var/folders") (literal "/dev/null") (literal "/dev/zero") (regex #"^/dev/tty") (regex #"^/dev/fd/") (literal "/dev/dtracehelper"))`,
    ...skills.map((dir) => `(deny file-write* (subpath ${quote(dir)}))`),
    '(deny file-read* (subpath "/Users") (subpath "/Volumes"))',
    `(allow file-read* (literal "/Users") ${readHere.map((dir) => `(subpath ${quote(dir)})`).join(" ")})`,
  ].join("\n");
}

export type ShellResult = { code: number | null; output: string; timedOut: boolean };

/** Runs one command in the project folder, in the sandbox; its output, cut to the last 30,000 characters. */
export function runShell(
  command: string,
  place: ShellPlace,
  env: Record<string, string>,
  { signal, timeoutMs = 120_000 }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ShellResult> {
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/sandbox-exec", ["-p", sandboxProfile(place), "/bin/bash", "-c", command], {
      cwd: real(place.projectDir),
      env: { ...env, PWD: real(place.projectDir) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const add = (chunk: Buffer) => {
      output = (output + chunk.toString("utf8")).slice(-30_000);
    };
    child.stdout.on("data", add);
    child.stderr.on("data", add);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    const abort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", abort, { once: true });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve({ code, output, timedOut });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: null, output: String(e.message), timedOut: false });
    });
  });
}
