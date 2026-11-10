/// <reference path="./daisyui.d.ts" />
// Builds a project into a static website (decisions: static export at build
// step 1): each page and each fragment rendered once into an HTML file, the
// Tailwind stylesheet compiled from the classes the pages use, daisyUI and
// the theme as files. The result is served by any static file host.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { BRIDGE_CSS, injectHead, type ProjectSource, Runtime, TAILWIND_THEME } from "@upstart/runtime";
import { compile } from "tailwindcss";

const resolveFrom = createRequire(import.meta.url);

export type BuildResult = {
  /** Files written, relative to the output folder. */
  files: string[];
  pages: string[];
  fragments: string[];
  /** What the static site cannot do the way the preview does. */
  warnings: string[];
};

/** Where the site's own assets go, and the head every page gets. */
export const ASSETS = "assets";

export function exportHead(hasTheme: boolean): string {
  return [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    hasTheme ? `<link rel="stylesheet" href="/theme.css">` : "",
    `<link rel="stylesheet" href="/${ASSETS}/site.css">`,
    `<script src="/${ASSETS}/htmx.js" defer></script>`,
  ].join("");
}

/** The files of the project that are not templates: copied as they are. */
function isStatic(path: string) {
  return !/^(pages|parts|fragments)\//.test(path) && path !== "theme.css" && !path.endsWith(".liquid");
}

export async function buildStatic(options: {
  source: ProjectSource;
  outDir: string;
  /** Every file of the project, for the ones copied as they are (images, icons…). */
  files?: string[];
  /** Reads a project file's bytes, for those copies. */
  readFile?: (path: string) => Buffer;
}): Promise<BuildResult> {
  const { source, outDir } = options;
  const runtime = new Runtime(source, { repair: false, trace: false });
  const theme = source.read("theme.css");
  const head = exportHead(theme !== undefined);
  const written: string[] = [];
  const warnings: string[] = [];
  const html: string[] = [];
  const write = (rel: string, content: string | Buffer) => {
    const abs = join(outDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    written.push(rel);
  };

  const pages: string[] = [];
  for (const { route, file } of runtime.routes()) {
    const result = runtime.renderPage(file, route);
    if (result.status !== 200) {
      warnings.push(`${file} was not exported: ${result.notes.map((n) => n.note).join("; ")}`);
      continue;
    }
    for (const note of result.notes) warnings.push(`${note.file}: ${note.note}`);
    html.push(result.html);
    write(route === "/" ? "index.html" : `${route.slice(1)}/index.html`, injectHead(result.html, head));
    pages.push(route);
  }

  const fragments: string[] = [];
  for (const file of source.list("fragments")) {
    const name = /^fragments\/([\w-]+)\.liquid$/.exec(file)?.[1];
    if (!name) continue;
    if (/\bparams\b/.test(source.read(file) ?? ""))
      warnings.push(`${file} reads its parameters: a static site serves it once, without them.`);
    const result = runtime.renderFragment(name, { params: {} });
    if (result.status !== 200) {
      warnings.push(`${file} was not exported: ${result.notes.map((n) => n.note).join("; ")}`);
      continue;
    }
    html.push(result.html);
    write(`fragments/${name}/index.html`, result.html);
    fragments.push(`/fragments/${name}`);
  }

  // The stylesheet: Tailwind and daisyUI compiled from every word that may be
  // a class, so that only the components the pages use are in it.
  write(`${ASSETS}/site.css`, `${BRIDGE_CSS}\n${await tailwind(candidates(html.join("\n")))}`);
  copyFileSync(resolveFrom.resolve("htmx.org/dist/htmx.min.js"), join(outDir, ASSETS, "htmx.js"));
  written.push(`${ASSETS}/htmx.js`);
  if (theme !== undefined) write("theme.css", theme);

  if (options.files && options.readFile)
    for (const path of options.files) if (isStatic(path)) write(path, options.readFile(path));

  return { files: written, pages, fragments, warnings };
}

/** Every token of the HTML that could be a Tailwind class; Tailwind ignores the others. */
export function candidates(html: string): string[] {
  return [...new Set(html.split(/[\s"'`<>=]+/).filter((t) => t && t.length < 200))];
}

let base: string | undefined;
async function tailwind(classes: string[]): Promise<string> {
  base ??= readFileSync(resolveFrom.resolve("tailwindcss/index.css"), "utf8");
  const compiler = await compile(`${base}\n@plugin "daisyui";\n${TAILWIND_THEME}`, {
    loadModule: async (id, from) => {
      if (id !== "daisyui") throw new Error(`Unexpected plugin: ${id}`);
      return { module: (await import("daisyui")).default, base: from, path: id };
    },
  });
  return compiler.build(classes);
}
