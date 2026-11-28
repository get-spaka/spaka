import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { pnpmFolders } from "./pnpm";
import { ensureRolldown, ROLLDOWN_VERSION, rolldownDir } from "./rolldown";

/** A pnpm that installs nothing, and notes each call (fixtures/fake-pnpm.cjs). */
const FAKE_PNPM = join(__dirname, "fixtures", "fake-pnpm.cjs");

test.skipIf(process.platform === "win32")(
  "Spaka's Rolldown is installed once, from the lockfile the app ships, whoever asks and however often",
  async () => {
    const data = mkdtempSync(join(tmpdir(), "spaka-vite-"));
    const folders = pnpmFolders(data);
    mkdirSync(dirname(folders.program), { recursive: true });
    writeFileSync(folders.program, `#!${process.execPath}\nrequire(${JSON.stringify(FAKE_PNPM)});\n`);
    chmodSync(folders.program, 0o755);
    const place = { folders, nodeBinDir: data };
    const dir = rolldownDir(folders);
    expect(dir).toBe(join(data, "tools", "rolldown"));
    // Asked twice at once, then again once installed.
    const [a, b] = await Promise.all([ensureRolldown(place), ensureRolldown(place)]);
    const c = await ensureRolldown(place);
    const tools = { dir, host: join(dir, "build-host.mjs"), preload: join(dir, "wasi-drives.mjs") };
    expect([a, b, c]).toEqual([tools, tools, tools]);
    expect(readFileSync(join(dir, "pnpm-calls.txt"), "utf8")).toBe("install\n");
    expect(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).dependencies.rolldown).toBe(ROLLDOWN_VERSION);
    expect(readFileSync(join(dir, "build-host.mjs"), "utf8")).toContain("Spaka's build host");
    expect(readFileSync(join(dir, "wasi-drives.mjs"), "utf8")).toContain("Rolldown's WebAssembly");
    expect(readFileSync(join(dir, "installed.txt"), "utf8")).toMatch(/^[0-9a-f]{64}$/);
    // An install cut short, its mark missing, is done again, from an empty folder.
    writeFileSync(join(dir, "installed.txt"), "");
    writeFileSync(join(dir, "left.txt"), "from the install cut short");
    await ensureRolldown(place);
    expect(readFileSync(join(dir, "installed.txt"), "utf8")).toMatch(/^[0-9a-f]{64}$/);
    expect(() => readFileSync(join(dir, "left.txt"))).toThrow();
  },
);
