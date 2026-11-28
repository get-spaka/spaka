// A site's own JavaScript and stylesheet (ADR 0011): the site's modules in
// scripts/*.js, each exporting start(root) and maybe stop(root), the packages
// they import by name (ADR 0013), and its stylesheet in styles/*.css. Pages
// never load them: Spaka puts them in the head, an import map points each
// package to its module, and the start script calls the modules when a page
// loads and when htmx brings new content. In the preview, the page stays
// still until the preview says it is in visitor mode (Q242).
import type { ProjectSource } from "./source.ts";

/** What a site brings beside its templates, as the head loads it. */
export type SiteAssets = {
  /** scripts/*.js, the site's modules, in name order. */
  modules: string[];
  /** styles/*.css, as project paths, in name order. */
  styles: string[];
  /**
   * The packages the scripts import by name, installed, in the order of
   * their specifiers: the import map. Absent from the site.json of an export
   * made before packages.
   */
  packages?: PackageImport[];
};

export const NO_ASSETS: SiteAssets = { modules: [], styles: [], packages: [] };

/** Where the preview and an export serve the modules of the packages a site's scripts import (ADR 0013). */
export const PACKAGES_BASE = "/assets/packages";

/**
 * A package a site's scripts import by its name (ADR 0013), as the page's
 * import map points to it: one ES module for each name or path inside a
 * package that the scripts import, made by Spaka's Rolldown from the installed
 * version.
 */
export type PackageImport = {
  /** As the scripts write it: "embla-carousel", "three/addons/controls/OrbitControls.js". */
  specifier: string;
  /** The package's name, and its version installed in node_modules. */
  name: string;
  version: string;
  /** Where its module is served: /assets/packages/<name>@<version>[/<path>].js */
  url: string;
};

/** A package's name, then maybe a path inside it. */
const PACKAGE_SPECIFIER = /^((?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*)(?:\/(.+))?$/;
/** A path inside a package that the page's address can hold as it is. */
const PACKAGE_PATH = /^(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._~@+-]+(?:\/[A-Za-z0-9._~@+-]+)*$/;

/**
 * Every specifier a script imports: `import … from "x"`, `import "x"`,
 * `export … from "x"` and `import("x")`, comments left out, a word "from"
 * elsewhere in the code ("lunch-from") never taken for one.
 */
export function moduleSpecifiers(code: string): string[] {
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const found = new Set<string>();
  const statements = /(?:^|[;}])\s*(?:import|export)\s*(?:[\w$*{}\s,]+?\s*\bfrom\s*)?(["'])([^"'\n]+)\1/g;
  const dynamic = /\bimport\s*\(\s*(["'])([^"'\n]+)\1\s*[,)]/g;
  for (const match of [...bare.matchAll(statements), ...bare.matchAll(dynamic)]) found.add(match[2] ?? "");
  return [...found];
}

/** What a script imports by a name rather than by a path or an address. */
export function importedSpecifiers(code: string): string[] {
  return moduleSpecifiers(code).filter((s) => !/^[./]/.test(s) && !/^[a-z][a-z0-9+.-]*:/i.test(s));
}

/** The package a bare specifier names, and the path inside it; nothing when it names none. */
export function specifierPackage(specifier: string): { name: string; path?: string } | undefined {
  const parsed = PACKAGE_SPECIFIER.exec(specifier);
  const name = parsed?.[1];
  const path = parsed?.[2];
  if (!name || (path !== undefined && !PACKAGE_PATH.test(path))) return undefined;
  return path === undefined ? { name } : { name, path };
}

/** Where a package's module is served: its name and version, then the path inside it, ending in .js. */
export function packageUrl(name: string, version: string, path = ""): string {
  return `${PACKAGES_BASE}/${name}@${version}${path ? `/${path.replace(/\.m?js$/, "")}` : ""}.js`;
}

/** The version of a package installed in the project's node_modules. */
function installedVersion(source: ProjectSource, name: string): string | undefined {
  try {
    const version: unknown = JSON.parse(source.read(`node_modules/${name}/package.json`) ?? "").version;
    return typeof version === "string" && /^\d+\.\d+\.\d+[0-9A-Za-z.+-]*$/.test(version) ? version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The import map's entries: what the site's scripts import by name, from the
 * packages installed. A package imported but not installed, or a name that
 * is none, is a note for the agent.
 */
export function packageImports(
  source: ProjectSource,
  scripts: string[],
): { packages: PackageImport[]; notes: string[] } {
  const notes: string[] = [];
  const byName = new Map<string, PackageImport>();
  const missing = new Set<string>();
  for (const path of scripts) {
    if (!/\.m?js$/.test(path)) continue;
    for (const specifier of importedSpecifiers(source.read(path) ?? "")) {
      if (byName.has(specifier)) continue;
      const named = specifierPackage(specifier);
      if (!named) {
        notes.push(`${path}: "${specifier}" is not the name of a package, nor a path inside one.`);
        continue;
      }
      const { name, path: inside } = named;
      const version = installedVersion(source, name);
      if (!version) {
        if (!missing.has(name))
          notes.push(`${path} imports ${name}, which is not installed: add it with add_package first.`);
        missing.add(name);
        continue;
      }
      byName.set(specifier, { specifier, name, version, url: packageUrl(name, version, inside) });
    }
  }
  return { packages: [...byName.values()].sort((a, b) => a.specifier.localeCompare(b.specifier)), notes };
}

/**
 * The site's scripts and stylesheets, read from its files. The libraries a
 * site made before packages lists by their address in scripts/libraries.json
 * are no longer loaded: a note says so.
 */
export function siteAssets(source: ProjectSource): { assets: SiteAssets; notes: string[] } {
  const scripts = source.list("scripts");
  const notes =
    source.read("scripts/libraries.json") !== undefined
      ? [
          "scripts/libraries.json: no longer loaded. Add each library with add_package, import it by its name in the modules, then remove the file.",
        ]
      : [];
  const { packages, notes: imports } = packageImports(source, scripts);
  return {
    assets: {
      modules: scripts.filter((p) => /^scripts\/[^/]+\.m?js$/.test(p)),
      styles: source.list("styles").filter((p) => /^styles\/[^/]+\.css$/.test(p)),
      packages,
    },
    notes: [...notes, ...imports],
  };
}

/**
 * The head's script tags: the import map, which points the packages the
 * scripts import to their modules (ADR 0013), then Spaka's start script with
 * the modules it imports. In the preview (`wait`), the start script loads the
 * modules only once told the page is in visitor mode, so that no script of
 * the site runs while it is edited (Q242, ADR 0011).
 */
export function scriptTags(assets: SiteAssets, startSrc: string, { wait }: { wait: boolean }) {
  if (!assets.modules.length) return [];
  const map = importMap(assets.packages ?? []);
  const modules = escapeAttr(assets.modules.map((p) => `/${p}`).join(" "));
  const runtime = wait ? " data-spaka-runtime" : "";
  return [
    ...(map ? [`<script type="importmap"${runtime}>${map}</script>`] : []),
    `<script src="${escapeAttr(startSrc)}" data-modules="${modules}"${wait ? " data-wait" : ""} defer${runtime}></script>`,
  ];
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

/** The import map's JSON, safe inside a <script> element; nothing without packages. */
export function importMap(packages: PackageImport[]): string {
  if (!packages.length) return "";
  const imports = Object.fromEntries(packages.map((p) => [p.specifier, p.url]));
  return JSON.stringify({ imports }).replace(/</g, "\\u003c");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
