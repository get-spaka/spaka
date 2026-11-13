import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// The libraries the site-scripts skill lists, loaded from their addresses in
// the preview's visitor mode, each doing its work with no error, and the
// skill's own example module run as written. Needs the network: skipped
// without it.
const SKILL = readFileSync(join(__dirname, "../apps/desktop/skills/site-scripts/SKILL.md"), "utf8");
const listed = [...SKILL.matchAll(/^\| ([A-Z][\w ]+) \| `(https:\/\/[^`]+\.js)` \| (\w[\w.-]*) \|/gm)].map((m) => ({
  name: m[1]!.trim(),
  url: m[2]!,
  licence: m[3]!,
}));
const ogl = /import \{[^}]+\} from "(https:\/\/cdn\.jsdelivr\.net\/npm\/ogl@[^"]+)"/.exec(SKILL)![1]!;
const reveal = /```js\n\/\/ scripts\/reveal\.js\n([\s\S]*?)```/.exec(SKILL)![1]!;
const online = await fetch(listed[0]!.url, { method: "HEAD" }).then(
  (r) => r.ok,
  () => false,
);

describe.skipIf(!online)("the skill's libraries", () => {
  let launched: LaunchedApp;
  let path: string;
  const { invoke, until, page } = previewDriver(() => launched);
  const write = (file: string, text: string) => {
    mkdirSync(join(path, file, ".."), { recursive: true });
    writeFileSync(join(path, file), text);
  };
  const errors = () =>
    launched.app.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the app's own objects
      ((globalThis as any).upstart.preview.errors as { message: string }[]).map((e) => e.message),
    );

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    path = (await invoke("projects:current")).path;
    await invoke("preview:set-view", "page");
    write("scripts/libraries.json", JSON.stringify(listed, null, 2));
    write("scripts/reveal.js", reveal);
    write(
      "scripts/effects.js",
      `import { Renderer, Camera, Program, Mesh, Triangle } from "${ogl}";
let lenis, embla, renderer;
export function start(root) {
  if (root !== document) return;
  lenis = new Lenis();
  Splitting({ target: document.querySelector("[data-split]"), by: "chars" });
  embla = EmblaCarousel(document.querySelector("[data-carousel]"), { loop: true });
  renderer = new Renderer({ canvas: document.querySelector("[data-shader]") });
  const program = new Program(renderer.gl, {
    vertex: "attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }",
    fragment: "precision highp float; void main() { gl_FragColor = vec4(0.5); }",
  });
  renderer.render({ scene: new Mesh(renderer.gl, { geometry: new Triangle(renderer.gl), program }), camera: new Camera(renderer.gl) });
  window.__effects = { lenis: !!lenis, embla: embla.slideNodes().length, gl: !!renderer.gl };
}
export function stop() {
  lenis?.destroy();
  embla?.destroy();
}
`,
    );
    write(
      "pages/index.liquid",
      `<!doctype html><html lang="en"><head><title>Home</title></head><body><main>
<h1 data-split>Fresh bread</h1>
<p data-reveal>Every morning at seven.</p>
<div data-carousel class="overflow-hidden"><div class="flex"><div class="min-w-full">One</div><div class="min-w-full">Two</div></div></div>
<canvas data-shader aria-hidden="true" width="40" height="40"></canvas>
</main></body></html>`,
    );
    await invoke("preview:navigate", "/");
    await until(() => page("document.querySelector('h1')?.textContent.includes('Fresh')"));
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("the skill lists Motion, Lenis, Splitting and Embla with their licences, and OGL", () => {
    expect(listed.map((l) => `${l.name}: ${l.licence}`)).toEqual([
      "Motion: MIT",
      "Lenis: MIT",
      "Splitting: MIT",
      "Embla Carousel: MIT",
    ]);
    expect(ogl).toMatch(/ogl@\d+\.\d+\.\d+\/\+esm$/);
  });

  test("each does its work in visitor mode, with no error", async () => {
    await until(() => page("!!window.__effects"), 20_000);
    expect(await page("window.__effects")).toEqual({ lenis: true, embla: 2, gl: true });
    expect(await page("document.querySelectorAll('h1 .char').length")).toBe("Fresh bread".replace(/ /g, "").length);
    expect(await page("document.documentElement.classList.contains('lenis')")).toBe(true);
    // The skill's reveal, run as written: hidden by the script, then shown by Motion as it is in view.
    await until(
      async () => Number(await page("getComputedStyle(document.querySelector('[data-reveal]')).opacity")) > 0.99,
    );
    // Back where it is, at its size: an animation to transform "none" leaves Motion's matrix(0, 0, 0, 0, 0, 0).
    await until(async () =>
      ["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(
        await page("getComputedStyle(document.querySelector('[data-reveal]')).transform"),
      ),
    );
    expect(await errors()).toEqual([]);
  });

  test("a library that does not load is one of the page's errors", async () => {
    write(
      "scripts/libraries.json",
      JSON.stringify([
        ...listed,
        { name: "missing", url: "https://cdn.jsdelivr.net/npm/no-such-package-up@0.0.1/x.js" },
      ]),
    );
    await until(
      async () =>
        (await errors()).some((m) => m.includes("could not load https://cdn.jsdelivr.net/npm/no-such-package-up")),
      20_000,
    );
  });
});
