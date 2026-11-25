// Media (Q149-Q157): files in media/, each image with a file beside it holding
// its alternative text and, for one taken from an open collection, its
// credits (media/cafe.jpg and media/cafe.json, Q155). The runtime fills an
// image's missing alt from it, and lists the images whose licence asks for a
// credit on a /credits page, linked from the end of every footer (Q157), both
// in the site's language (Q325).
import { escapeHtml } from "./escape.ts";
import type { ProjectSource } from "./source.ts";

export type Credit = {
  title?: string;
  author?: string;
  authorUrl?: string;
  license: string;
  licenseUrl?: string;
  /** Where it was found: "Wikimedia Commons", "Openverse (Flickr)"… */
  source?: string;
  sourceUrl?: string;
};

/**
 * How an image was generated (Q428): by which model, from which prompt, when,
 * and from which images of the project; kept to make it again or vary it. It
 * has no credit to give.
 */
export type Generation = { model: string; prompt: string; date: string; references?: string[] };

export type MediaInfo = { alt?: string; credit?: Credit; generated?: Generation };

export const CREDITS_ROUTE = "/credits";

/** media/cafe.jpg gives media/cafe.json. */
export function infoFile(path: string): string {
  return `${path.replace(/\.[^./]+$/, "")}.json`;
}

/** Whether a licence asks for the author to be credited where the image is shown. */
export function needsCredit(license: string | undefined): boolean {
  return !!license && /^cc[\s-]*by\b/i.test(license.trim());
}

export function mediaInfo(source: ProjectSource, path: string): MediaInfo | undefined {
  const text = source.read(infoFile(path.replace(/^\//, "")));
  if (!text) return undefined;
  try {
    const value = JSON.parse(text) as MediaInfo;
    return value && typeof value === "object" ? value : undefined;
  } catch {
    return undefined;
  }
}

/** The media files that are not the files beside them. */
export function mediaFiles(source: ProjectSource): string[] {
  const all = source.list("media");
  const stems = new Set(all.filter((f) => !f.endsWith(".json")).map((f) => f.replace(/\.[^./]+$/, "")));
  return all.filter((f) => !(f.endsWith(".json") && stems.has(f.slice(0, -".json".length))));
}

/** The files a site is written in, where a media file can be used. */
const USING = ["pages", "parts", "fragments", "data"];

/** The images whose credits the site must show: credited by their licence, and used somewhere. */
export function creditedMedia(source: ProjectSource): { path: string; credit: Credit }[] {
  const credited: { path: string; credit: Credit }[] = [];
  for (const path of mediaFiles(source)) {
    const info = mediaInfo(source, path);
    if (info?.credit && needsCredit(info.credit.license)) credited.push({ path, credit: info.credit });
  }
  if (!credited.length) return credited;
  const texts = USING.flatMap((dir) => source.list(dir).map((f) => source.read(f) ?? ""));
  return credited.filter(({ path }) => texts.some((t) => t.includes(path)));
}

/** Gives each <img> of a media file that has no alt attribute the alt text kept beside the file. */
export function fillAlts(html: string, source: ProjectSource): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (/\salt\s*=/i.test(tag)) return tag;
    const src = /\ssrc\s*=\s*["']?\/?(media\/[^"'\s>]+)/i.exec(tag)?.[1];
    if (!src) return tag;
    const alt = mediaInfo(source, decodeURI(src))?.alt;
    if (!alt) return tag;
    return tag.replace(/^<img\b/i, `<img alt="${escapeHtml(alt)}"`);
  });
}

/** The credits' words in a language, for the link and the /credits page (Q325). */
type CreditsWords = { title: string; by: string; via: string; home: string };

/** The languages Spaka writes the credits in; any other gets English. */
const ENGLISH: CreditsWords = { title: "Image credits", by: "by", via: "via", home: "Home" };
const CREDITS_WORDS: Record<string, CreditsWords> = {
  en: ENGLISH,
  fr: { title: "Crédits photos", by: "par", via: "via", home: "Accueil" },
  de: { title: "Bildnachweis", by: "von", via: "über", home: "Startseite" },
  es: { title: "Créditos de las imágenes", by: "por", via: "vía", home: "Inicio" },
  it: { title: "Crediti delle immagini", by: "di", via: "tramite", home: "Home" },
  pt: { title: "Créditos das imagens", by: "por", via: "via", home: "Início" },
  nl: { title: "Beeldverantwoording", by: "door", via: "via", home: "Home" },
  ca: { title: "Crèdits de les imatges", by: "per", via: "via", home: "Inici" },
  sv: { title: "Bildkällor", by: "av", via: "via", home: "Start" },
  da: { title: "Billedkreditering", by: "af", via: "via", home: "Forside" },
  nb: { title: "Bildekreditering", by: "av", via: "via", home: "Forside" },
  pl: { title: "Źródła zdjęć", by: "autor:", via: "źródło:", home: "Strona główna" },
};

/** The language a page says it is in (`<html lang="fr-CA">` gives "fr-CA"), if any. */
export function pageLanguage(html: string): string | undefined {
  const root = /<html\b[^>]*?\slang\s*=\s*["']?([a-z]{2,3}(?:-[a-z0-9]+)*)/i.exec(html);
  return root?.[1];
}

/** The credits' words for a language: by its first part, Norwegian as one, English otherwise. */
export function creditsWords(language: string | undefined): CreditsWords {
  const primary = (language ?? "en").toLowerCase().split("-")[0] ?? "en";
  return CREDITS_WORDS[primary === "no" || primary === "nn" ? "nb" : primary] ?? ENGLISH;
}

/**
 * The credits link, at the end of the page's last footer, or of its body
 * without one, in the page's language. None when the page already links to
 * the credits, whoever wrote that link (Q325).
 */
export function addCreditsLink(html: string): string {
  // Already there: the element itself, not a stylesheet's selector naming it.
  if (/<[a-z][^>]*\sdata-spaka-credits\b/i.test(html)) return html;
  if (/<a\b[^>]*\shref\s*=\s*["']?\/credits\/?(?=["'\s>#?])/i.test(html)) return html;
  const words = creditsWords(pageLanguage(html));
  const link = `<p data-spaka-credits style="margin:0.75rem 0 0;font-size:0.75rem;opacity:0.7"><a href="${CREDITS_ROUTE}" style="color:inherit">${escapeHtml(words.title)}</a></p>`;
  const footer = html.toLowerCase().lastIndexOf("</footer>");
  if (footer >= 0) return html.slice(0, footer) + link + html.slice(footer);
  const body = html.toLowerCase().lastIndexOf("</body>");
  return body >= 0 ? html.slice(0, body) + link + html.slice(body) : html + link;
}

/** The /credits page: every credited image of the site, in the site's theme and language. */
export function creditsPage(credited: { path: string; credit: Credit }[], language = "en"): string {
  const words = creditsWords(language);
  const a = (text: string, url?: string) =>
    url ? `<a class="link" href="${escapeHtml(url)}">${escapeHtml(text)}</a>` : escapeHtml(text);
  const items = credited
    .map(({ path, credit }) => {
      const parts = [
        credit.title ? `“${a(credit.title, credit.sourceUrl)}”` : "",
        credit.author ? `${escapeHtml(words.by)} ${a(credit.author, credit.authorUrl)}` : "",
        a(credit.license, credit.licenseUrl),
        credit.source ? `${escapeHtml(words.via)} ${escapeHtml(credit.source)}` : "",
      ].filter(Boolean);
      return `<li class="flex items-center gap-4"><img src="/${escapeHtml(path)}" alt="" class="h-16 w-24 shrink-0 rounded object-cover"><span>${parts.join(", ")}</span></li>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head><title>${escapeHtml(words.title)}</title><meta name="robots" content="noindex"></head>
<body class="bg-base-100 text-base-content">
<main class="mx-auto max-w-3xl px-6 py-16">
<p><a class="link" href="/">← ${escapeHtml(words.home)}</a></p>
<h1 class="mt-6 mb-8 text-3xl font-bold">${escapeHtml(words.title)}</h1>
<ul class="flex flex-col gap-4">
${items}
</ul>
</main>
</body>
</html>`;
}

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
 * when it has none; its src stays the original, for browsers without WebP
 * (Q156). An <img> with a srcset of its own is left as it is.
 */
export function withSrcset(html: string, copies: ReadonlyMap<string, number[]>): string {
  if (!copies.size) return html;
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
