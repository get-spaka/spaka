// A template's pictures (template:shoot): its pages to photograph, and the
// WebP files made of the photographs — each page whole at desktop and phone
// width, the cover, and the animated sequence shown on hover.
import { writeFileSync } from "node:fs";
import { Runtime } from "@upstart/runtime";
import { pageName, type TemplateFiles, textSource } from "./reader";

/**
 * The pages a template is photographed on: its own, and the first record's page
 * of each page per record (a project, a post), not the credits'.
 */
export function shotPages(files: TemplateFiles): { route: string; name: string }[] {
  const routes = new Runtime(textSource(files), { repair: false, trace: false }).routes();
  const firsts = new Map<string, string>();
  for (const r of routes) if (r.record && !firsts.has(r.file)) firsts.set(r.file, r.route);
  return routes
    .filter((r) => !r.generated && (!r.record || firsts.get(r.file) === r.route))
    .map((r) => ({ route: r.route, name: pageName(r.route) }));
}

/**
 * The clock a template's pages are photographed at, for a template whose look
 * follows the time (a café's door card open or closed): `--clock` given to
 * template:shoot, else `shoot.clock` in its template.json, an instant with its
 * offset ("2027-04-14T09:30:00-05:00"). Without either, the real clock. The
 * pages keep the zone of the computer that shoots: a script that shows the
 * time reads it in its business's zone (Saucer's data-tz), not the visitor's.
 */
export function shootClock(manifest: unknown, flag?: string): number | undefined {
  const shoot = (manifest as { shoot?: { clock?: unknown } } | null)?.shoot;
  const clock = flag || (typeof shoot?.clock === "string" ? shoot.clock : undefined);
  if (!clock) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(clock))
    throw new Error(
      `The shoot's clock "${clock}" is not an instant with its offset, such as 2027-04-14T09:30:00-05:00.`,
    );
  return Date.parse(clock);
}

/**
 * A script run in a page before its own (the shoot's window's preload, in the
 * page's world): its Date reads `at` when the page opens, and goes on from there (timers and animations keep real time).
 */
export function fixedClockScript(at: number): string {
  return `(() => {
  const RealDate = Date;
  const shift = ${at} - RealDate.now();
  const now = () => RealDate.now() + shift;
  globalThis.Date = new Proxy(RealDate, {
    construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [now()], newTarget),
    apply: () => new RealDate(now()).toString(),
    get: (target, key, receiver) => (key === "now" ? now : Reflect.get(target, key, receiver)),
  });
})();`;
}

async function sharp() {
  return (await import("sharp")).default;
}

/** WebP's largest side. */
const WEBP_MAX = 16_383;

/**
 * A photograph (PNG) as a WebP file `width` wide; a page too tall to be
 * captured at once comes in slices, top to bottom, put back together here.
 * A page taller than WebP allows is made narrower instead.
 */
export async function writeWebp(png: Buffer | Buffer[], width: number, path: string): Promise<void> {
  const s = await sharp();
  const slices = Array.isArray(png) ? png : [png];
  const sizes = await Promise.all(slices.map(async (slice) => s(slice).metadata()));
  const wide = sizes[0]?.width ?? width;
  const tall = sizes.reduce((sum, m) => sum + (m.height ?? 0), 0);
  let whole = slices[0]!;
  if (slices.length > 1) {
    let top = 0;
    const layers = slices.map((input, i) => {
      const layer = { input, top, left: 0 };
      top += sizes[i]!.height ?? 0;
      return layer;
    });
    whole = await s({ create: { width: wide, height: tall, channels: 4, background: "#ffffff" } })
      .composite(layers)
      .png()
      .toBuffer();
  }
  const fit = Math.min(width, Math.floor((WEBP_MAX * wide) / tall));
  writeFileSync(
    path,
    await s(whole, { limitInputPixels: false }).resize({ width: fit }).webp({ quality: 78 }).toBuffer(),
  );
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
