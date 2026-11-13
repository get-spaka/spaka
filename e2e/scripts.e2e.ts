import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// A site's own JavaScript and stylesheet (ADR 0011), with the recorded agent's
// bakery: in visitor mode its libraries load and its modules start, on load,
// on what htmx brings and again after each new rendering; in edit mode none of
// it runs and nothing moves (Q242); a changed script loads the page again, a
// changed stylesheet restyles it in place. And what a script of the page can
// reach of the app: nothing.
describe("a site's scripts", () => {
  let launched: LaunchedApp;
  let path: string;
  const { invoke, until, page } = previewDriver(() => launched);
  const write = (file: string, text: string) => {
    mkdirSync(join(path, file, ".."), { recursive: true });
    writeFileSync(join(path, file), text);
  };
  const module = (version: number) => `
export function start(root) {
  window.__version = ${version};
  if (root === document) window.__starts = (window.__starts || 0) + 1;
  // The root is the document, or what htmx brought in: an element that may be the one itself.
  const all = root === document ? [...document.querySelectorAll(".more")] : [root, ...root.querySelectorAll(".more")];
  for (const el of all) if (el.matches(".more")) el.dataset.started = "yes";
}
export function stop() {
  window.__stops = (window.__stops || 0) + 1;
}
`;
  const home = (title: string) =>
    `<!doctype html><html lang="en"><head><title>Home</title></head><body><main>
<h1 class="headline">${title}</h1>
<button id="load" hx-get="/fragments/more" hx-target="#more" hx-swap="innerHTML">More</button>
<div id="more"></div>
</main></body></html>`;
  const moving = () => page("document.documentElement.hasAttribute('data-up-moving')");
  const animation = () => page("getComputedStyle(document.querySelector('h1')).animationName");

  beforeAll(async () => {
    launched = await launchApp();
    await launched.window.getByTestId("conversation").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    path = (await invoke("projects:current")).path;
    await invoke("preview:set-view", "page");
    write("fragments/more.liquid", `<p class="more">Fresh at seven</p>`);
    write("scripts/lib/marker.js", "window.__lib = (window.__lib || 0) + 1;");
    write("scripts/site.js", module(1));
    write(
      "styles/site.css",
      "@keyframes rise { from { opacity: 0.2; } to { opacity: 1; } }\n.headline { animation: rise 30s infinite; color: rgb(1, 2, 3); }",
    );
    write("pages/index.liquid", home("Bread since 1952"));
    await invoke("preview:navigate", "/");
    await until(() => page("document.querySelector('h1')?.textContent === 'Bread since 1952'"));
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("in visitor mode, the default, the libraries load and the modules start (Q253)", async () => {
    await until(() => page("window.__starts >= 1"));
    expect(await moving()).toBe(true);
    expect(await page("window.__lib")).toBe(1);
    expect(await page("window.__version")).toBe(1);
    expect(await animation()).toBe("rise");
    // The site's stylesheet, compiled in the page with Tailwind's.
    expect(await page("getComputedStyle(document.querySelector('h1')).color")).toBe("rgb(1, 2, 3)");
  });

  test("what htmx brings is started too", async () => {
    // A new rendering of the page, after the files written above, puts #more back as the page has it:
    // the click is made again until what it brought stays.
    await until(async () => {
      await page("document.querySelector('#load')?.click()");
      await new Promise((r) => setTimeout(r, 700));
      return page("document.querySelector('.more')?.dataset.started === 'yes'");
    }, 15_000);
  });

  test("a new rendering stops the modules and starts them again", async () => {
    const before = await page("({ starts: window.__starts, stops: window.__stops || 0 })");
    write("pages/index.liquid", home("Bread since 1953"));
    await until(() => page("document.querySelector('h1')?.textContent === 'Bread since 1953'"));
    await until(async () => (await page("window.__stops || 0")) > before.stops);
    // As many starts again as stops, without loading the page again.
    await until(
      async () => (await page("window.__starts")) - before.starts === (await page("window.__stops")) - before.stops,
    );
  });

  test("a changed stylesheet restyles the page in place; a changed script loads it again", async () => {
    await page("window.__stayed = true");
    write(
      "styles/site.css",
      "@keyframes rise { from { opacity: 0.2; } to { opacity: 1; } }\n.headline { animation: rise 30s infinite; color: rgb(4, 5, 6); }",
    );
    await until(async () => (await page("getComputedStyle(document.querySelector('h1')).color")) === "rgb(4, 5, 6)");
    expect(await page("window.__stayed")).toBe(true);
    write("scripts/site.js", module(2));
    await until(async () => (await page("window.__version")) === 2, 15_000);
    expect(await page("window.__stayed")).toBeUndefined();
  });

  test("in edit mode no script of the site runs and nothing moves (Q242)", async () => {
    await invoke("preview:set-mode", "edit");
    // Leaving visitor mode loads the page again, for HTML no module has changed.
    await until(async () => (await page("window.__lib")) === undefined && !(await moving()));
    await until(() => page("!!document.querySelector('h1')"));
    expect(await animation()).toBe("none");
    expect(await page("window.__version")).toBeUndefined();
    expect(await page("window.__starts")).toBeUndefined();
    // Not one script of the site in the page, nor fetched.
    expect(await page("document.querySelectorAll('script:not([data-up-runtime])').length")).toBe(0);
    expect(
      await page("performance.getEntriesByType('resource').filter((e) => e.name.includes('/scripts/')).length"),
    ).toBe(0);
    await invoke("preview:set-mode", "visitor");
    await until(() => page("window.__version === 2 && window.__lib === 1"));
    expect(await animation()).toBe("rise");
  });

  test("a script of the page reaches nothing of the app (ADR 0011)", async () => {
    const reach = await page(`(() => ({
      require: typeof require, process: typeof process, module: typeof module, upstart: typeof window.upstart,
      ipcRenderer: typeof window.ipcRenderer, electron: typeof window.electron, bridge: typeof window.__upstartBridge,
      opener: window.opener === null || window.opener === undefined,
      editorRoot: document.querySelector('upstart-editor') ? 'host' : 'none',
    }))()`);
    expect(reach).toEqual({
      require: "undefined",
      process: "undefined",
      module: "undefined",
      upstart: "undefined",
      ipcRenderer: "undefined",
      electron: "undefined",
      bridge: "undefined",
      opener: true,
      editorRoot: "host",
    });
    // A window it opens is refused.
    expect(await page("window.open('/') === null")).toBe(true);
    // Its own files only: the preview serves nothing above the project.
    expect(await page("fetch('/../../../../etc/hosts').then((r) => r.status)")).toBe(404);
    expect(await page("fetch('/%2e%2e/%2e%2e/etc/hosts').then((r) => r.status)")).toBe(404);
    // The project was not changed by any of it.
    expect(readFileSync(join(path, "pages/index.liquid"), "utf8")).toContain("Bread since 1953");
  });
});
