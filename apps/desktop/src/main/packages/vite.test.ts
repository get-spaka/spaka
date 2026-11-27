import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { pnpmFolders } from "./pnpm";
import { ensureVite, VITE_VERSION, viteDir } from "./vite";

/** A pnpm that installs nothing, and notes each call (fixtures/fake-pnpm.cjs). */
const FAKE_PNPM = join(__dirname, "fixtures", "fake-pnpm.cjs");

test.skipIf(process.platform === "win32")(
  "Spaka's Vite is installed once, from the lockfile the app ships, whoever asks and however often",
  async () => {
    const data = mkdtempSync(join(tmpdir(), "spaka-vite-"));
    const folders = pnpmFolders(data);
    mkdirSync(dirname(folders.program), { recursive: true });
    writeFileSync(folders.program, `#!${process.execPath}\nrequire(${JSON.stringify(FAKE_PNPM)});\n`);
    chmodSync(folders.program, 0o755);
    const place = { folders, nodeBinDir: data };
    const dir = viteDir(folders);
    expect(dir).toBe(join(data, "tools", "vite"));
    // Asked twice at once, then again once installed.
    const [a, b] = await Promise.all([ensureVite(place), ensureVite(place)]);
    const c = await ensureVite(place);
    expect([a, b, c]).toEqual([
      { dir, host: join(dir, "build-host.mjs") },
      { dir, host: join(dir, "build-host.mjs") },
      { dir, host: join(dir, "build-host.mjs") },
    ]);
    expect(readFileSync(join(dir, "pnpm-calls.txt"), "utf8")).toBe("install\n");
    expect(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).dependencies.vite).toBe(VITE_VERSION);
    expect(readFileSync(join(dir, "build-host.mjs"), "utf8")).toContain("Spaka's build host");
    expect(readFileSync(join(dir, "installed.txt"), "utf8")).toMatch(/^[0-9a-f]{64}$/);
    // An install cut short, its mark missing, is done again, from an empty folder.
    writeFileSync(join(dir, "installed.txt"), "");
    writeFileSync(join(dir, "left.txt"), "from the install cut short");
    await ensureVite(place);
    expect(readFileSync(join(dir, "installed.txt"), "utf8")).toMatch(/^[0-9a-f]{64}$/);
    expect(() => readFileSync(join(dir, "left.txt"))).toThrow();
  },
);
