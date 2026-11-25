// A site's own JavaScript and stylesheet (ADR 0011): libraries in scripts/lib/
// or given by their address in scripts/libraries.json, the site's modules in
// scripts/*.js, each exporting start(root) and maybe stop(root), and its
// stylesheet in styles/*.css. Pages never load them: Spaka puts them in the
// head, and its start script calls the modules when a page loads and when
// htmx brings new content. In the preview, the page stays still until the
// preview says it is in visitor mode (Q242).
import type { ProjectSource } from "./source.ts";

/** A library loaded from its address on every visit (Q241). */
export type AddressedLibrary = { name: string; url: string; licence?: string };

/** What a site brings beside its templates, as the head loads it. */
export type SiteAssets = {
  /** Loaded from their addresses, first. */
  libraries: AddressedLibrary[];
  /** scripts/lib/*.js, as project paths, in name order. */
  lib: string[];
  /** scripts/*.js, the site's modules, in name order. */
  modules: string[];
  /** styles/*.css, as project paths, in name order. */
  styles: string[];
};

export const NO_ASSETS: SiteAssets = { libraries: [], lib: [], modules: [], styles: [] };

/** The site's scripts and stylesheets, read from its files; a malformed libraries.json is a note. */
export function siteAssets(source: ProjectSource): { assets: SiteAssets; notes: string[] } {
  const notes: string[] = [];
  const libraries: AddressedLibrary[] = [];
  const listed = source.read("scripts/libraries.json");
  if (listed !== undefined) {
    try {
      const parsed: unknown = JSON.parse(listed);
      const items = Array.isArray(parsed) ? parsed : [];
      if (!Array.isArray(parsed)) notes.push("scripts/libraries.json: a list of { name, url } is expected");
      for (const item of items) {
        const { name, url, licence } = (item ?? {}) as Record<string, unknown>;
        if (typeof name === "string" && typeof url === "string" && /^https:\/\/[^\s"'<>]+$/.test(url))
          libraries.push({ name, url, ...(typeof licence === "string" ? { licence } : {}) });
        else notes.push(`scripts/libraries.json: ${JSON.stringify(item)} needs a name and an https address`);
      }
    } catch (error) {
      notes.push(`scripts/libraries.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const scripts = source.list("scripts");
  return {
    assets: {
      libraries,
      lib: scripts.filter((p) => /^scripts\/lib\/[^/]+\.js$/.test(p)),
      modules: scripts.filter((p) => /^scripts\/[^/]+\.m?js$/.test(p)),
      styles: source.list("styles").filter((p) => /^styles\/[^/]+\.css$/.test(p)),
    },
    notes,
  };
}

/** Whether a site has anything that moves by script. */
export function hasScripts(assets: SiteAssets): boolean {
  return assets.libraries.length + assets.lib.length + assets.modules.length > 0;
}

/**
 * The head's script tags. Once published: the libraries, then Spaka's start
 * script with the modules it imports. In the preview (`wait`): the start
 * script alone, which loads the libraries and the modules only once told the
 * page is in visitor mode, so that no script of the site runs while it is
 * edited (Q242, ADR 0011).
 */
export function scriptTags(assets: SiteAssets, startSrc: string, { wait }: { wait: boolean }) {
  if (!hasScripts(assets)) return [];
  const libraries = [...assets.libraries.map((l) => l.url), ...assets.lib.map((p) => `/${p}`)];
  const modules = escapeAttr(assets.modules.map((p) => `/${p}`).join(" "));
  if (wait)
    return [
      `<script src="${escapeAttr(startSrc)}" data-libraries="${escapeAttr(libraries.join(" "))}" data-modules="${modules}" data-wait defer data-spaka-runtime></script>`,
    ];
  const tags = libraries.map((src) => `<script src="${escapeAttr(src)}"></script>`);
  if (assets.modules.length)
    tags.push(`<script src="${escapeAttr(startSrc)}" data-modules="${modules}" defer></script>`);
  return tags;
}

/**
 * In the preview, while the page is not in visitor mode: no animation and no
 * transition, so that the page is edited in its final state (Q242).
 */
export const STILL_CSS = `html:not([data-spaka-moving]) *, html:not([data-spaka-moving]) *::before, html:not([data-spaka-moving]) *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }`;

/**
 * Spaka's start script, the same in the preview and once published. It
 * imports the site's modules and calls start(document) once the page has
 * loaded, then start(root) on what htmx brings in. In the preview (data-wait)
 * it waits for window.__spakaStart.go(). Before a new rendering takes the page's
 * place, the preview calls stop(), which runs each module's stop(document) at
 * once, on the page its start changed; once the rendering is complete, start()
 * runs start(document) again.
 */
export const START_JS = `(() => {
  const me = document.currentScript;
  // In the console, where the preview reads the page's errors and shows them to the agent.
  const report = (message, error) =>
    console.error("[spaka] " + message + (error ? ": " + (error.message || error) : ""));
  const list = (name) => (me && me.dataset[name] || "").split(" ").filter(Boolean);
  const paths = list("modules");
  // In the preview, the libraries too wait for visitor mode, loaded one after the other.
  const libraries = list("libraries");
  const script = (src) => new Promise((done) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => done();
    el.onerror = () => { report("could not load " + src); done(); };
    document.head.append(el);
  });
  let modules = [];
  let started = false;
  const each = async (fn, root) => {
    for (const { path, module } of modules) {
      if (typeof module[fn] !== "function") continue;
      try { await module[fn](root); } catch (error) { report(path + ": " + fn + "() failed", error); }
    }
  };
  const load = () => Promise.all(paths.map((path) => import(path).then(
    (module) => ({ path, module }),
    (error) => { report("could not load " + path, error); return { path, module: {} }; },
  )));
  const go = async () => {
    if (started) return;
    started = true;
    for (const src of libraries) await script(src);
    modules = await load();
    await each("start", document);
  };
  document.addEventListener("htmx:after:process", (event) => {
    const root = event.target;
    if (!started || root === document.body || root === document.documentElement) return;
    void each("start", root);
  });
  // Stopped at once, not awaited: the preview changes the page right after.
  let stopped = false;
  const stop = () => {
    if (!started || stopped) return;
    stopped = true;
    for (const { path, module } of modules) {
      if (typeof module.stop !== "function") continue;
      try {
        const done = module.stop(document);
        if (done && typeof done.catch === "function") done.catch((error) => report(path + ": stop() failed", error));
      } catch (error) { report(path + ": stop() failed", error); }
    }
  };
  const start = async () => {
    if (!started || !stopped) return;
    stopped = false;
    await each("start", document);
  };
  window.__spakaStart = {
    go,
    stop,
    start,
    get started() { return started; },
  };
  if (me && me.hasAttribute("data-wait")) return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void go());
  else void go();
})();
`;

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
