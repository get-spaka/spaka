// A template's pictures (template:shoot): its pages to photograph, and the
// WebP files made of the photographs — each page whole at desktop and phone
// width, the cover, and the animated sequence shown on hover.
import { writeFileSync } from "node:fs";
import { Runtime } from "@upstart/runtime";
import { pageName, type TemplateFiles, textSource } from "./reader";

/** The pages a template is photographed on: its own, not a record's or the credits'. */
export function shotPages(files: TemplateFiles): { route: string; name: string }[] {
  return new Runtime(textSource(files), { repair: false, trace: false })
    .routes()
    .filter((r) => !r.record && !r.generated)
    .map((r) => ({ route: r.route, name: pageName(r.route) }));
}

async function sharp() {
  return (await import("sharp")).default;
}

/** A photograph (PNG) as a WebP file `width` wide. */
export async function writeWebp(png: Buffer, width: number, path: string): Promise<void> {
  const s = await sharp();
  writeFileSync(path, await s(png).resize({ width }).webp({ quality: 78 }).toBuffer());
}

/** Photographs (PNG) as one animated WebP, `width` wide, each shown `every` ms, the last held a while. */
export async function writeAnimatedWebp(frames: Buffer[], width: number, every: number, path: string): Promise<number> {
  const s = await sharp();
  const small = await Promise.all(frames.map((f) => s(f).resize({ width }).png().toBuffer()));
  const out = await s(small, { join: { animated: true } })
    .webp({ quality: 70, loop: 0, delay: small.map((_, i) => (i === small.length - 1 ? 1200 : every)) })
    .toBuffer();
  writeFileSync(path, out);
  return (await s(out, { animated: true }).metadata()).pages ?? 1;
}
