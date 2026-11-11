// Image search (Q150, Q151, Q167): Wikimedia Commons and Openverse, asked at
// once, keeping only images free for commercial use (CC0, public domain,
// CC BY, CC BY-SA) with what their credits need. The requests carry a generic
// User-Agent and the words searched, nothing about the maker or the project.
// Openverse without a key is slow at times and allows 20 searches a minute:
// it is given 6 seconds, and Commons answers alone past them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Credit } from "@upstart/runtime";

export const USER_AGENT = "Upstart desktop app";

export type FoundImage = {
  /** "commons:<page id>" or "openverse:<id>". */
  id: string;
  title: string;
  description?: string;
  width: number;
  height: number;
  /** Where to download it, at most about 2400 px wide when the source offers a smaller copy. */
  url: string;
  thumb?: string;
  credit: Credit;
};

export type SearchResult = { images: FoundImage[]; failed: string[] };

export interface ImageFinder {
  search(query: string, count?: number): Promise<SearchResult>;
  /** An image found by an earlier search. */
  found(id: string): FoundImage | undefined;
  download(image: FoundImage): Promise<Buffer>;
}

/**
 * A licence's short name as the sources write it ("CC BY-SA 4.0", "cc0",
 * "Public domain", "by-sa 2.0"), named the same way every time, or undefined
 * when it does not allow commercial use or changes, or is not one we know.
 */
export function freeLicense(
  name: string | undefined,
  url?: string,
): Pick<Credit, "license" | "licenseUrl"> | undefined {
  const s = (name ?? "").trim();
  if (!s || /\b(nc|nd)\b|non-?commercial|no-?deriv/i.test(s)) return undefined;
  if (/^cc[\s-]*0|^cc[\s-]*zero/i.test(s))
    return { license: "CC0 1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" };
  if (/^(public domain|pd(m)?\b|pd-)/i.test(s))
    return { license: "Public domain", licenseUrl: url || "https://creativecommons.org/publicdomain/mark/1.0/" };
  const by = /^(?:cc[\s-]*)?by([\s-]*sa)?(?:[\s-]*(\d(?:\.\d)?))?\b/i.exec(s);
  if (!by) return undefined;
  const sa = !!by[1];
  const version = by[2] ?? "4.0";
  return {
    license: `CC ${sa ? "BY-SA" : "BY"} ${version}`,
    licenseUrl: url || `https://creativecommons.org/licenses/${sa ? "by-sa" : "by"}/${version}/`,
  };
}

/** Text from the bits of HTML Commons gives for an author or a description. */
export function plainText(html: string | undefined): string {
  return (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const short = (text: string, max = 240) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const noTracking = (url: string) => url.replace(/\?utm_[^#]*$/, "");

type Meta = Record<string, { value?: string } | undefined>;
type CommonsPage = {
  pageid: number;
  title: string;
  index?: number;
  imageinfo?: {
    width: number;
    height: number;
    url: string;
    thumburl?: string;
    descriptionurl?: string;
    mime?: string;
    extmetadata?: Meta;
  }[];
};

export function fromCommons(answer: unknown): FoundImage[] {
  const pages = ((answer as { query?: { pages?: CommonsPage[] } })?.query?.pages ?? [])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const images: FoundImage[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime ?? "")) continue;
    const license = freeLicense(meta.LicenseShortName?.value, meta.LicenseUrl?.value);
    if (!license) continue;
    const title = plainText(meta.ObjectName?.value) || page.title.replace(/^File:/, "").replace(/\.[^.]+$/, "");
    const author = plainText(meta.Artist?.value);
    const description = plainText(meta.ImageDescription?.value);
    images.push({
      id: `commons:${page.pageid}`,
      title,
      description: description ? short(description) : undefined,
      width: info.width,
      height: info.height,
      url: noTracking(info.thumburl && info.width > 2400 ? info.thumburl : info.url),
      credit: {
        title,
        author: author ? short(author, 120) : undefined,
        ...license,
        source: "Wikimedia Commons",
        sourceUrl: info.descriptionurl,
      },
    });
  }
  return images;
}

type OpenversePage = {
  id: string;
  title?: string;
  url: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  creator?: string;
  creator_url?: string;
  license: string;
  license_version?: string;
  license_url?: string;
  foreign_landing_url?: string;
  provider?: string;
  source?: string;
  filetype?: string;
};

const PROVIDERS: Record<string, string> = { flickr: "Flickr", wikimedia: "Wikimedia Commons", stocksnap: "StockSnap" };

export function fromOpenverse(answer: unknown): FoundImage[] {
  const results = (answer as { results?: OpenversePage[] })?.results ?? [];
  const images: FoundImage[] = [];
  for (const r of results) {
    const name = r.license === "pdm" ? "pdm" : `cc ${r.license} ${r.license_version ?? ""}`;
    const license = freeLicense(name, r.license_url);
    if (!license || !r.url || (r.filetype && !/^(jpe?g|png|webp)$/i.test(r.filetype))) continue;
    const provider = r.source ?? r.provider ?? "";
    const title = r.title?.trim() || "Untitled";
    images.push({
      id: `openverse:${r.id}`,
      title,
      width: r.width ?? 0,
      height: r.height ?? 0,
      url: r.url,
      thumb: r.thumbnail,
      credit: {
        title,
        author: r.creator?.trim() || undefined,
        authorUrl: r.creator_url || undefined,
        ...license,
        source: `Openverse (${PROVIDERS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1)})`,
        sourceUrl: r.foreign_landing_url,
      },
    });
  }
  return images;
}

/** One from each source in turn, the best of each first; an image seen twice (by its address) is kept once. */
function interleave(lists: FoundImage[][], count: number): FoundImage[] {
  const out: FoundImage[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < count && lists.some((l) => i < l.length); i++)
    for (const list of lists) {
      const image = list[i];
      if (!image || seen.has(image.url) || out.length >= count) continue;
      seen.add(image.url);
      out.push(image);
    }
  return out;
}

type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

export class ImageSearch implements ImageFinder {
  private known = new Map<string, FoundImage>();

  constructor(private opts: { fetch?: Fetch; timeout?: number; openverseTimeout?: number } = {}) {}

  private async get(url: string, timeout: number): Promise<unknown> {
    const fetch = this.opts.fetch ?? globalThis.fetch;
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async search(query: string, count = 10): Promise<SearchResult> {
    const q = encodeURIComponent(query.trim());
    const commons = `https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrsearch=${q}%20filetype:bitmap&gsrnamespace=6&gsrlimit=${Math.min(40, count * 3)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=2400&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|ImageDescription|ObjectName`;
    const openverse = `https://api.openverse.org/v1/images/?q=${q}&license=cc0,pdm,by,by-sa&page_size=${Math.min(20, count * 2)}`;
    const [c, o] = await Promise.allSettled([
      this.get(commons, this.opts.timeout ?? 10_000).then(fromCommons),
      this.get(openverse, this.opts.openverseTimeout ?? 6_000).then(fromOpenverse),
    ]);
    const failed = [
      c.status === "rejected" ? "Wikimedia Commons" : "",
      o.status === "rejected" ? "Openverse" : "",
    ].filter(Boolean);
    const images = interleave(
      [c.status === "fulfilled" ? c.value : [], o.status === "fulfilled" ? o.value : []],
      count,
    );
    for (const image of images) this.known.set(image.id, image);
    return { images, failed };
  }

  found(id: string): FoundImage | undefined {
    return this.known.get(id);
  }

  async download(image: FoundImage): Promise<Buffer> {
    const fetch = this.opts.fetch ?? globalThis.fetch;
    const response = await fetch(image.url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`The image could not be downloaded (HTTP ${response.status}).`);
    return Buffer.from(await response.arrayBuffer());
  }
}

/**
 * The search the checks use (UPSTART_IMAGES_FIXTURE): images.json in a
 * folder lists the images, each "url" a file of that folder; every search
 * answers them all, those whose words match first.
 */
export class FixtureImages implements ImageFinder {
  private images: FoundImage[];

  constructor(private dir: string) {
    this.images = JSON.parse(readFileSync(join(dir, "images.json"), "utf8")) as FoundImage[];
  }

  async search(query: string, count = 10): Promise<SearchResult> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const score = (i: FoundImage) =>
      words.filter((w) => `${i.title} ${i.description ?? ""}`.toLowerCase().includes(w)).length;
    const images = [...this.images].sort((a, b) => score(b) - score(a)).slice(0, count);
    return { images, failed: [] };
  }

  found(id: string): FoundImage | undefined {
    return this.images.find((i) => i.id === id);
  }

  async download(image: FoundImage): Promise<Buffer> {
    return readFileSync(join(this.dir, image.url));
  }
}

/** What find_images answers the agent (Q167): text only, enough to choose, each with its id. */
export function imagesAnswer(query: string, result: SearchResult): string {
  const lines: string[] = [];
  if (result.failed.length) lines.push(`(${result.failed.join(" and ")} did not answer; these come from the others.)`);
  if (!result.images.length) {
    lines.push(
      `No free image found for "${query}". Try other words, in English, naming what is seen (for example "croissants on a bakery counter"), or do without an image.`,
    );
    return lines.join("\n\n");
  }
  lines.push(
    `Images for "${query}", all free for commercial use. To use one, call use_image with its id, a short file name and an alternative text saying what it shows. Their credits are kept for you.`,
  );
  result.images.forEach((image, i) => {
    const by = image.credit.author ? `, by ${image.credit.author}` : "";
    lines.push(
      [
        `## ${i + 1}. ${image.title} (id ${image.id})`,
        image.description ?? "",
        `${image.width}×${image.height}, ${image.credit.license}${by}, from ${image.credit.source}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  });
  return lines.join("\n\n");
}
