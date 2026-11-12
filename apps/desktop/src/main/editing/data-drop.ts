// What dropping a gallery block writes besides its shared part (Q194-Q209):
// a data block brings its datasource — a collection keeps its name for the
// whole site and is reused, a section list is named after the page it is
// dropped on — with its sample records when the datasource is new; a list of
// a collection with a page per record writes that page from the frame of the
// page the block is dropped on; the first header or footer writes the site's
// navigation from the links it already has; a form brings its collected
// datasource, its samples as the preview's test records, and the fragment it
// answers with (Q194, Q182). Pure: it reads the project
// through `ProjectView` and returns the files to write.
import {
  addDefinitionFields,
  newRecordText,
  recordIdFrom,
  sections,
  setOrder,
  TEST_RECORDS_DIR,
} from "@upstart/runtime";
import { copyName } from "./edits";

export type DroppedBlock = {
  id: string;
  kind: string;
  source: string;
  data?: { name: string; family: "collection" | "section" };
  datasource?: { definition: string; records: Record<string, string> };
  detail?: string;
  /** A form's fragments by file name, its answer among them (Q194). */
  fragments?: Record<string, string>;
};

export type ProjectView = {
  exists: (path: string) => boolean;
  read: (path: string) => string | undefined;
  /** Every template of the project, path → text (pages/ and parts/). */
  templates: () => Record<string, string>;
};

export type DataDrop = {
  /** The block's template, its datasource renamed where it had to be. */
  source: string;
  /** Files to write, path → text. */
  writes: Record<string, string>;
  /** The datasource it reads, if it is a data block. */
  datasource?: string;
  /** Whether the datasource was there already (a collection reused). */
  reused?: boolean;
  /** The record page written, if any. */
  recordPage?: string;
  /** The record page again, framed by the page as it is once other blocks are placed in it. */
  reframe?: (page: string) => string;
  /** Fields of the same name but another kind, kept as they were. */
  differ?: string[];
};

export const NAVIGATION = "navigation";

/** Whether a definition is a collected datasource's, filled by visitors (Q172). */
export const isCollected = (definition: string) => /^collected:\s*true\s*$/m.test(definition);
const DEFINITION = "_datasource.yaml";
const definitionOf = (name: string) => `data/${name}/${DEFINITION}`;

/** A page's own part of a section list's name: pages/index.liquid → home, pages/about/team.liquid → about-team. */
export function pageKey(file: string): string {
  const path = file
    .replace(/^(pages|parts)\//, "")
    .replace(/\.liquid$/, "")
    .replace(/\[([\w-]+)\]/g, "$1");
  const parts = path.split("/").filter((p) => p !== "index");
  return (
    parts
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-") || "home"
  );
}

/** A template reading the datasource `from` made to read `to`: data.faq → data["home-faq"]. */
export function renameData(source: string, from: string, to: string): string {
  if (from === to) return source;
  const name = from.replace(/[-]/g, "\\-");
  return source
    .replace(new RegExp(`\\bdata\\.${name}(?![\\w-])`, "g"), `data["${to}"]`)
    .replace(new RegExp(`\\bdata\\[\\s*(["'])${name}\\1\\s*\\]`, "g"), `data["${to}"]`);
}

/** Whether a datasource already has a record page (pages/…/[name].liquid). */
export function hasRecordPage(name: string, templates: Record<string, string>): boolean {
  return Object.keys(templates).some((f) => f.startsWith("pages/") && f.endsWith(`/[${name}].liquid`));
}

const isTop = (s: { kind: string; name: string }) =>
  s.kind === "element" ? /^(header|nav)$/.test(s.name) : /^(banner|header|nav)/.test(s.name);
const isBottom = (s: { kind: string; name: string }) =>
  s.kind === "element" ? s.name === "footer" : /^footer/.test(s.name);

/**
 * A page's frame with `middle` in place of its own sections (Q200, Q215):
 * everything before its first section that is not a banner or a header, then
 * `middle`, then everything after its last section that is not a footer.
 */
export function inFrame(page: string, middle: string): string {
  const list = sections(page);
  let first = 0;
  while (first < list.length && isTop(list[first]!)) first++;
  let last = list.length - 1;
  while (last >= first && isBottom(list[last]!)) last--;
  const section = middle.trim();
  if (!list.length) {
    const body = page.search(/<\/body>/i);
    return body >= 0 ? `${page.slice(0, body)}${section}\n${page.slice(body)}` : `${page}\n${section}\n`;
  }
  if (first > last) {
    // Only a header and a footer: the middle goes between them.
    const at = first > 0 ? list[first - 1]!.outer.end : list[0]!.outer.start;
    return `${page.slice(0, at)}\n${section}\n${page.slice(at)}`;
  }
  return page.slice(0, list[first]!.outer.start) + section + page.slice(list[last]!.outer.end);
}

/** A record page made from the frame of a page (Q200): the detail section in it, the record's title in its title. */
export function framePage(page: string, detail: string, titleField: string): string {
  return inFrame(page, detail).replace(/<title>([^<{]*)<\/title>/i, (_, title: string) =>
    title.trim()
      ? `<title>{{ record.${titleField} }} · ${title.trim()}</title>`
      : `<title>{{ record.${titleField} }}</title>`,
  );
}

/** The links the site's header already has, or else its pages, as navigation records (Q209). */
export function navigationLinks(page: string, project: ProjectView): { label: string; href: string }[] {
  const templates = project.templates();
  const included = [...page.matchAll(/\{%-?\s*(?:render|include)\s+['"]([\w-]+)['"]/g)].map((m) => m[1]!);
  const header = included.find((n) => /^header/.test(n));
  const fromHeader = header ? linksOf(templates[`parts/${header}.liquid`] ?? "") : [];
  if (fromHeader.length) return fromHeader;
  const pages = Object.keys(templates)
    .filter((f) => /^pages\/(?:[\w-]+\/)*[\w-]+\.liquid$/.test(f) && !/\/_/.test(f))
    .sort((a, b) => (a === "pages/index.liquid" ? -1 : b === "pages/index.liquid" ? 1 : a.localeCompare(b)));
  return pages.map((f) => {
    const route = `/${f
      .replace(/^pages\//, "")
      .replace(/\.liquid$/, "")
      .replace(/(^|\/)index$/, "")}`;
    const title = /<title>([^<{]*)<\/title>/i
      .exec(templates[f]!)?.[1]
      ?.split(/\s+[—|·-]\s+/)[0]
      ?.trim();
    const fallback = route === "/" ? "Home" : route.split("/").at(-1)!.replace(/-/g, " ");
    return { label: title || fallback.charAt(0).toUpperCase() + fallback.slice(1), href: route };
  });
}

/** A header's own links: plain-text anchors, not its buttons nor its logo's link home. */
function linksOf(header: string): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  const anchors = [...header.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/gi)];
  anchors.forEach((m, i) => {
    const attrs = m[1]!;
    const label = m[2]!.replace(/\s+/g, " ").trim();
    const href = /\shref\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]?.trim() ?? "";
    if (!label || !href || /\{[{%]/.test(label + href) || /\bbtn\b/.test(attrs)) return;
    // The first link home is the site's name, its logo.
    if (i === 0 && href === "/") return;
    if (!out.some((l) => l.href === href)) out.push({ label, href });
  });
  return out;
}

/** What a dropped block writes besides its part: its datasource, its record page, the site's navigation. */
export function dropData(block: DroppedBlock, pageFile: string, project: ProjectView): DataDrop {
  if (!block.data || !block.datasource) return { source: block.source, writes: {} };
  const base = block.data.name;
  const writes: Record<string, string> = {};
  const taken = (n: string) => project.exists(`data/${n}`);
  let name = base;
  if (block.data.family === "section") {
    const wanted = `${pageKey(pageFile)}-${base}`;
    name = taken(wanted) ? copyName(wanted, taken) : wanted;
  }
  const source = renameData(block.source, base, name);
  const existing = project.read(definitionOf(name));
  const page = project.read(pageFile) ?? "";

  if (existing !== undefined) {
    // A collection reused: the fields it lacks added, no sample records (Q198).
    const merged = addDefinitionFields(existing, block.datasource.definition);
    if (merged.added.length) writes[definitionOf(name)] = merged.text;
    return {
      source,
      writes,
      datasource: name,
      reused: true,
      ...(merged.differ.length ? { differ: merged.differ } : {}),
    };
  }

  if (name === NAVIGATION) {
    // The site's navigation, from the links it already has (Q209).
    const ids: string[] = [];
    const place = /\bname:\s*place\b/.test(block.datasource.definition);
    for (const link of navigationLinks(page, project)) {
      const id = recordIdFrom(link.label, (i) => ids.includes(i));
      ids.push(id);
      writes[`data/${name}/${id}.md`] = newRecordText({ ...link, ...(place ? { place: "both" } : {}) });
    }
    writes[definitionOf(name)] = ids.length ? setOrder(block.datasource.definition, ids) : block.datasource.definition;
  } else {
    writes[definitionOf(name)] = block.datasource.definition;
    // A collected datasource's records are what visitors send: its samples are the preview's test records.
    const records = isCollected(block.datasource.definition) ? `${TEST_RECORDS_DIR}/${name}` : `data/${name}`;
    for (const [file, text] of Object.entries(block.datasource.records)) writes[`${records}/${file}`] = text;
    for (const [file, text] of Object.entries(block.fragments ?? {}))
      if (!project.exists(`fragments/${file}`)) writes[`fragments/${file}`] = text;
  }

  let recordPage: string | undefined;
  let reframe: ((page: string) => string) | undefined;
  if (block.detail && block.data.family === "collection" && !hasRecordPage(name, project.templates())) {
    recordPage = `pages/${name}/[${name}].liquid`;
    const titleField = /fields:\s*\n\s*-\s*name:\s*([\w-]+)/.exec(block.datasource.definition)?.[1] ?? "title";
    const detail = renameData(block.detail, base, name);
    reframe = (page: string) => framePage(page, detail, titleField);
    writes[recordPage] = reframe(page);
  }
  return { source, writes, datasource: name, ...(recordPage ? { recordPage, reframe } : {}) };
}
