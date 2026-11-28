// Spaka's pnpm for real (ADR 0013): it downloads pnpm from npm's registry
// (about 25 MB), checks it against pnpm.json, then adds a package to a
// project that holds traps and removes it again. Run only when asked, since
// it needs the network:
//
//   SPAKA_REAL_PNPM=1 pnpm exec vitest run src/main/packages/pnpm.real.test.ts
import { lstatSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { nodeLauncher } from "../agent/confinement";
import { pnpmFolders, pnpmInProject } from "./pnpm";

const real = process.env.SPAKA_REAL_PNPM === "1";
let data: string;
let project: string;
beforeAll(() => {
  data = mkdtempSync(join(tmpdir(), "spaka-pnpm-data-"));
  project = mkdtempSync(join(tmpdir(), "spaka-pnpm-site-"));
});
afterAll(() => {
  rmSync(data, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

test.runIf(real)(
  "Spaka's pnpm adds a package to a project with traps, from its own folders, and removes it",
  async () => {
    const place = { projectDir: project, folders: pnpmFolders(data), nodeBinDir: nodeLauncher(data).binDir };
    // A token the registry must never get, a workspace file and a pnpmfile that must not count, a Node to resolve.
    writeFileSync(join(project, ".npmrc"), "//registry.npmjs.org/:_authToken=SPAKA-TRAP\n");
    writeFileSync(join(project, "pnpm-workspace.yaml"), "minimumReleaseAge: 0\nnodeLinker: hoisted\n");
    writeFileSync(join(project, ".pnpmfile.cjs"), 'require("fs").writeFileSync("PNPMFILE-RAN", "")\n');
    writeFileSync(
      join(project, "package.json"),
      JSON.stringify({ name: "site", devEngines: { runtime: { name: "node", version: "18.0.0" } } }),
    );

    const added = await pnpmInProject("add", ["nanoid"], place);
    expect(added.report.errors).toEqual([]);
    expect(added.ok).toBe(true);
    expect(added.notes).toHaveLength(3);
    const version = added.report.added.find((p) => p.name === "nanoid")?.version;
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const manifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
    expect(manifest).toMatchObject({ type: "module", dependencies: { nanoid: version } });
    expect(manifest).not.toHaveProperty("devEngines");
    // The isolated layout: a relative link into the project's own .pnpm folder, none hoisted.
    const link = join(project, "node_modules", "nanoid");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toMatch(/^\.pnpm[\\/]nanoid@/);
    expect(() => lstatSync(join(project, "PNPMFILE-RAN"))).toThrow();
    expect(readFileSync(join(project, "pnpm-lock.yaml"), "utf8")).not.toMatch(/node@runtime/);
    expect(lstatSync(join(data, "pnpm", "store")).isDirectory()).toBe(true);

    const removed = await pnpmInProject("remove", ["nanoid"], place);
    expect(removed.ok).toBe(true);
    expect(removed.report.removed.map((p) => p.name)).toContain("nanoid");
    expect(JSON.parse(readFileSync(join(project, "package.json"), "utf8")).dependencies ?? {}).toEqual({});
  },
  120_000,
);
