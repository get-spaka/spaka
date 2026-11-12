// What the agent's use_block tool writes (Q213-Q216): the chosen gallery
// blocks of one page, put in as a drag puts one — each a shared part named
// by its role, its datasource named and reused the same way, its sample
// records, its record page, the site's first navigation — with their
// {% render %} lines in reading order, the page created from the site's
// frame when it does not exist yet. Pure: it reads the project through
// `ProjectView` and returns the files to write.
import { type DroppedBlock, dropData, inFrame, NAVIGATION, type ProjectView } from "./data-drop";
import { copyName, insertBefore, placeFor } from "./edits";

export type Placing = {
  /** The page, pages/<name>.liquid. */
  page: string;
  /** For a page that does not exist yet. */
  title?: string;
  description?: string;
  /** The site's language, for its first page. */
  lang?: string;
  /** In reading order: a gallery block and the role its part is named after. */
  blocks: { block: string; name: string }[];
};

export type PlacedPart = {
  part: string;
  block: string;
  kind: string;
  datasource?: string;
  family?: "collection" | "section";
  reused?: boolean;
  recordPage?: string;
  differ?: string[];
};

export type Placed = {
  writes: Record<string, string>;
  /** Sample records written from the gallery, to be replaced by the site's own (Q214, Q217). */
  samples: string[];
  parts: PlacedPart[];
  /** Whether the page was created. */
  created: boolean;
};

const PAGE = /^pages\/(?:[a-z0-9][\w-]*\/)*[a-z0-9][\w-]*\.liquid$/;
const INDEX = "pages/index.liquid";

/** A part's name from the role the agent gives it: "Our menu" → our-menu. */
export function roleName(role: string, fallback: string): string {
  const name = role
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || fallback;
}

const attr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** A new page: the frame of the home page with its own title, or a bare document for the site's first page. */
function newPage(project: ProjectView, page: string, title: string, description: string, lang: string): string {
  const home = page === INDEX ? undefined : project.read(INDEX);
  if (home) {
    return inFrame(home, "")
      .replace(/\n[ \t]*\n/g, "\n")
      .replace(/<title>[^<]*<\/title>/i, `<title>${attr(title)}</title>`)
      .replace(/(<meta\s+name="description"\s+content=")[^"]*"/i, `$1${attr(description)}"`)
      .replace(/(<meta\s+property="og:title"\s+content=")[^"]*"/i, `$1${attr(title)}"`)
      .replace(/(<meta\s+property="og:description"\s+content=")[^"]*"/i, `$1${attr(description)}"`);
  }
  return `<!doctype html>
<html lang="${attr(lang)}">
<head>
  <title>${attr(title)}</title>
  <meta name="description" content="${attr(description)}">
  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(description)}">
</head>
<body>
</body>
</html>
`;
}

export function placeBlocks(
  input: Placing,
  project: ProjectView,
  block: (id: string) => DroppedBlock | undefined,
): Placed {
  if (!PAGE.test(input.page))
    throw new Error(
      `${input.page} is not a page: give its file, pages/<name>.liquid (pages/index.liquid for the home page). A page per record is written by the block that lists the records.`,
    );
  if (!input.blocks.length) throw new Error("Give at least one block.");
  const writes: Record<string, string> = {};
  // The project as it will be once the blocks placed so far are written.
  const view: ProjectView = {
    exists: (path) => project.exists(path) || Object.keys(writes).some((f) => f === path || f.startsWith(`${path}/`)),
    read: (path) => writes[path] ?? project.read(path),
    templates: () => ({
      ...project.templates(),
      ...Object.fromEntries(Object.entries(writes).filter(([f]) => /^(pages|parts)\//.test(f))),
    }),
  };
  let src = project.read(input.page);
  const created = src === undefined;
  if (src === undefined) {
    if (!input.title?.trim() || !input.description?.trim())
      throw new Error(`${input.page} does not exist yet: give its title and description too.`);
    src = newPage(project, input.page, input.title.trim(), input.description.trim(), input.lang?.trim() || "en");
  }
  writes[input.page] = src;

  const samples: string[] = [];
  const parts: PlacedPart[] = [];
  for (const { block: id, name: role } of input.blocks) {
    const b = block(id);
    if (!b) throw new Error(`No block ${id} in the gallery: use the ids find_blocks gave. Nothing was written.`);
    const taken = (n: string) => view.exists(`parts/${n}.liquid`);
    const wanted = roleName(role, id);
    const name = taken(wanted) ? copyName(wanted, taken) : wanted;
    const drop = dropData({ ...b, id }, input.page, view);
    Object.assign(writes, drop.writes);
    // The part names its ids and radio groups after itself, so that two on one page stay apart.
    const source = drop.source.replaceAll(id, name);
    writes[`parts/${name}.liquid`] = source.endsWith("\n") ? source : `${source}\n`;
    if (drop.datasource && drop.datasource !== NAVIGATION)
      samples.push(
        ...Object.keys(drop.writes).filter((f) => f.startsWith(`data/${drop.datasource}/`) && f.endsWith(".md")),
      );
    src = insertBefore(src, placeFor(src, b.kind), `{% render '${name}' %}`);
    writes[input.page] = src;
    parts.push({
      part: `parts/${name}.liquid`,
      block: id,
      kind: b.kind,
      ...(drop.datasource ? { datasource: drop.datasource, family: b.data?.family } : {}),
      ...(drop.reused ? { reused: true } : {}),
      ...(drop.recordPage ? { recordPage: drop.recordPage } : {}),
      ...(drop.differ ? { differ: drop.differ } : {}),
    });
  }
  return { writes, samples, parts, created };
}

/** What use_block answers: what was written, and what the agent writes next. */
export function placedAnswer(input: Placing, placed: Placed): string {
  const lines = [
    placed.created
      ? `Created ${input.page}, with the site's frame, and put in its blocks in this order:`
      : `Put into ${input.page}, each at its place:`,
  ];
  for (const p of placed.parts) {
    let line = `- ${p.part} (${p.kind}, from ${p.block})`;
    if (p.datasource === NAVIGATION) line += `, reading the site's navigation, data/${NAVIGATION}/`;
    else if (p.datasource && p.reused)
      line += `, reading data/${p.datasource}/, which the site already has: its records kept, the fields it lacked added`;
    else if (p.datasource)
      line += `, reading data/${p.datasource}/ (${p.family === "collection" ? "a collection shared by the site" : "this section's own list"}), written with the gallery's sample records`;
    if (p.differ?.length)
      line += `; its fields ${p.differ.join(", ")} already exist with another kind and were kept: check the part reads them right`;
    if (p.recordPage) line += `; and ${p.recordPage}, its page per record, from this page's frame`;
    lines.push(`${line}.`);
  }
  lines.push(
    "",
    "Next, part by part, the hero's first: read each part, then write this site's own texts in place of every example, keeping its structure and classes.",
  );
  if (placed.samples.length)
    lines.push(
      `Then write this site's records in place of the samples (${placed.samples.join(", ")}): rewrite them, add records, delete those you do not need. None may stay as the gallery wrote it.`,
    );
  if (placed.parts.some((p) => p.datasource === NAVIGATION))
    lines.push(
      `Check data/${NAVIGATION}/: one record per page in the menu, home first, with its label, address and place.`,
    );
  return lines.join("\n");
}
