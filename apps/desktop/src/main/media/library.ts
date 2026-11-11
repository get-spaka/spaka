// The media library (Q149, Q155, Q169): files in media/, each image with a
// file beside it holding its alternative text and its credits. An image is
// made at most 2400 px wide when it is added, turned upright, in its own
// format; an SVG, a GIF and a document are kept as they are.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  const image = finder.found(id);
  if (!image)
    return `No image with the id ${id} was found by find_images in this session: search again, then use one of the ids it gives.`;
  let bytes: Buffer;
  try {
    bytes = await finder.download(image);
  } catch (error) {
    return `${(error as Error).message} Try another of the images found.`;
  }
  const added = await addImage(root, name, bytes, { alt, credit: image.credit });
  const size = added.width ? ` (${added.width}×${added.height})` : "";
  return `Added as /${added.path}${size}. Write <img src="/${added.path}" …> in a page, part or record without an alt attribute: Upstart takes its alternative text from ${infoFile(added.path)}, where the maker can change it, and lists its credits on the site's /credits page when its licence asks for them.`;
}
