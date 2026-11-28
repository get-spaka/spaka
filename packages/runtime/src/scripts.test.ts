import { expect, test } from "vitest";
import { exportHead, previewHead } from "./head.ts";
import { hasScripts, importedSpecifiers, importMap, NO_ASSETS, START_JS, siteAssets } from "./scripts.ts";
import { memorySource } from "./source.ts";

const site = memorySource({
  "scripts/libraries.json": JSON.stringify([
    { name: "lenis", url: "https://unpkg.com/lenis@1.3.4/dist/lenis.min.js", licence: "MIT" },
    { name: "bad", url: "http://example.com/x.js" },
  ]),
  "scripts/lib/splitting.js": "window.Splitting = () => {};",
  "scripts/reveal.js": "export function start(root) {}",
  "scripts/b-scroll.mjs": "export function start(root) {}",
  "scripts/notes.txt": "not a script",
  "styles/site.css": ".hero { @apply text-primary; }",
  "styles/old.scss": "",
});

test("a site's scripts and stylesheets are read from scripts/ and styles/ (ADR 0011)", () => {
  const { assets, notes } = siteAssets(site);
  expect(assets).toEqual({
    libraries: [{ name: "lenis", url: "https://unpkg.com/lenis@1.3.4/dist/lenis.min.js", licence: "MIT" }],
    lib: ["scripts/lib/splitting.js"],
    modules: ["scripts/b-scroll.mjs", "scripts/reveal.js"],
    styles: ["styles/site.css"],
    packages: [],
  });
  expect(notes).toEqual([expect.stringContaining("needs a name and an https address")]);
  expect(siteAssets(memorySource({ "scripts/libraries.json": "{" })).notes[0]).toMatch(/^scripts\/libraries\.json:/);
  expect(hasScripts(NO_ASSETS)).toBe(false);
});

test("published, the libraries load first, then the start script imports the modules", () => {
  const head = exportHead(true, siteAssets(site).assets);
  const lenis = head.indexOf('<script src="https://unpkg.com/lenis@1.3.4/dist/lenis.min.js"></script>');
  const lib = head.indexOf('<script src="/scripts/lib/splitting.js"></script>');
  const start = head.indexOf(
    '<script src="/assets/spaka-start.js" data-modules="/scripts/b-scroll.mjs /scripts/reveal.js" defer></script>',
  );
  expect(lenis).toBeGreaterThan(0);
  expect(lib).toBeGreaterThan(lenis);
  expect(start).toBeGreaterThan(lib);
  expect(head).not.toContain("data-wait");
  expect(exportHead(true)).not.toContain("spaka-start");
});

test("in the preview no script of the site is in the head: the start script loads them in visitor mode (Q242)", () => {
  const { assets } = siteAssets(site);
  const head = previewHead({ vendorBase: "/__spaka/vendor", theme: "", assets, styles: ".hero { color: red; }" });
  expect(head).not.toContain('<script src="https://unpkg.com');
  expect(head).not.toContain('<script src="/scripts/');
  expect(head).toContain(
    '<script src="/__spaka/vendor/spaka-start.js" data-libraries="https://unpkg.com/lenis@1.3.4/dist/lenis.min.js /scripts/lib/splitting.js" data-modules="/scripts/b-scroll.mjs /scripts/reveal.js" data-wait defer data-spaka-runtime></script>',
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
    `),
  ).toEqual([
    "embla-carousel",
    "motion",
    "lenis/dist/lenis.css",
    "three/addons/controls/OrbitControls.js",
    "@floating-ui/dom",
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
    "scripts/lib/old.js": 'import nothing from "skipped";',
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
    `<script type="importmap">{"imports":{"@floating-ui/dom":"/assets/packages/@floating-ui/dom@1.7.4.js","embla-carousel":"/assets/packages/embla-carousel@8.6.0.js","three":"/assets/packages/three@0.187.0.js","three/addons/controls/OrbitControls.js":"/assets/packages/three@0.187.0/addons/controls/OrbitControls.js"}}</script><script src="/scripts/lib/old.js"></script><script src="/assets/spaka-start.js"`,
  );
  expect(previewHead({ vendorBase: "/v", theme: "", assets })).toMatch(
    /<script type="importmap" data-spaka-runtime>\{"imports".*<\/script><script src="\/v\/spaka-start\.js"/,
  );
  expect(importMap([{ specifier: "x", name: "x", version: "1.0.0", url: "/a</script>.js" }])).toBe(
    '{"imports":{"x":"/a\\u003c/script>.js"}}',
  );
  expect(importMap([])).toBe("");
  // A site.json written before packages has none.
  expect(exportHead(false, { libraries: [], lib: [], modules: ["scripts/a.js"], styles: [] })).not.toContain(
    "importmap",
  );
});
