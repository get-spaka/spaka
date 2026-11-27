// How an image sits in its frame (Q490): what the maker sets on an image
// written in a template, for the screens it is set for, kept as Tailwind
// classes of the <img>. The preview shows a frame's declarations while the
// maker adjusts, the main process writes the classes that give the same:
// both from here, so that what is saved is what was seen.

export type Frame = {
  /** Fills the frame, or shows whole; undefined leaves it to the template's classes. */
  fit?: "cover" | "contain";
  /** Where the image is held in its frame, in percent: 0 0 is the top left. */
  x: number;
  y: number;
  /** 1 or more: how much larger than its frame the image is shown. */
  zoom: number;
  /** The frame's proportions, width to height; undefined leaves them as they are. */
  ratio?: [number, number];
  /** The image's own rounded corners, as border-radius reads them, kept when it is zoomed. */
  radius?: string;
};

/** The proportions offered, from the widest to the tallest. */
export const RATIOS = [
  [16, 9],
  [3, 2],
  [4, 3],
  [1, 1],
  [3, 4],
  [2, 3],
  [9, 16],
] as const satisfies readonly [number, number][];

export const MAX_ZOOM = 3;

const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** A frame as received from the preview, within what one can be; throws on anything else. */
export function cleanFrame(input: unknown): Frame {
  const f = input as Partial<Frame> | null;
  const number = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  if (!f || typeof f !== "object" || !number(f.x) || !number(f.y) || !number(f.zoom)) throw new Error("Not a frame.");
  const frame: Frame = {
    x: round(clamp(f.x!, 0, 100)),
    y: round(clamp(f.y!, 0, 100)),
    zoom: round(clamp(f.zoom!, 1, MAX_ZOOM)),
  };
  if (f.fit === "cover" || f.fit === "contain") frame.fit = f.fit;
  if (Array.isArray(f.ratio) && f.ratio.length === 2 && f.ratio.every((n) => number(n) && n > 0 && n <= 100))
    frame.ratio = [round(f.ratio[0]), round(f.ratio[1])];
  if (typeof f.radius === "string" && /^[\d.e+%px\s/]{1,200}$/.test(f.radius) && /[1-9]/.test(f.radius))
    frame.radius = f.radius.trim();
  return frame;
}

/** A border-radius whose lengths are divided by the zoom, which then brings them back to their size. */
function radiusUnder(radius: string, zoom: number): string {
  return radius.replace(/([\d.]+(?:e\+?\d+)?)px/g, (_, n: string) => `${round(Number(n) / zoom)}px`);
}

/**
 * The declarations that show a frame. A zoomed image is scaled from the point
 * it is held by, and cut to the part that then falls exactly on its frame: it
 * needs nothing of what contains it.
 */
export function frameDeclarations(frame: Frame): [string, string][] {
  const { x, y, zoom } = frame;
  const at = `${round(x)}% ${round(y)}%`;
  const out: [string, string][] = [];
  if (frame.fit) out.push(["object-fit", frame.fit]);
  out.push(["object-position", at]);
  if (frame.ratio) out.push(["aspect-ratio", `${frame.ratio[0]} / ${frame.ratio[1]}`]);
  if (zoom > 1) {
    const cut = (share: number) => `${round(share * (1 - 1 / zoom))}%`;
    const corners = frame.radius ? ` round ${radiusUnder(frame.radius, zoom)}` : "";
    out.push(["transform", `scale(${round(zoom)})`]);
    out.push(["transform-origin", at]);
    out.push(["clip-path", `inset(${cut(y)} ${cut(100 - x)} ${cut(100 - y)} ${cut(x)}${corners})`]);
  }
  return out;
}

type Declarations = { getPropertyValue(name: string): string };

/**
 * The frame an image has where nothing was set for it: the fit and the
 * position the page's styles give it, neither zoomed nor given proportions.
 */
export function readFrame(computed: Declarations): Frame {
  const percent = (value: string | undefined) => {
    const m = /^(-?[\d.]+)%$/.exec(value ?? "");
    return m ? round(clamp(Number(m[1]), 0, 100)) : 50;
  };
  const [px, py] = computed.getPropertyValue("object-position").trim().split(/\s+/);
  const fit = computed.getPropertyValue("object-fit").trim();
  const frame: Frame = { x: percent(px), y: percent(py), zoom: 1 };
  if (fit === "cover" || fit === "contain") frame.fit = fit;
  return frame;
}

/** The screens a frame is set for, narrowest first: the preview's own (Q110). */
export const FORMATS = ["phone", "tablet", "desktop"] as const;
export type Format = (typeof FORMATS)[number];
/** What each screen has; a screen without a frame is as the template's classes have it. */
export type Frames = Partial<Record<Format, Frame>>;

/**
 * The questions Tailwind's md and lg ask of a page, which say what screen it
 * is: the ones the classes of a frame are compiled with. A page's own width
 * does not: on a phone it grows with whatever spills out of the page.
 */
export const FROM_TABLET = "(width >= 48rem)";
export const FROM_DESKTOP = "(width >= 64rem)";

/** The screen a page this wide is: Tailwind's md and lg, between which a tablet is. */
export function formatAt(width: number): Format {
  return width < 768 ? "phone" : width < 1024 ? "tablet" : "desktop";
}

/** Tailwind's variants for each run of neighbouring screens: none for all of them. */
const VARIANTS: Record<string, Format[]> = {
  "": ["phone", "tablet", "desktop"],
  "max-lg:": ["phone", "tablet"],
  "md:": ["tablet", "desktop"],
  "max-md:": ["phone"],
  "md:max-lg:": ["tablet"],
  "lg:": ["desktop"],
};

const OURS =
  /^((?:max-md|md:max-lg|max-lg|md|lg):|)(object-(?:cover|contain)|object-\[[\d.]+%_[\d.]+%\]|aspect-\[[\d.]+\/[\d.]+\]|\[(?:transform|transform-origin|clip-path):[^\]\s]+\])!$/;

/**
 * A frame as Tailwind utilities, without a variant: the same declarations,
 * each one a class. Written important, they win over the template's own.
 */
export function frameUtilities(frame: Frame): string[] {
  return frameDeclarations(frame).map(([name, value]) => {
    const joined = value.replace(/\s*\/\s*/g, "/").replace(/\s+/g, "_");
    if (name === "object-fit") return `object-${value}`;
    if (name === "object-position") return `object-[${joined}]`;
    if (name === "aspect-ratio") return `aspect-[${joined}]`;
    return `[${name}:${joined}]`;
  });
}

/** The frame some utilities give, for the panel to show; its corners are read again when it is written. */
export function frameOf(utilities: string[]): Frame {
  const frame: Frame = { x: 50, y: 50, zoom: 1 };
  for (const utility of utilities) {
    const fit = /^object-(cover|contain)$/.exec(utility);
    const at = /^object-\[([\d.]+)%_([\d.]+)%\]$/.exec(utility);
    const ratio = /^aspect-\[([\d.]+)\/([\d.]+)\]$/.exec(utility);
    const zoom = /^\[transform:scale\(([\d.]+)\)\]$/.exec(utility);
    if (fit) frame.fit = fit[1] as Frame["fit"];
    if (at) Object.assign(frame, { x: clamp(Number(at[1]), 0, 100), y: clamp(Number(at[2]), 0, 100) });
    if (ratio && Number(ratio[1]) > 0 && Number(ratio[2]) > 0) frame.ratio = [Number(ratio[1]), Number(ratio[2])];
    if (zoom) frame.zoom = clamp(Number(zoom[1]), 1, MAX_ZOOM);
  }
  return frame;
}

/**
 * An <img>'s classes, apart: the utilities a frame was written with, for each
 * screen, and the rest, which is the template's.
 */
export function readFrameClasses(classes: string): { utilities: Partial<Record<Format, string[]>>; rest: string[] } {
  const utilities: Partial<Record<Format, string[]>> = {};
  const rest: string[] = [];
  for (const token of classes.split(/\s+/).filter(Boolean)) {
    const ours = OURS.exec(token);
    if (!ours) rest.push(token);
    else for (const format of VARIANTS[ours[1]!]!) utilities[format] = [...(utilities[format] ?? []), ours[2]!];
  }
  return { utilities, rest };
}

/**
 * The classes that give each screen its utilities: neighbouring screens with
 * the same ones share a variant, and all three need none. Each screen's are
 * whole under a variant of its own, so that none has to undo another's.
 */
export function frameClasses(utilities: Partial<Record<Format, string[]>>): string[] {
  const out: string[] = [];
  const key = (format: Format) => utilities[format]?.join(" ") ?? "";
  for (let from = 0; from < FORMATS.length; ) {
    let to = from;
    while (to + 1 < FORMATS.length && key(FORMATS[to + 1]!) === key(FORMATS[from]!)) to++;
    const run = FORMATS.slice(from, to + 1);
    const variant = Object.keys(VARIANTS).find((v) => VARIANTS[v]!.join() === run.join())!;
    for (const utility of utilities[FORMATS[from]!] ?? []) out.push(`${variant}${utility}!`);
    from = to + 1;
  }
  return out;
}

type Size = { width: number; height: number };

/**
 * The frame once the image is dragged by (dx, dy) pixels: the image follows
 * the pointer, as far as it has room to move. `box` is the frame's size,
 * `image` the image's own.
 */
export function dragged(frame: Frame, dx: number, dy: number, box: Size, image: Size): Frame {
  if (!(box.width > 0 && box.height > 0 && image.width > 0 && image.height > 0)) return frame;
  const scales = [box.width / image.width, box.height / image.height];
  // Without a fit the image is stretched to its frame.
  const scale = frame.fit === "cover" ? Math.max(...scales) : frame.fit === "contain" ? Math.min(...scales) : undefined;
  const shown = scale ? { width: image.width * scale, height: image.height * scale } : box;
  const move = (at: number, by: number, room: number) =>
    Math.abs(room) < 0.5 ? at : round(clamp(at + (by / room) * 100, 0, 100));
  return {
    ...frame,
    x: move(frame.x, dx, box.width - frame.zoom * shown.width),
    y: move(frame.y, dy, box.height - frame.zoom * shown.height),
  };
}

/**
 * Where a zoomed image shows, from the rectangle its scaling gives it: the
 * frame it had before being scaled.
 */
export function shownRect(
  scaled: { left: number; top: number; width: number; height: number },
  frame: Pick<Frame, "x" | "y" | "zoom">,
) {
  const width = scaled.width / frame.zoom;
  const height = scaled.height / frame.zoom;
  const left = scaled.left + (frame.x / 100) * (scaled.width - width);
  const top = scaled.top + (frame.y / 100) * (scaled.height - height);
  return { left, top, width, height, right: left + width, bottom: top + height };
}
