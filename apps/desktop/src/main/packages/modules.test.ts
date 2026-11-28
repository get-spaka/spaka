import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { packageImports } from "@spaka/runtime";
import { diskSource } from "@spaka/runtime/node";
import { expect, test } from "vitest";
import { PackageModules } from "./modules";

// The build host run with the repository's own Rolldown, outside Node's
// permissions (it is native): rules.real.test.ts and the e2e check Spaka's
// own Rolldown, confined, as WebAssembly.
const DESKTOP = join(import.meta.dirname, "../../..");
const tools = {
  dir: DESKTOP,
  host: join(import.meta.dirname, "build-host.mjs"),
  preload: join(import.meta.dirname, "wasi-drives.mjs"),
};

function write(root: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

/** A website with two packages installed: one with a default export and a path inside it, one CommonJS. */
function site() {
  const root = mkdtempSync(join(tmpdir(), "spaka-modules-"));
  write(root, {
    "node_modules/slides/package.json": JSON.stringify({
      name: "slides",
      version: "2.1.0",
      license: "MIT",
      type: "module",
      exports: { ".": "./dist/index.js", "./autoplay": "./dist/autoplay.js" },
    }),
    "node_modules/slides/LICENSE": "MIT License\n\nCopyright (c) Someone */ of slides",
    "node_modules/slides/dist/package.json": JSON.stringify({ type: "module" }),
    "node_modules/slides/dist/index.js":
      'import { clamp } from "./util.js";\nexport default function Slides(root) { return { root, at: clamp(0) }; }\nexport const version = "2.1.0";\n',
    "node_modules/slides/dist/util.js": "export const clamp = (n) => Math.max(0, n);\n",
    "node_modules/slides/dist/autoplay.js":
      'import Slides from "slides";\nexport default function Autoplay(root) { return Slides(root); }\n',
    "node_modules/old/package.json": JSON.stringify({
      name: "old",
      version: "1.0.0",
      license: "ISC",
      main: "index.js",
    }),
    "node_modules/old/index.js": "module.exports = function old() { return 1; };\n",
    "scripts/carousel.js":
      'import Slides, { version } from "slides";\nimport Autoplay from "slides/autoplay";\nimport old from "old";\nexport function start(root) { Slides(root); Autoplay(root); old(); }\n',
  });
  return root;
}

test("one module per specifier, its licence notice at its head, what the import map shares left to it", async () => {
  const root = site();
  const { packages, notes } = packageImports(diskSource(root), ["scripts/carousel.js"]);
  expect(notes).toEqual([]);
  expect(packages.map((p) => [p.specifier, p.url])).toEqual([
    ["old", "/assets/packages/old@1.0.0.js"],
    ["slides", "/assets/packages/slides@2.1.0.js"],
    ["slides/autoplay", "/assets/packages/slides@2.1.0/autoplay.js"],
  ]);
  let installs = 0;
  const cacheDir = join(root, "..", `${basename(root)}-cache`);
  const modules = new PackageModules({
    cacheDir,
    tools: async () => {
      installs++;
      return tools;
    },
    confined: false,
  });
  const made = await modules.modules(root, packages);
  const code = (specifier: string) => {
    const result = made.get(specifier);
    if (!result || "error" in result) throw new Error(`${specifier}: ${JSON.stringify(result)}`);
    return result.module.code;
  };
  // The notice, its text kept, a closing mark in it broken.
  expect(code("slides")).toMatch(
    /^\/\*!\n \* slides 2\.1\.0 · MIT\n \*\n \* MIT License\n \*\n \* Copyright \(c\) Someone \* \/ of slides\n \*\/\n/,
  );
  // Its exports, the default one included, its own files bundled.
  expect(code("slides")).toMatch(/export\s*\{.*as default.*\}|export default/);
  expect(code("slides")).toContain("version");
  expect(code("slides")).toContain("Math.max(0");
  // The path inside it imports the page's slides, not a second copy.
  expect(code("slides/autoplay")).toMatch(/from\s*["']slides["']/);
  expect(code("slides/autoplay")).not.toContain("Math.max(0");
  // CommonJS: its export is the default one.
  expect(code("old")).toMatch(/^\/\*!\n \* old 1\.0\.0 · ISC\n \*\/\n/);
  expect(code("old")).toMatch(/export default|as default/);
  expect(installs).toBe(1);
  expect(readdirSync(cacheDir)).toHaveLength(3);

  // Kept: asked again, nothing is made.
  const again = await modules.served(root, packages, "/assets/packages/slides@2.1.0.js");
  expect(again && "module" in again && again.module.code).toBe(code("slides"));
  expect(installs).toBe(1);
  expect(await modules.served(root, packages, "/assets/packages/slides@9.9.9.js")).toBeUndefined();
  // What visitors download of each package, compressed.
  const weights = modules.weights(root, packages);
  expect([...weights.keys()].sort()).toEqual(["old", "slides"]);
  expect(weights.get("slides")).toBeGreaterThan(100);
}, 30_000);

test("a specifier Rolldown cannot make is an error, said in one line, and never kept", async () => {
  const root = site();
  const modules = new PackageModules({ cacheDir: join(root, ".cache"), tools: async () => tools, confined: false });
  const missing = { specifier: "slides/nothing", name: "slides", version: "2.1.0", url: "/x.js" };
  const made = await modules.modules(root, [missing]);
  expect(made.get("slides/nothing")).toEqual({
    error: expect.stringContaining("Package subpath './nothing' is not defined by \"exports\""),
  });
  const unresolved = await modules.modules(root, [{ ...missing, specifier: "nowhere", name: "nowhere" }]);
  expect(unresolved.get("nowhere")).toEqual({ error: "Cannot resolve entry module nowhere." });
  expect(() => readdirSync(join(root, ".cache"))).not.toThrow();
  expect(readdirSync(join(root, ".cache"))).toEqual([]);
  // Spaka's Rolldown not installed: every module says why.
  const offline = new PackageModules({
    cacheDir: join(root, ".cache2"),
    tools: async () => {
      throw new Error("Spaka could not install its Rolldown 1.2.19: no network.");
    },
  });
  expect((await offline.modules(root, [missing])).get("slides/nothing")).toEqual({
    error: "Spaka could not install its Rolldown 1.2.19: no network.",
  });
}, 30_000);
