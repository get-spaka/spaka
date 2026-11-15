// A template's page types (Q306) and its guide's sections (Q304): the pages
// that share their first folder in pages/, with their records, which an
// adaptation goes through one at a time, the home page first (Q302); and for
// each the part of the guide the agent reads when its turn comes.

/** Where the guide has a section per page type (Q306). */
export const PAGES_SECTION = "## Pages";
/** The home page's type, always kept and adapted first. */
export const HOME = "/";

/** A page type: its route ("/", "/menu", "/events") and its page files. */
export type PageType = { route: string; files: string[] };

/** The page type a page file belongs to: "/" for pages/index.liquid, "/events" for pages/events/[events].liquid. */
export function pageTypeOf(path: string): string | undefined {
  const m = /^pages\/(.+)\.(?:liquid|html?)$/.exec(path);
  if (!m) return undefined;
  return m[1] === "index" ? HOME : `/${m[1]!.split("/")[0]}`;
}

/** The page types of a site's files: the home page first, then by route. */
export function pageTypes(paths: Iterable<string>): PageType[] {
  const types = new Map<string, string[]>();
  for (const path of paths) {
    const route = pageTypeOf(path);
    if (!route) continue;
    const files = types.get(route) ?? [];
    files.push(path);
    types.set(route, files);
  }
  return [...types]
    .map(([route, files]) => ({ route, files: files.sort() }))
    .sort((a, b) => (a.route === HOME ? -1 : b.route === HOME ? 1 : a.route.localeCompare(b.route)));
}

/** A page type's section of the guide: its heading's name and route, and its text with the heading. */
export type GuidePage = { route: string; name: string; text: string };

/** The guide as an adaptation reads it: what holds for the whole site, then a section per page type, in order. */
export type GuideSections = { general: string; pages: GuidePage[] };

const PAGE_HEADING = /^###\s+(.+?)\s*\(`(\/[^`]*)`\)\s*$/;

/**
 * The guide's sections: under "## Pages", each "### Name (`/route`)" up to the
 * next; the rest of the guide is its general part.
 */
export function guideSections(guide: string): GuideSections {
  const lines = guide.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.trim() === PAGES_SECTION);
  if (start < 0) return { general: guide.trim(), pages: [] };
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  const pages: GuidePage[] = [];
  let current: { route: string; name: string; lines: string[] } | undefined;
  const close = () => {
    if (current) pages.push({ route: current.route, name: current.name, text: current.lines.join("\n").trim() });
  };
  for (const line of lines.slice(start + 1, end)) {
    const heading = PAGE_HEADING.exec(line);
    if (heading) {
      close();
      current = { route: heading[2]!, name: heading[1]!, lines: [line] };
    } else if (/^###\s/.test(line)) {
      close();
      current = undefined;
    } else current?.lines.push(line);
  }
  close();
  const general = [...lines.slice(0, start), ...lines.slice(end)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { general, pages };
}

/** The headings of the guide's "### " sections under "## Pages" that do not name a page type's route. */
export function strayPageHeadings(guide: string): string[] {
  const lines = guide.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.trim() === PAGES_SECTION);
  if (start < 0) return [];
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).filter((l) => /^###\s/.test(l) && !PAGE_HEADING.test(l));
}

/** A page type's name from its route, when the guide gives none: "/private-dining" → "Private dining". */
export function routeName(route: string): string {
  if (route === HOME) return "Home";
  const words = route.slice(1).replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The page types in the guide's order, those it does not name last; the home page always first. */
export function inGuideOrder<T extends { route: string }>(types: T[], sections: GuideSections): T[] {
  const order = new Map(sections.pages.map((p, i) => [p.route, i]));
  return [...types].sort((a, b) => {
    if (a.route === HOME) return -1;
    if (b.route === HOME) return 1;
    return (order.get(a.route) ?? 1e9) - (order.get(b.route) ?? 1e9) || a.route.localeCompare(b.route);
  });
}

/** The first paragraph of a page type's section: what the page shows. */
export function sectionLine(text: string): string {
  const body = text.split("\n").slice(1).join("\n").trim();
  return (body.split(/\n\s*\n/)[0] ?? "").replace(/\s+/g, " ").trim();
}
