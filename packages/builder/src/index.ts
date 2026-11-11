/// <reference path="./daisyui.d.ts" />
// Builds a project into a static website (decisions: static export at build
// step 1): each page and each fragment rendered once into an HTML file, the
// Tailwind stylesheet compiled from the classes the pages use, daisyUI and
// the theme as files; record pages and the image credits as the preview
// shows them, WebP copies of the images the pages use with srcset (Q156).
// The result is served by any static file host.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { BRIDGE_CSS, infoFile, injectHead, type ProjectSource, Runtime, TAILWIND_THEME } from "@upstart/runtime";
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

/**
 * The files of the project that are not templates, copied as they are: not
 * the datasources, which are in the pages (Q147), nor what is kept beside a
 * media file (its alt text and credits, which are in the pages too).
 */
function isStatic(path: string, files: Set<string>) {
  if (/^(pages|parts|fragments|data)\//.test(path) || path === "theme.css" || path.endsWith(".liquid")) return false;
  if (
    /^media\/.+\.json$/i.test(path) &&
    [...files].some((f) => f !== path && f.startsWith("media/") && infoFile(f) === path)
  )
    return false;
  return true;
}

/** The widths of an image's WebP copies, never wider than the image (Q156). */
export const IMAGE_WIDTHS = [480, 960, 1600, 2400];

/**
 * Makes the WebP copies of an image at the widths given (or at its own width
 * when it is narrower), or undefined for an image kept as it is (a drawing,
 * an animation). Given by the app, which has an image library: the builder
 * itself stays portable.
 */
export type ImageCopies = (
  path: string,
  data: Buffer,
  widths: number[],
) => Promise<{ width: number; data: Buffer }[] | undefined>;

/** The media files an HTML page shows in an <img>, as project paths. */
export function imagesIn(html: string): string[] {
  const out = new Set<string>();
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const path = mediaPath(tag);
    if (path) out.add(path);
  }
  return [...out];
}

function srcOf(tag: string): string | undefined {
  return /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
    .exec(tag)
    ?.slice(1)
    .find((v) => v !== undefined);
}

function mediaPath(tag: string): string | undefined {
  const src = srcOf(tag);
  if (!src || !/^\/?media\/[^?#]+$/i.test(src)) return undefined;
  try {
    return decodeURI(src.replace(/^\//, ""));
  } catch {
    return undefined;
  }
}

/** A copy's address beside its image's: /media/cafe.jpg at 960 gives /media/cafe-960w.webp. */
export function copyAddress(src: string, width: number): string {
  return `${src.replace(/\.[^./]+$/, "")}-${width}w.webp`;
}

/**
 * Gives each <img> of an image with copies a srcset of them, and sizes="100vw"
 * when it has none; its src stays the original, for browsers without WebP.
 * An <img> with a srcset of its own is left as it is.
 */
export function withSrcset(html: string, copies: Map<string, number[]>): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const path = mediaPath(tag);
    const widths = path ? copies.get(path) : undefined;
    if (!widths?.length || /\ssrcset\s*=/i.test(tag)) return tag;
    const src = srcOf(tag)!;
    const srcset = widths.map((w) => `${copyAddress(src, w)} ${w}w`).join(", ");
    const sizes = /\ssizes\s*=/i.test(tag) ? "" : ' sizes="100vw"';
    return tag.replace(/^<img\b/i, `<img srcset="${srcset}"${sizes}`);
  });
}

export async function buildStatic(options: {
  source: ProjectSource;
  outDir: string;
  /** Every file of the project, for the ones copied as they are (images, icons…). */
  files?: string[];
  /** Reads a project file's bytes, for those copies. */
  readFile?: (path: string) => Buffer;
  /** WebP copies of the images the pages use (Q156); without it, the images are only copied. */
  images?: ImageCopies;
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

  // Each page, a record's page and the credits page among them, rendered first:
  // the images they use get their copies before the pages are written.
  const rendered: { rel: string; html: string }[] = [];
  const pages: string[] = [];
  for (const { route, file } of runtime.routes()) {
    const result = runtime.renderRoute(route);
    if (result.status !== 200) {
      warnings.push(`${file} was not exported: ${result.notes.map((n) => n.note).join("; ")}`);
      continue;
    }
    for (const note of result.notes) warnings.push(`${note.file}: ${note.note}`);
    html.push(result.html);
    rendered.push({
      rel: route === "/" ? "index.html" : `${route.slice(1)}/index.html`,
      html: injectHead(result.html, head),
    });
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
    rendered.push({ rel: `fragments/${name}/index.html`, html: result.html });
    fragments.push(`/fragments/${name}`);
  }

  // The images the pages show, in WebP at the widths a screen asks for (Q156).
  const projectFiles = new Set(options.files ?? []);
  const copies = new Map<string, number[]>();
  if (options.images && options.readFile)
    for (const path of imagesIn(html.join("\n"))) {
      if (!projectFiles.has(path)) continue;
      try {
        const made = await options.images(path, options.readFile(path), IMAGE_WIDTHS);
        if (!made?.length) continue;
        for (const copy of made) write(copyAddress(path, copy.width), copy.data);
        copies.set(
          path,
          made.map((c) => c.width).sort((a, b) => a - b),
        );
      } catch (error) {
        warnings.push(`${path}: no smaller copies were made (${error instanceof Error ? error.message : error}).`);
      }
    }
  for (const page of rendered) write(page.rel, withSrcset(page.html, copies));

  // The stylesheet: Tailwind and daisyUI compiled from every word that may be
  // a class, so that only the components the pages use are in it.
  write(`${ASSETS}/site.css`, `${BRIDGE_CSS}\n${await tailwind(candidates(html.join("\n")))}`);
  copyFileSync(resolveFrom.resolve("htmx.org/dist/htmx.min.js"), join(outDir, ASSETS, "htmx.js"));
  written.push(`${ASSETS}/htmx.js`);
  if (theme !== undefined) write("theme.css", theme);

  if (options.files && options.readFile)
    for (const path of options.files) if (isStatic(path, projectFiles)) write(path, options.readFile(path));

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
