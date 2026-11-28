import { expect, test } from "vitest";
import { exportHead, previewHead } from "./head.ts";
import {
  importedSpecifiers,
  importMap,
  moduleSpecifiers,
  NO_ASSETS,
  START_JS,
  siteAssets,
  specifierPackage,
} from "./scripts.ts";
import { memorySource } from "./source.ts";

const site = memorySource({
  "scripts/lib/split.js": "export const split = (s) => s.split('');",
  "scripts/reveal.js": "export function start(root) {}",
  "scripts/b-scroll.mjs": "export function start(root) {}",
  "scripts/notes.txt": "not a script",
  "styles/site.css": ".hero { @apply text-primary; }",
  "styles/old.scss": "",
});

test("a site's scripts and stylesheets are read from scripts/ and styles/ (ADR 0011)", () => {
  const { assets, notes } = siteAssets(site);
  // The modules at the top of scripts/; what is below, scripts/lib/ too, is theirs to import.
  expect(assets).toEqual({
    modules: ["scripts/b-scroll.mjs", "scripts/reveal.js"],
    styles: ["styles/site.css"],
    packages: [],
  });
  expect(notes).toEqual([]);
  expect(siteAssets(memorySource({})).assets).toEqual(NO_ASSETS);
});

test("the libraries a site made before packages lists by their address are no longer loaded: a note says so", () => {
  const older = memorySource({
    "scripts/libraries.json": JSON.stringify([
      { name: "lenis", url: "https://unpkg.com/lenis@1.3.4/dist/lenis.min.js" },
    ]),
    "scripts/reveal.js": "export function start(root) {}",
  });
  const { assets, notes } = siteAssets(older);
  expect(notes).toEqual([
    expect.stringMatching(/^scripts\/libraries\.json: no longer loaded\. Add each library with add_package/),
  ]);
  expect(exportHead(true, assets)).not.toContain("unpkg");
  expect(previewHead({ vendorBase: "/v", theme: "", assets })).not.toContain("unpkg");
});

test("published, the start script imports the modules", () => {
  const head = exportHead(true, siteAssets(site).assets);
  expect(head).toContain(
    '<script src="/assets/spaka-start.js" data-modules="/scripts/b-scroll.mjs /scripts/reveal.js" defer></script>',
  );
  expect(head).not.toContain("data-wait");
  expect(head).not.toContain("/scripts/lib/");
  expect(exportHead(true)).not.toContain("spaka-start");
});

test("in the preview no script of the site is in the head: the start script loads them in visitor mode (Q242)", () => {
  const { assets } = siteAssets(site);
  const head = previewHead({ vendorBase: "/__spaka/vendor", theme: "", assets, styles: ".hero { color: red; }" });
  expect(head).not.toContain('<script src="https://unpkg.com');
  expect(head).not.toContain('<script src="/scripts/');
  expect(head).toContain(
    '<script src="/__spaka/vendor/spaka-start.js" data-modules="/scripts/b-scroll.mjs /scripts/reveal.js" data-wait defer data-spaka-runtime></script>',
  );
  // Still until visitor mode, and the site's stylesheet compiled by Tailwind with the theme's names.
  expect(head).toContain('<style id="spaka-still" data-spaka-runtime>html:not([data-spaka-moving])');
  expect(head).toMatch(
    /<style id="spaka-styles" type="text\/tailwindcss" data-spaka-runtime>@theme inline[\s\S]*\.hero \{ color: red; \}<\/style>/,
  );
  expect(previewHead({ vendorBase: "/v", theme: "" })).not.toContain("spaka-start");
});

test("the start script starts the modules on load and on what htmx brings, waits in the preview, and stops and starts them around a new rendering", async () => {
  const calls: string[] = [];
  const listeners: Record<string, (e: { target: unknown }) => void> = {};
  const script = { dataset: { modules: "/a.js" }, hasAttribute: (n: string) => n === "data-wait" };
  const body = {};
  const document = {
    currentScript: script,
    readyState: "complete",
    body,
    documentElement: {},
    addEventListener: (type: string, fn: (e: { target: unknown }) => void) => {
      listeners[type] = fn;
    },
  };
  const window: { __spakaStart?: { go(): Promise<void>; stop(): void; start(): Promise<void>; started: boolean } } = {};
  const module = {
    start: (root: unknown) => void calls.push(`start ${root === document ? "document" : "part"}`),
    stop: () => void calls.push("stop"),
  };
  // The script as the page runs it, its import answered by the module above.
  const run = new Function("document", "window", "__import", START_JS.replace(/import\(path\)/, "__import(path)"));
  run(document, window, async () => module);
  expect(window.__spakaStart?.started).toBe(false);
  listeners["htmx:after:process"]!({ target: {} });
  expect(calls).toEqual([]);
  await window.__spakaStart!.go();
  expect(calls).toEqual(["start document"]);
  listeners["htmx:after:process"]!({ target: body });
  listeners["htmx:after:process"]!({ target: {} });
  await new Promise((r) => setTimeout(r, 0));
  expect(calls).toEqual(["start document", "start part"]);
  // Before a new rendering, stopped at once; started again once it is complete, once.
  window.__spakaStart!.stop();
  window.__spakaStart!.stop();
  expect(calls.slice(2)).toEqual(["stop"]);
  await window.__spakaStart!.start();
  await window.__spakaStart!.start();
  expect(calls.slice(2)).toEqual(["stop", "start document"]);
});

test("the cascade layers are ordered before daisyUI's stylesheet, utilities last, as in an export", () => {
  const head = previewHead({ vendorBase: "/v", theme: "" });
  expect(head.indexOf("@layer theme, base, daisyui, components, utilities;")).toBeGreaterThan(-1);
  expect(head.indexOf("@layer theme, base, daisyui, components, utilities;")).toBeLessThan(head.indexOf("daisyui.css"));
});

test("what a script imports by name, not by a path or an address (ADR 0013)", () => {
  expect(
    importedSpecifiers(`
      import EmblaCarousel from "embla-carousel";
      import { animate,
        inView } from 'motion';
      import "lenis/dist/lenis.css";
      export { OrbitControls } from "three/addons/controls/OrbitControls.js";
      import * as util from "./util.js";
      import data from "/data.js";
      import x from "https://cdn.jsdelivr.net/npm/x@1/+esm";
      import fs from "node:fs";
      // import gone from "commented";
      /* import gone from "commented-too"; */
      const later = () => import("@floating-ui/dom");
      const text = "something from somewhere";
      const until = lunch ? shown(row, "lunch-from") : shown(row, "closes");
      export const start = () => {};
    `),
  ).toEqual([
    "embla-carousel",
    "motion",
    "lenis/dist/lenis.css",
    "three/addons/controls/OrbitControls.js",
    "@floating-ui/dom",
  ]);
  // Every specifier, paths and addresses too.
  expect(moduleSpecifiers('import a from "./a.js";\nimport b from "https://esm.sh/b";\nimport c from "c";')).toEqual([
    "./a.js",
    "https://esm.sh/b",
    "c",
  ]);
});

test("the import map points each package the scripts import, as installed, to its module", () => {
  const installed = (name: string, version: string) => ({
    [`node_modules/${name}/package.json`]: JSON.stringify({ name, version }),
  });
  const withPackages = memorySource({
    ...installed("embla-carousel", "8.6.0"),
    ...installed("three", "0.187.0"),
    ...installed("@floating-ui/dom", "1.7.4"),
    "scripts/carousel.js": 'import EmblaCarousel from "embla-carousel";\nexport function start() {}',
    "scripts/scene.js":
      'import * as THREE from "three";\nimport { OrbitControls } from "three/addons/controls/OrbitControls.js";\nimport { computePosition } from "@floating-ui/dom";\nimport gsap from "gsap";\nimport bad from "Not/A/Name";\nexport function start() {}',
    // Below scripts/, a file the modules import: what it imports is in the import map too.
    "scripts/lib/shared.js": 'export { default } from "embla-carousel";',
  });
  const { assets, notes } = siteAssets(withPackages);
  expect(assets.packages).toEqual([
    {
      specifier: "@floating-ui/dom",
      name: "@floating-ui/dom",
      version: "1.7.4",
      url: "/assets/packages/@floating-ui/dom@1.7.4.js",
    },
    {
      specifier: "embla-carousel",
      name: "embla-carousel",
      version: "8.6.0",
      url: "/assets/packages/embla-carousel@8.6.0.js",
    },
    { specifier: "three", name: "three", version: "0.187.0", url: "/assets/packages/three@0.187.0.js" },
    {
      specifier: "three/addons/controls/OrbitControls.js",
      name: "three",
      version: "0.187.0",
      url: "/assets/packages/three@0.187.0/addons/controls/OrbitControls.js",
    },
  ]);
  expect(notes).toEqual([
    "scripts/scene.js imports gsap, which is not installed: add it with add_package first.",
    'scripts/scene.js: "Not/A/Name" is not the name of a package, nor a path inside one.',
  ]);
  // In the head, before the scripts, in the preview as once published; a "<" never closes it.
  const head = exportHead(false, assets);
  expect(head).toContain(
    `<script type="importmap">{"imports":{"@floating-ui/dom":"/assets/packages/@floating-ui/dom@1.7.4.js","embla-carousel":"/assets/packages/embla-carousel@8.6.0.js","three":"/assets/packages/three@0.187.0.js","three/addons/controls/OrbitControls.js":"/assets/packages/three@0.187.0/addons/controls/OrbitControls.js"}}</script><script src="/assets/spaka-start.js"`,
  );
  expect(previewHead({ vendorBase: "/v", theme: "", assets })).toMatch(
    /<script type="importmap" data-spaka-runtime>\{"imports".*<\/script><script src="\/v\/spaka-start\.js"/,
  );
  expect(importMap([{ specifier: "x", name: "x", version: "1.0.0", url: "/a</script>.js" }])).toBe(
    '{"imports":{"x":"/a\\u003c/script>.js"}}',
  );
  expect(importMap([])).toBe("");
  // A site.json written before packages has none.
  expect(exportHead(false, { modules: ["scripts/a.js"], styles: [] })).not.toContain("importmap");
  // A package's name, then maybe a path inside it.
  expect(specifierPackage("three/addons/controls/OrbitControls.js")).toEqual({
    name: "three",
    path: "addons/controls/OrbitControls.js",
  });
  expect(specifierPackage("@floating-ui/dom")).toEqual({ name: "@floating-ui/dom" });
  expect(specifierPackage("three/../etc")).toBeUndefined();
  expect(specifierPackage("Not/A/Name")).toBeUndefined();
});
