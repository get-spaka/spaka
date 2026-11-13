// A template read from a folder or a .zip (Q236, Q240): an Upstart project's
// files plus its manifest, its blocks in blocks/ and its pictures in
// pictures/. Both give the same thing, the files by path, from which the
// template is made; what a new project copies of them is projectFiles().
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { type AddressedLibrary, type Credit, infoFile, memorySource, siteAssets } from "@upstart/runtime";
import { type Block, filesTree, readBlocks } from "../gallery/catalogue";
import { MANIFEST, Manifest } from "./manifest";
import { readZip, safePath, ZIP_LIMITS } from "./zip";

export type TemplateFiles = Map<string, Buffer>;

/** Its pictures (made by template:shoot): pictures/cover.webp, pictures/hover.webp, pictures/pages/<page>-desktop.webp… */
export type TemplatePictures = {
  cover?: string;
  hover?: string;
  pages: { page: string; desktop?: string; phone?: string }[];
};

export type Template = {
  manifest: Manifest;
  files: TemplateFiles;
  blocks: Block[];
  libraries: AddressedLibrary[];
  credits: { path: string; credit?: Credit }[];
  pictures: TemplatePictures;
};

export const PICTURES = "pictures";
export const BLOCKS = "blocks";
export const DESIGN_SKILL = (id: string) => `.upstart/skills/${id}-design`;

/** What a template holds at its root; anything else is not copied into a project. */
export const TEMPLATE_ENTRIES = new Set([
  "template.json",
  "theme.css",
  "pages",
  "parts",
  "fragments",
  "data",
  "media",
  "fonts",
  "scripts",
  "styles",
  "blocks",
  "pictures",
  ".upstart",
  "README.md",
  "LICENSE",
  "LICENSE.md",
  "LICENCE",
  "LICENCE.md",
]);

/** Folders and files never part of a template. */
const LEFT_OUT = new Set([".git", "node_modules", ".DS_Store", "Thumbs.db"]);

/** Of .upstart/, a template keeps its skills and its test records only: never a project's id or history. */
const KEPT_HIDDEN = /^\.upstart\/(?:skills|test-records)\//;

/** The files of a template folder, by path; what is no template's is left out. */
export function readTemplateFolder(dir: string): TemplateFiles {
  const files: TemplateFiles = new Map();
  let total = 0;
  const walk = (abs: string) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (LEFT_OUT.has(entry.name)) continue;
      const child = join(abs, entry.name);
      const path = relative(dir, child).split(sep).join("/");
      if (path.startsWith(".") && !path.startsWith(".upstart")) continue;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && (!path.startsWith(".upstart/") || KEPT_HIDDEN.test(path))) {
        if (files.size >= ZIP_LIMITS.files) throw new Error(`This folder holds more than ${ZIP_LIMITS.files} files.`);
        const bytes = readFileSync(child);
        total += bytes.length;
        if (total > ZIP_LIMITS.bytes)
          throw new Error(`This folder holds more than ${ZIP_LIMITS.bytes / 1024 / 1024} MB.`);
        files.set(path, bytes);
      }
    }
  };
  walk(dir);
  return files;
}

/**
 * The files of a template .zip, by path: at its root, or in the one folder it
 * holds (a folder zipped by the Finder). What is no template's is left out.
 */
export function readTemplateZip(zip: Buffer): TemplateFiles {
  let files = readZip(zip);
  if (!files.has(MANIFEST)) {
    const tops = new Set([...files.keys()].map((p) => p.split("/")[0]));
    const [top] = tops;
    if (tops.size === 1 && files.has(`${top}/${MANIFEST}`))
      files = new Map([...files].map(([p, b]) => [p.slice(`${top}/`.length), b]));
  }
  const kept: TemplateFiles = new Map();
  for (const [path, bytes] of files) {
    const parts = path.split("/");
    if (parts.some((p) => LEFT_OUT.has(p))) continue;
    if (path.startsWith(".") && !(path.startsWith(".upstart/") && KEPT_HIDDEN.test(path))) continue;
    kept.set(path, bytes);
  }
  return kept;
}

/** The files a template is written in, read as text. */
export const TEXT = /\.(?:liquid|md|ya?ml|json|css|js|mjs|txt|svg|html?)$/i;

/** The template's text files as a project source, for the runtime. */
export function textSource(files: TemplateFiles, prefix = "") {
  const texts: Record<string, string> = {};
  for (const [path, bytes] of files)
    if (path.startsWith(prefix) && TEXT.test(path)) texts[path.slice(prefix.length)] = bytes.toString("utf8");
  return memorySource(texts);
}

/**
 * The template, from its files; or why it cannot be one. Only what is needed
 * to show it is checked here: checkTemplate() says whether it is a good one.
 */
export function readTemplate(files: TemplateFiles): { template: Template } | { problems: string[] } {
  const text = files.get(MANIFEST)?.toString("utf8");
  if (text === undefined) return { problems: [`There is no ${MANIFEST} at the template's root.`] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { problems: [`${MANIFEST} is not JSON: ${error instanceof Error ? error.message : error}`] };
  }
  const parsed = Manifest.safeParse(json);
  if (!parsed.success)
    return { problems: parsed.error.issues.map((i) => `${MANIFEST}: ${i.path.join(".") || "the file"}: ${i.message}`) };
  for (const path of files.keys())
    if (!safePath(path)) return { problems: [`Not a path a template may hold: ${path}`] };

  const source = textSource(files);
  const media = [...files.keys()].filter((p) => p.startsWith("media/") && !isInfoFile(p, files));
  const credits = media.map((path) => {
    const info = files.get(infoFile(path))?.toString("utf8");
    try {
      const credit = info ? (JSON.parse(info) as { credit?: Credit }).credit : undefined;
      return credit ? { path, credit } : { path };
    } catch {
      return { path };
    }
  });
  return {
    template: {
      manifest: parsed.data,
      files,
      blocks: readBlocks(filesTree(files, `${BLOCKS}/`)).blocks,
      libraries: siteAssets(source).assets.libraries,
      credits,
      pictures: picturesOf(files),
    },
  };
}

/** media/cafe.json beside media/cafe.jpg. */
function isInfoFile(path: string, files: TemplateFiles): boolean {
  return (
    path.endsWith(".json") &&
    [...files.keys()].some((f) => f !== path && f.startsWith("media/") && infoFile(f) === path)
  );
}

function picturesOf(files: TemplateFiles): TemplatePictures {
  const has = (p: string) => (files.has(p) ? p : undefined);
  const pages = new Map<string, { page: string; desktop?: string; phone?: string }>();
  for (const path of files.keys()) {
    const m = /^pictures\/pages\/([a-z0-9-]+)-(desktop|phone)\.webp$/.exec(path);
    if (!m) continue;
    const entry = pages.get(m[1]!) ?? { page: m[1]! };
    entry[m[2] as "desktop" | "phone"] = path;
    pages.set(m[1]!, entry);
  }
  const cover = has(`${PICTURES}/cover.webp`);
  const hover = has(`${PICTURES}/hover.webp`);
  return {
    ...(cover ? { cover } : {}),
    ...(hover ? { hover } : {}),
    pages: [...pages.values()].sort((a, b) =>
      a.page === "home" ? -1 : b.page === "home" ? 1 : a.page.localeCompare(b.page),
    ),
  };
}

/** What a new project copies of a template: its site's files, not its manifest, pictures, readme or licence (Q240). */
export function projectFiles(files: TemplateFiles): TemplateFiles {
  return new Map(
    [...files].filter(([path]) => {
      const top = path.split("/")[0]!;
      return TEMPLATE_ENTRIES.has(top) && path !== MANIFEST && top !== PICTURES && !/^(?:README|LICEN[CS]E)/.test(top);
    }),
  );
}

/** A page's name in pictures/pages/: "home" for /, "menu" for /menu, "blog-first-post" for /blog/first-post. */
export function pageName(route: string): string {
  return route === "/"
    ? "home"
    : route
        .slice(1)
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase();
}
