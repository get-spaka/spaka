// The media library (Q149, Q155, Q169): files in media/, each image with a
// file beside it holding its alternative text and its credits. An image is
// made at most 2400 px wide when it is added, turned upright, in its own
// format; an SVG, a GIF and a document are kept as they are.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { infoFile, type MediaInfo } from "@upstart/runtime";
import type { ImageFinder } from "./search";

export const MAX_WIDTH = 2400;

/** A file name made of lowercase letters, digits and dashes, from any words. */
export function slug(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\.[a-z0-9]{2,4}$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "image"
  );
}

/** A name not taken in media/ by any file, whatever its extension: cafe, then cafe-2… */
export function freeName(dir: string, wanted: string): string {
  const taken = new Set(existsSync(dir) ? readdirSync(dir).map((f) => f.replace(/\.[^.]+$/, "")) : []);
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; ; n++) if (!taken.has(`${wanted}-${n}`)) return `${wanted}-${n}`;
}

const EXTENSIONS: Record<string, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
  svg: "svg",
  avif: "avif",
};

export type Added = { path: string; width?: number; height?: number };

/**
 * Adds an image to media/ under a name made from `name`, at most 2400 px
 * wide, with its alternative text and credits beside it. Returns its path
 * from the project's root ("media/cafe.jpg").
 */
export async function addImage(root: string, name: string, bytes: Buffer, info: MediaInfo): Promise<Added> {
  // Loaded the first time an image is added, not when the app starts.
  const { default: sharp } = await import("sharp");
  const image = sharp(bytes, { failOn: "error" });
  const meta = await image.metadata();
  const ext = EXTENSIONS[meta.format ?? ""];
  if (!ext) throw new Error("This file is not an image Upstart can use (JPEG, PNG, WebP, GIF, AVIF or SVG).");
  const dir = join(root, "media");
  mkdirSync(dir, { recursive: true });
  const stem = freeName(dir, slug(name));
  const path = `media/${stem}.${ext}`;
  let out = bytes;
  let { width, height } = meta;
  // An image that is drawn, or moves, is kept as it is.
  if (ext !== "svg" && ext !== "gif") {
    const upright = meta.autoOrient ?? { width: meta.width, height: meta.height };
    const resized = image.rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true });
    const formatted =
      ext === "jpg"
        ? resized.jpeg({ quality: 85, mozjpeg: true })
        : ext === "png"
          ? resized.png()
          : ext === "webp"
            ? resized.webp({ quality: 85 })
            : resized.avif({ quality: 60 });
    if ((upright.width ?? 0) > MAX_WIDTH || (meta.orientation ?? 1) !== 1) {
      const { data, info: done } = await formatted.toBuffer({ resolveWithObject: true });
      out = data;
      width = done.width;
      height = done.height;
    }
  }
  writeFileSync(join(root, path), out);
  writeFileSync(join(dir, `${stem}.json`), `${JSON.stringify(info, null, 2)}\n`);
  return { path, width, height };
}

/** One image use_image is asked for. */
export type ImageWanted = { id: string; name: string; alt: string };

/** What became of an image use_image was asked for: added, already there, or why not. */
type Used = { path: string; size?: string; existing?: boolean } | { error: string };

/** Downloads an image found by a search and adds it with its alt text and credits; one already added keeps its file. */
async function addFound(finder: ImageFinder, root: string, { id, name, alt }: ImageWanted): Promise<Used> {
  const image = finder.found(id);
  if (!image)
    return {
      error: `No image with the id ${id} was found by find_images in this session: search again, then use one of the ids it gives.`,
    };
  // The same image used again: the file already in media/, its alt text replaced.
  const existing = image.credit.sourceUrl ? sameSource(root, image.credit.sourceUrl) : undefined;
  if (existing) {
    const info = JSON.parse(readFileSync(join(root, infoFile(existing)), "utf8"));
    writeFileSync(join(root, infoFile(existing)), `${JSON.stringify({ ...info, alt }, null, 2)}\n`);
    return { path: existing, existing: true };
  }
  let bytes: Buffer;
  try {
    bytes = await finder.download(image);
  } catch (error) {
    return { error: `${(error as Error).message} Try another of the images found.` };
  }
  const added = await addImage(root, name, bytes, { alt, credit: image.credit });
  return { path: added.path, ...(added.width ? { size: `${added.width}×${added.height}` } : {}) };
}

/**
 * use_image (Q167): downloads an image found by a search, adds it to the
 * project's media with the alternative text the agent gave and its credits,
 * and tells the agent how to use it.
 */
export async function useFoundImage(
  finder: ImageFinder,
  root: string,
  id: string,
  name: string,
  alt: string,
): Promise<string> {
  return answerOne(await addFound(finder, root, { id, name, alt }));
}

/** What use_image answers for one image. */
function answerOne(used: Used): string {
  if ("error" in used) return used.error;
  if (used.existing)
    return `This image is already in the project as /${used.path}: its alternative text is now the one you gave. Use that address; nothing was added.`;
  return `Added as /${used.path}${used.size ? ` (${used.size})` : ""}. Write <img src="/${used.path}" …> in a page, part or record without an alt attribute: Upstart takes its alternative text from ${infoFile(used.path)}, where the maker can change it, and lists its credits on the site's /credits page when its licence asks for them.`;
}

/**
 * use_image with several images (Q357): each added in turn, and the
 * addresses answered in the order asked, ready for a list of images.
 */
export async function addFoundImages(finder: ImageFinder, root: string, wanted: ImageWanted[]): Promise<string> {
  if (wanted.length === 1) return answerOne(await addFound(finder, root, wanted[0]!));
  const lines: string[] = [];
  const paths: string[] = [];
  for (const [i, one] of wanted.entries()) {
    const used = await addFound(finder, root, one);
    if ("error" in used) {
      lines.push(`${i + 1}. ${one.id}: not added. ${used.error}`);
      continue;
    }
    paths.push(`/${used.path}`);
    lines.push(
      `${i + 1}. /${used.path}${used.size ? ` (${used.size})` : ""}${used.existing ? ", already in the project: its alternative text is now the one you gave" : ""}`,
    );
  }
  const how = paths.length
    ? `\n\nIn this order, as a list of images in a record: \`[${paths.join(", ")}]\`. Write <img> without an alt attribute: Upstart takes each one's alternative text from the file beside it, and lists the credits on the site's /credits page when a licence asks for them.`
    : "";
  return `${lines.join("\n")}${how}`;
}

/** The media file that came from this source, if one did. */
function sameSource(root: string, source: string): string | undefined {
  const dir = join(root, "media");
  if (!existsSync(dir)) return undefined;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      if (JSON.parse(readFileSync(join(dir, name), "utf8")).credit?.sourceUrl !== source) continue;
    } catch {
      continue;
    }
    const file = readdirSync(dir).find((f) => f !== name && infoFile(`media/${f}`) === `media/${name}`);
    if (file) return `media/${file}`;
  }
  return undefined;
}

/** The kinds of file the library takes (Q169): images, and documents to link to; no video or audio. */
export function mediaKind(path: string): "image" | "document" | undefined {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"].includes(ext)) return "image";
  if (["mp4", "mov", "m4v", "webm", "avi", "mkv", "mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext))
    return undefined;
  return "document";
}

/** The folders a site is written in, where a media file is used (Q168). */
const USING_DIRS = ["pages", "parts", "fragments", "data"];

function walk(root: string, rel: string, out: string[]) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = `${rel}/${entry.name}`;
    if (entry.isDirectory()) walk(root, path, out);
    else if (/\.(liquid|md|ya?ml)$/.test(entry.name)) out.push(path);
  }
}

/** Every file a media file can be used in, path → text. */
export function usingFiles(root: string): Record<string, string> {
  const files: string[] = [];
  for (const dir of USING_DIRS) walk(root, dir, files);
  return Object.fromEntries(files.map((f) => [f, readFileSync(join(root, f), "utf8")]));
}

/** Its address in a page or a record, /media/cafe.jpg or media/cafe.jpg, and nothing longer. */
function addressPattern(path: string): RegExp {
  const escaped = path.replace(/^\//, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w./-])(/?)${escaped}(?![\\w.-])`, "g");
}

/** The files that use a media file. */
export function usesOf(path: string, files: Record<string, string>): string[] {
  const pattern = addressPattern(path);
  return Object.entries(files)
    .filter(([, text]) => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    })
    .map(([file]) => file);
}

/** "2 pages, 1 part, Posts (3)": where a media file is used, for the maker. */
export function usesLabel(uses: string[], labelOf: (datasource: string) => string = (n) => n): string {
  const count = (prefix: string) => uses.filter((u) => u.startsWith(prefix)).length;
  const parts: string[] = [];
  const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);
  if (count("pages/")) parts.push(plural(count("pages/"), "page"));
  if (count("parts/")) parts.push(plural(count("parts/"), "shared part"));
  if (count("fragments/")) parts.push(plural(count("fragments/"), "fragment"));
  const datasources = new Map<string, number>();
  for (const u of uses) {
    const m = /^data\/([^/]+)\//.exec(u);
    if (m) datasources.set(m[1]!, (datasources.get(m[1]!) ?? 0) + 1);
  }
  for (const [name, n] of datasources) parts.push(`${labelOf(name)} (${n})`);
  return parts.join(", ");
}

/** Every file that uses `from`, with `to` in its place. */
export function replaceUses(from: string, to: string, files: Record<string, string>): Record<string, string> {
  const pattern = addressPattern(from);
  const out: Record<string, string> = {};
  for (const [file, text] of Object.entries(files)) {
    const next = text.replace(pattern, (_m, slash: string) => `${slash}${to.replace(/^\//, "")}`);
    if (next !== text) out[file] = next;
  }
  return out;
}

/** The library's files, not the files kept beside them. */
export function libraryFiles(root: string): string[] {
  const dir = join(root, "media");
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => e.name);
  const stems = new Set(names.filter((n) => !n.endsWith(".json")).map((n) => n.replace(/\.[^.]+$/, "")));
  return names
    .filter((n) => !(n.endsWith(".json") && stems.has(n.slice(0, -".json".length))))
    .sort()
    .map((n) => `media/${n}`);
}

/**
 * Adds a file from the disk (dropped, or chosen): an image made at most
 * 2400 px wide, any other document as it is; never a video or a sound.
 */
export async function addFile(root: string, from: string): Promise<Added> {
  const name = basename(from);
  const kind = mediaKind(name);
  if (!kind)
    throw new Error(`${name}: Upstart does not keep video or audio files. Link to them where they are hosted.`);
  const bytes = readFileSync(from);
  if (kind === "image") return addImage(root, name, bytes, {});
  const dir = join(root, "media");
  mkdirSync(dir, { recursive: true });
  const ext = (extname(name).slice(1) || "bin").toLowerCase();
  const path = `media/${freeName(dir, slug(name))}.${ext}`;
  writeFileSync(join(root, path), bytes);
  return { path };
}

/**
 * The WebP copies of an image for the export's srcset (Q156): at each width
 * given that the image reaches, and at its own when it is narrower than the
 * widest; none for a drawing (SVG) or an animation (GIF), kept as they are.
 */
export async function webpCopies(
  _path: string,
  data: Buffer,
  widths: number[],
): Promise<{ width: number; data: Buffer }[] | undefined> {
  const { default: sharp } = await import("sharp");
  const meta = await sharp(data, { failOn: "error" }).metadata();
  if (!meta.format || ["svg", "gif"].includes(meta.format)) return undefined;
  const own = meta.autoOrient?.width ?? meta.width ?? 0;
  if (!own) return undefined;
  const chosen = widths.filter((w) => w <= own);
  if (own < Math.max(...widths) && !chosen.includes(own)) chosen.push(own);
  return Promise.all(
    chosen.map(async (width) => ({
      width,
      data: await sharp(data).rotate().resize({ width }).webp({ quality: 80 }).toBuffer(),
    })),
  );
}
