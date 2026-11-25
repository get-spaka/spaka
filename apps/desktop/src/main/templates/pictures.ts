// A template's pictures (template:shoot): its pages to photograph, and the
// WebP files made of the photographs — each page whole at desktop and phone
// width, the cover, and the animated sequence shown on hover.
import { writeFileSync } from "node:fs";
import { Runtime } from "@spaka/runtime";
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

/**
 * A script run in a page before its own (every shoot window's preload): each
 * image loads at once, even one marked loading="lazy" (an image below the first
 * screen would otherwise wait for a scroll, and the shoot for the image).
 */
export function eagerImagesScript(): string {
  return `(() => {
  const eager = (img) => { if (img.getAttribute("loading") === "lazy") img.setAttribute("loading", "eager"); };
  const sweep = (node) => {
    if (node.nodeType !== 1) return;
    if (node.localName === "img") eager(node);
    for (const img of node.getElementsByTagName("img")) eager(img);
  };
  new MutationObserver((changes) => {
    for (const change of changes)
      if (change.type === "attributes") eager(change.target);
      else for (const node of change.addedNodes) sweep(node);
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["loading"] });
})();`;
}

/**
 * A script run in a page before its own, for its whole picture only (not the
 * cover's or the hover's): the page is photographed a slice at a time, scrolled
 * between them, and this keeps each element in one state from the top of the
 * page to its end, so that nothing changes where a slice meets the next.
 * - An animation driven by scrolling (CSS's animation-timeline, Motion's
 *   scroll()) is held: one that follows an element across the screen (view())
 *   as it is with the element in the middle of the screen, one that follows the
 *   page (scroll()) as it is with the page at its top.
 * - An IntersectionObserver on the screen (Motion's inView) sees each element
 *   it watches come wholly into view at once, and nothing after: every reveal
 *   plays as the page opens, and stays.
 * - `__spakaStill.pin()`, called before the window is made a slice tall, sets what
 *   floats over the page (position: fixed: a floating button, a corner badge)
 *   where it stands on the page's first screen, so that it is in the picture
 *   once. A backdrop as large as the screen stays fixed, behind every slice.
 */
export function stillPageScript(): string {
  return `(() => {
  const held = new WeakSet();
  const hold = () => {
    for (const a of document.getAnimations()) {
      const timeline = a.timeline;
      if (held.has(a) || !timeline || timeline instanceof DocumentTimeline || a.startTime == null) continue;
      const start = typeof a.startTime === "number" ? a.startTime : a.startTime.value;
      const at = typeof ViewTimeline !== "undefined" && timeline instanceof ViewTimeline ? 50 : 0;
      a.pause();
      a.currentTime = CSS.percent((at - start) * a.playbackRate);
      held.add(a);
    }
    requestAnimationFrame(hold);
  };
  requestAnimationFrame(hold);

  const Observer = globalThis.IntersectionObserver;
  if (Observer)
    globalThis.IntersectionObserver = class extends Observer {
      constructor(callback, options) {
        const screen = !options || options.root == null || options.root === document;
        super(screen ? () => {} : callback, options);
        this.screen = screen;
        this.callback = callback;
        this.watched = new Set();
      }
      observe(target) {
        super.observe(target);
        if (!this.screen || this.watched.has(target)) return;
        this.watched.add(target);
        setTimeout(() => {
          if (!this.watched.has(target)) return;
          const box = target.getBoundingClientRect();
          const rootBounds = new DOMRect(0, 0, innerWidth, innerHeight);
          this.callback([{ target, time: performance.now(), isIntersecting: true, intersectionRatio: 1, boundingClientRect: box, intersectionRect: box, rootBounds }], this);
        });
      }
      unobserve(target) {
        super.unobserve(target);
        this.watched.delete(target);
      }
      disconnect() {
        super.disconnect();
        this.watched.clear();
      }
    };

  globalThis.__spakaStill = {
    pin() {
      for (const el of document.querySelectorAll("*")) {
        if (!(el instanceof HTMLElement) || getComputedStyle(el).position !== "fixed" || !el.getClientRects().length) continue;
        const box = el.getBoundingClientRect();
        if (box.width >= innerWidth && box.height >= innerHeight) continue;
        const set = (key, value) => el.style.setProperty(key, value, "important");
        set("box-sizing", "border-box");
        set("width", el.offsetWidth + "px");
        set("height", el.offsetHeight + "px");
        set("position", "absolute");
        for (const side of ["top", "left"]) set(side, "0px");
        for (const side of ["right", "bottom"]) set(side, "auto");
        const moved = el.getBoundingClientRect();
        set("top", box.top - moved.top + "px");
        set("left", box.left - moved.left + "px");
      }
    },
  };
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
