/// <reference path="./daisyui.d.ts" />
// What the builders share: the pages and fragments rendered once, the WebP
// copies of the images they show (Q156), the Tailwind stylesheet compiled
// from the classes used, htmx, and the files copied as they are.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  ASSETS,
  BRIDGE_CSS,
  copyAddress,
  daisyuiBelowComponents,
  imagesIn,
  infoFile,
  LAYER_ORDER,
  type ProjectSource,
  Runtime,
  START_JS,
  START_SCRIPT,
  siteAssets,
  TAILWIND_THEME,
  themeStyle,
} from "@spaka/runtime";
import { compile } from "tailwindcss";
import type { BuildOptions, BuildProject, ImageCopies } from "./builder.ts";

const resolveFrom = createRequire(import.meta.url);

/** The widths of an image's WebP copies, never wider than the image (Q156). */
export const IMAGE_WIDTHS = [480, 960, 1600, 2400];

/** Writes files under a folder and remembers them, relative to the export's folder. */
export class Output {
  constructor(
    private readonly root: string,
    private readonly prefix = "",
    readonly files: string[] = [],
  ) {}
  /** The same output, writing under a subfolder (public/). */
  under(folder: string): Output {
    return new Output(this.root, `${this.prefix}${folder}/`, this.files);
  }
  write(rel: string, content: string | Buffer) {
    const abs = join(this.root, this.prefix + rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    this.files.push(this.prefix + rel);
  }
}

export type RenderedFile = { rel: string; html: string; file: string; datasources: string[] };

/** Every page (a record's page and the credits page among them) and every fragment, rendered once. */
export function renderSite(source: ProjectSource) {
  const runtime = new Runtime(source, { repair: false, trace: false });
  const warnings: string[] = [];
  const pages: (RenderedFile & { route: string })[] = [];
  for (const { route, file } of runtime.routes()) {
    const result = runtime.renderRoute(route);
    if (result.status !== 200) {
      warnings.push(`${file} was not exported: ${result.notes.map((n) => n.note).join("; ")}`);
      continue;
    }
    for (const note of result.notes) warnings.push(`${note.file}: ${note.note}`);
    pages.push({
      route,
      file,
      rel: route === "/" ? "index.html" : `${route.slice(1)}/index.html`,
      html: result.html,
      datasources: result.datasources ?? [],
    });
  }
  const fragments: (RenderedFile & { name: string; params: boolean })[] = [];
  for (const file of source.list("fragments")) {
    const name = /^fragments\/([\w-]+)\.liquid$/.exec(file)?.[1];
    if (!name) continue;
    const result = runtime.renderFragment(name, { params: {} });
    if (result.status !== 200) {
      warnings.push(`${file} was not exported: ${result.notes.map((n) => n.note).join("; ")}`);
      continue;
    }
    fragments.push({
      name,
      file,
      rel: `fragments/${name}/index.html`,
      html: result.html,
      datasources: result.datasources ?? [],
      params: /\bparams\b/.test(source.read(file) ?? ""),
    });
  }
  return { runtime, pages, fragments, warnings };
}

/** The datasources the forms of some HTML send to (/_data/<name>). */
export function formsIn(html: string): string[] {
  const names = new Set<string>();
  for (const tag of html.match(/<form\b[^>]*>/gi) ?? []) {
    const name = /\s(?:hx-post|action)\s*=\s*["']?\/_data\/([\w-]+)/i.exec(tag)?.[1];
    if (name) names.add(name);
  }
  return [...names];
}

/** What a project's pages do with what visitors send: the collected datasources they show, and those they have a form for. */
export function collectedUse(project: BuildProject): { shown: string[]; forms: string[] } {
  const { runtime, pages, fragments } = renderSite(project.source);
  const collected = (name: string) => !!runtime.data.definition(name).definition?.collected;
  const all = [...pages, ...fragments];
  const shown = new Set(all.flatMap((p) => p.datasources).filter(collected));
  const forms = new Set(all.flatMap((p) => formsIn(p.html)).filter(collected));
  return { shown: [...shown].sort(), forms: [...forms].sort() };
}

/** The collected datasources (Q171) a rendered page or fragment shows. */
export function shownCollected(project: BuildProject): string[] {
  return collectedUse(project).shown;
}

/** The WebP copies of the images the pages show, written beside them; their widths by image. */
export async function writeImageCopies(
  html: string,
  project: BuildProject,
  images: ImageCopies | undefined,
  out: Output,
  warnings: string[],
): Promise<Map<string, number[]>> {
  const copies = new Map<string, number[]>();
  if (!images) return copies;
  const files = new Set(project.files);
  for (const path of imagesIn(html)) {
    if (!files.has(path)) continue;
    try {
      const made = await images(path, project.readFile(path), IMAGE_WIDTHS);
      if (!made?.length) continue;
      for (const copy of made) out.write(copyAddress(path, copy.width), copy.data);
      copies.set(
        path,
        made.map((c) => c.width).sort((a, b) => a - b),
      );
    } catch (error) {
      warnings.push(`${path}: no smaller copies were made (${error instanceof Error ? error.message : error}).`);
    }
  }
  return copies;
}

/**
 * The files of the project that are not templates, copied as they are: not
 * the datasources, which are in the pages (Q147), nor what is kept beside a
 * media file (its alt text and credits, which are in the pages too).
 */
export function isStatic(path: string, files: Set<string>) {
  // blocks/: a template's blocks, which the Blocks tab offers (Q235), not files of the site. A
  // stylesheet of styles/ is compiled into site.css; the pictures beside it are served as they are.
  if (/^(pages|parts|fragments|data|blocks)\//.test(path) || path === "theme.css" || path.endsWith(".liquid"))
    return false;
  if (/^styles\/.+\.css$/i.test(path)) return false;
  if (
    /^media\/.+\.json$/i.test(path) &&
    [...files].some((f) => f !== path && f.startsWith("media/") && infoFile(f) === path)
  )
    return false;
  return true;
}

/**
 * What every site serves as it is: the stylesheet compiled from the classes
 * the given HTML and templates use, htmx, the theme and the project's own
 * files (images, icons…).
 */
export async function writeAssets(project: BuildProject, out: Output, texts: string[]) {
  const { assets } = siteAssets(project.source);
  const styles = assets.styles.map((p) => project.source.read(p) ?? "").join("\n");
  out.write(`${ASSETS}/site.css`, await siteStylesheet(candidates(texts.join("\n")), styles));
  out.write(`${ASSETS}/htmx.js`, readFileSync(resolveFrom.resolve("htmx.org/dist/htmx.min.js")));
  if (assets.modules.length) out.write(`${ASSETS}/${START_SCRIPT}`, START_JS);
  const theme = project.source.read("theme.css");
  if (theme !== undefined) out.write("theme.css", themeStyle(theme));
  const files = new Set(project.files);
  for (const path of project.files) if (isStatic(path, files)) out.write(path, project.readFile(path));
}

/** The project's text files a published site's runtime reads (site.json). */
export function siteFiles(project: BuildProject): Record<string, string> {
  const files: Record<string, string> = {};
  for (const path of project.files) {
    const read =
      /^(pages|parts|fragments)\/.+\.liquid$/.test(path) ||
      /^data\/.+\.(md|ya?ml|json)$/i.test(path) ||
      path === "theme.css" ||
      /^media\/.+\.json$/i.test(path);
    if (!read) continue;
    const text = project.source.read(path);
    if (text !== undefined) files[path] = text;
  }
  return files;
}

/** The templates' own text, for the classes of what is shown only once published (what visitors send). */
export function templateTexts(project: BuildProject): string[] {
  return ["pages", "parts", "fragments"].flatMap((dir) =>
    project.source.list(dir).map((f) => project.source.read(f) ?? ""),
  );
}

/** The export's .env: the website's management token (Q191), read by the server or sent by wrangler at deploy. */
export function writeEnv(out: Output, token: string | undefined) {
  if (!token) return;
  out.write(
    ".env",
    `# The website's management token, with which Spaka reads what visitors send. Keep it private.\nSPAKA_TOKEN=${token}\n`,
  );
}

/** A name for what an export creates: lower case, letters, digits and dashes. */
export function slug(name: string, fallback = "website"): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
  return /^[a-z]/.test(s) ? s : s ? `site-${s}` : fallback;
}

/** Every token of the HTML that could be a Tailwind class; Tailwind ignores the others. */
export function candidates(html: string): string[] {
  return [...new Set(html.split(/[\s"'`<>=]+/).filter((t) => t && t.length < 200))];
}

/**
 * The site's stylesheet: the layers' order first, so that daisyUI's components
 * come before the site's own (LAYER_ORDER, as in the preview), the bridge to
 * the theme, then Tailwind's and daisyUI's compiled for these classes.
 */
export async function siteStylesheet(classes: string[], styles = ""): Promise<string> {
  return `${LAYER_ORDER}\n${BRIDGE_CSS}\n${daisyuiBelowComponents(await tailwind(classes, styles))}`;
}

let base: string | undefined;
/** The stylesheet for these classes, the site's own styles/*.css compiled with them (ADR 0011). */
async function tailwind(classes: string[], styles = ""): Promise<string> {
  base ??= readFileSync(resolveFrom.resolve("tailwindcss/index.css"), "utf8");
  const compiler = await compile(`${base}\n@plugin "daisyui";\n${TAILWIND_THEME}\n${styles}`, {
    loadModule: async (id, from) => {
      if (id !== "daisyui") throw new Error(`Unexpected plugin: ${id}`);
      return { module: (await import("daisyui")).default, base: from, path: id };
    },
  });
  return compiler.build(classes);
}

/**
 * What the Node and Cloudflare exports share: public/ with the files served
 * as they are (the stylesheet compiled from the templates too, for what is
 * shown only once visitors send it), site.json for the runtime, and the
 * server the app ships.
 */
export async function writePublishedSite(project: BuildProject, options: BuildOptions, out: Output, server: string) {
  if (!options.serverBundle) throw new Error(`This export needs the app's ${server}, which was not given.`);
  const { pages, fragments, warnings } = renderSite(project.source);
  const html = [...pages, ...fragments].map((p) => p.html).join("\n");
  const pub = out.under("public");
  const copies = await writeImageCopies(html, project, options.images, pub, warnings);
  await writeAssets(project, pub, [html, ...templateTexts(project)]);
  out.write(
    "site.json",
    JSON.stringify({
      files: siteFiles(project),
      images: Object.fromEntries(copies),
      assets: siteAssets(project.source).assets,
    }),
  );
  out.write(server, options.serverBundle);
  return {
    pages: pages.map((p) => p.route),
    fragments: fragments.map((f) => `/fragments/${f.name}`),
    warnings,
  };
}
