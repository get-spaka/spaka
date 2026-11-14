import { expect, test } from "vitest";
import { exportHead, previewHead } from "./head.ts";
import { hasScripts, NO_ASSETS, START_JS, siteAssets } from "./scripts.ts";
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
    '<script src="/assets/up-start.js" data-modules="/scripts/b-scroll.mjs /scripts/reveal.js" defer></script>',
  );
  expect(lenis).toBeGreaterThan(0);
  expect(lib).toBeGreaterThan(lenis);
  expect(start).toBeGreaterThan(lib);
  expect(head).not.toContain("data-wait");
  expect(exportHead(true)).not.toContain("up-start");
});

test("in the preview no script of the site is in the head: the start script loads them in visitor mode (Q242)", () => {
  const { assets } = siteAssets(site);
  const head = previewHead({ vendorBase: "/__up/vendor", theme: "", assets, styles: ".hero { color: red; }" });
  expect(head).not.toContain('<script src="https://unpkg.com');
  expect(head).not.toContain('<script src="/scripts/');
  expect(head).toContain(
    '<script src="/__up/vendor/up-start.js" data-libraries="https://unpkg.com/lenis@1.3.4/dist/lenis.min.js /scripts/lib/splitting.js" data-modules="/scripts/b-scroll.mjs /scripts/reveal.js" data-wait defer data-up-runtime></script>',
  );
  // Still until visitor mode, and the site's stylesheet compiled by Tailwind with the theme's names.
  expect(head).toContain('<style id="up-still" data-up-runtime>html:not([data-up-moving])');
  expect(head).toMatch(
    /<style id="up-styles" type="text\/tailwindcss" data-up-runtime>@theme inline[\s\S]*\.hero \{ color: red; \}<\/style>/,
  );
  expect(previewHead({ vendorBase: "/v", theme: "" })).not.toContain("up-start");
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
  const window: { __upStart?: { go(): Promise<void>; stop(): void; start(): Promise<void>; started: boolean } } = {};
  const module = {
    start: (root: unknown) => void calls.push(`start ${root === document ? "document" : "part"}`),
    stop: () => void calls.push("stop"),
  };
  // The script as the page runs it, its import answered by the module above.
  const run = new Function("document", "window", "__import", START_JS.replace(/import\(path\)/, "__import(path)"));
  run(document, window, async () => module);
  expect(window.__upStart?.started).toBe(false);
  listeners["htmx:after:process"]!({ target: {} });
  expect(calls).toEqual([]);
  await window.__upStart!.go();
  expect(calls).toEqual(["start document"]);
  listeners["htmx:after:process"]!({ target: body });
  listeners["htmx:after:process"]!({ target: {} });
  await new Promise((r) => setTimeout(r, 0));
  expect(calls).toEqual(["start document", "start part"]);
  // Before a new rendering, stopped at once; started again once it is complete, once.
  window.__upStart!.stop();
  window.__upStart!.stop();
  expect(calls.slice(2)).toEqual(["stop"]);
  await window.__upStart!.start();
  await window.__upStart!.start();
  expect(calls.slice(2)).toEqual(["stop", "start document"]);
});
