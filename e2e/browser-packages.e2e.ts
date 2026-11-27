import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir, SLOW } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// The packages in the browser (ADR 0013, the packages plan's slice 3), for
// real: the packages the site-scripts skill lists, written into package.json
// as a maker would, installed by Spaka's pnpm under its rules (npm's
// registry, OSV, the downloads), imported by the site's modules by their
// names, and made into modules by Spaka's Vite, run under Node's permissions.
// Each does its work in the preview's visitor mode with no error, as does the
// skill's own example module; then the static export, served by a plain file
// server with every other address refused, runs them the same. Downloads
// Spaka's pnpm, its Vite and the packages: skipped without the network.
const SKILL = readFileSync(join(__dirname, "../apps/desktop/skills/site-scripts/SKILL.md"), "utf8");
const listed = [...SKILL.matchAll(/^\| `([a-z][\w.-]*)` \| /gm)].map((m) => m[1]!);
const reveal = /```js\n\/\/ scripts\/reveal\.js\n([\s\S]*?)```/.exec(SKILL)![1]!;
const online = await fetch("https://registry.npmjs.org/embla-carousel", { method: "HEAD" }).then(
  (r) => r.ok,
  () => false,
);

const EFFECTS = `import Lenis from "lenis";
import Splitting from "splitting";
import EmblaCarousel from "embla-carousel";
import { Renderer, Camera, Program, Mesh, Triangle } from "ogl";
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
`;

const PAGE = `<!doctype html><html lang="en"><head><title>Home</title></head><body><main>
<h1 data-split>Fresh bread</h1>
<p data-reveal>Every morning at seven.</p>
<div data-carousel class="overflow-hidden"><div class="flex"><div class="min-w-full">One</div><div class="min-w-full">Two</div></div></div>
<canvas data-shader aria-hidden="true" width="40" height="40"></canvas>
</main></body></html>`;

describe.skipIf(!online)("the packages a site's scripts import", () => {
  let launched: LaunchedApp;
  let path: string;
  let server: Server | undefined;
  const out = join(runsDir, "browser-packages-export");
  const { invoke, until, page } = previewDriver(() => launched);
  const write = (file: string, text: string) => {
    mkdirSync(join(path, file, ".."), { recursive: true });
    writeFileSync(join(path, file), text);
  };
  const errors = () =>
    launched.app.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the app's own objects
      ((globalThis as any).spaka.preview.errors as { message: string }[]).map((e) => e.message),
    );
  const installed = (name: string) => existsSync(join(path, "node_modules", name, "package.json"));

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    path = (await invoke("projects:current")).path;
    await invoke("preview:set-view", "page");
    // Written by hand: Spaka's rules judge each one, then its pnpm installs them (Q491, Q540).
    write("package.json", JSON.stringify({ dependencies: Object.fromEntries(listed.map((name) => [name, "*"])) }));
    await until(async () => listed.every(installed), 240_000);
    write("scripts/reveal.js", reveal);
    write("scripts/effects.js", EFFECTS);
    write("pages/index.liquid", PAGE);
    await invoke("preview:navigate", "/");
    await until(() => page("document.querySelector('h1')?.textContent.includes('Fresh')"));
  }, 300_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
    server?.close();
  });

  test("the skill lists Motion, Lenis, Splitting, Embla and OGL, installed under open licences", async () => {
    expect(listed).toEqual(["motion", "lenis", "splitting", "embla-carousel", "ogl"]);
    const list = (await invoke("packages:list")) as { name: string; version?: string; license?: string }[];
    expect(list.map((p) => [p.name, p.license])).toEqual([
      ["embla-carousel", "MIT"],
      ["lenis", "MIT"],
      ["motion", "MIT"],
      ["ogl", "Unlicense"],
      ["splitting", "MIT"],
    ]);
  });

  test("each does its work in visitor mode, from its module, with no error", async () => {
    await until(() => page("!!window.__effects"), 60_000);
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
    // One module per package, where the import map points, its licence notice first.
    const map = JSON.parse(await page("document.querySelector('script[type=importmap]').textContent"));
    expect(Object.keys(map.imports).sort()).toEqual([...listed].sort());
    const module = (name: string) => page(`fetch(${JSON.stringify(map.imports[name])}).then((r) => r.text())`);
    // With the text of its licence when the package ships one; embla-carousel ships none.
    expect(await module("lenis")).toMatch(
      /^\/\*!\n \* lenis \d+\.\d+\.\d+ · MIT\n \*\n \* The MIT License\n \*\n \* Copyright/,
    );
    expect(await module("embla-carousel")).toMatch(/^\/\*!\n \* embla-carousel \d+\.\d+\.\d+ · MIT\n \*\/\n/);
    // What each weighs for visitors, in the website's settings (Q520).
    const list = (await invoke("packages:list")) as { name: string; weight?: number; sides: string[] }[];
    for (const p of list) {
      expect(p.sides).toEqual(["browser"]);
      expect(p.weight).toBeGreaterThan(500);
    }
  });

  test("a package imported but not installed is one of the page's errors", async () => {
    write("scripts/more.js", 'import nothing from "no-such-package-up";\nexport function start() { nothing(); }\n');
    await until(async () => (await errors()).some((m) => m.includes("no-such-package-up")), 20_000);
    rmSync(join(path, "scripts/more.js"));
  });

  test("the static export carries the modules: served offline, every package does its work", async () => {
    rmSync(out, { recursive: true, force: true });
    const result = (await invoke("export:run", out, "static")) as { folder: string; warnings: string[] };
    expect(result.warnings.filter((w) => w.includes("package"))).toEqual([]);
    for (const file of ["package.json", "pnpm-lock.yaml", "node_modules"])
      expect(existsSync(join(result.folder, file))).toBe(false);
    // A static file server as a host would run it.
    server = createServer((req, res) => {
      const at = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
      let file = join(result.folder, at);
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      if (!file.startsWith(result.folder) || !existsSync(file)) return void res.writeHead(404).end("not found");
      const types: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
      res
        .writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" })
        .end(readFileSync(file));
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const seen = await launched.app.evaluate(async (electron, origin) => {
      const view = new electron.WebContentsView({ webPreferences: { partition: "browser-packages-offline" } });
      // Offline: nothing but the export's own server answers.
      const refused: string[] = [];
      view.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        const local = details.url.startsWith(origin) || details.url.startsWith("devtools:");
        if (!local) refused.push(details.url);
        callback({ cancel: !local });
      });
      await view.webContents.loadURL(`${origin}/`);
      const effects = async () => view.webContents.executeJavaScript("window.__effects");
      for (let i = 0; i < 200 && !(await effects()); i++) await new Promise((r) => setTimeout(r, 50));
      const answer = {
        effects: await effects(),
        chars: await view.webContents.executeJavaScript("document.querySelectorAll('h1 .char').length"),
        modules: await view.webContents.executeJavaScript(
          "performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname).filter((p) => p.startsWith('/assets/packages/')).length",
        ),
        refused,
      };
      view.webContents.close();
      return answer;
    }, origin);
    expect(seen).toEqual({
      effects: { lenis: true, embla: 2, gl: true },
      chars: "Fresh bread".replace(/ /g, "").length,
      modules: listed.length,
      refused: [],
    });
  });
});
