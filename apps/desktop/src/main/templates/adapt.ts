// Starting a website from a template (Q229, Q246): the template's site is
// copied into the new project, the agent is told to adapt it to the maker's
// business, and at the end of its turns Upstart checks that none of the
// template's texts are left, as it does for the gallery's lorem ipsum (Q223).
// The template's texts are kept in the project, .upstart/template-texts.json,
// as sentences; a sentence the agent was told of once and kept is forgotten,
// the maker may have asked for it.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { splitRecord } from "@upstart/runtime";
import { type Adaptation, removalsLeft, startAdaptation } from "./adaptation";
import { MANIFEST, Manifest } from "./manifest";
import { type GuidePage, type GuideSections, guideSections, HOME, pageTypes } from "./pages";
import { DESIGN_SKILL, GUIDE, projectFiles, readTemplateFolder, type TemplateFiles } from "./reader";

export const TEMPLATE_TEXTS = ".upstart/template-texts.json";

type Stored = { template: string; texts: string[] };

/** Where a site's texts are: its pages, parts, fragments and records. */
const TEXT_FILE = /^(?:pages|parts|fragments)\/.+\.(?:liquid|html?)$|^data\/[^/]+\/[^_][^/]*\.md$/;

/**
 * Copies the site of the template in `dir` into the project `root` (its pages,
 * parts, data, media, fonts, scripts, styles, blocks and design notes; not its
 * manifest, guide or pictures) and keeps its texts for the check. The
 * adaptation starts, page type by page type, its guide kept for the agent
 * (Q302, Q307). Its manifest, and its guide for the first message.
 */
export function copyTemplate(dir: string, root: string): { manifest: Manifest; guide: string | undefined } {
  const files = readTemplateFolder(dir);
  const raw = JSON.parse(files.get(MANIFEST)!.toString("utf8"));
  const parsed = Manifest.safeParse(raw);
  const manifest = parsed.success ? parsed.data : (raw as Manifest);
  const copied = projectFiles(files);
  for (const [path, bytes] of copied) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
  writeStored(root, { template: manifest.id, texts: templateTexts(files) });
  const guide = files.get(GUIDE)?.toString("utf8").trim() || undefined;
  startAdaptation(root, manifest.id, guide, pageTypes(copied.keys()));
  return { manifest, guide };
}

/** The template's sentences, from the files of its site where texts are. */
export function templateTexts(files: TemplateFiles): string[] {
  const texts = new Set<string>();
  for (const [path, bytes] of projectFiles(files))
    if (TEXT_FILE.test(path)) for (const s of sentencesOf(path, bytes.toString("utf8"))) texts.add(s);
  return [...texts].sort();
}

/** How the agent ends each page type's turn (Q308). */
const END_OF_PAGE =
  "Then stop, ending with one or two sentences in the maker's language on what you invented on this page that matters (prices, hours, a phone number, an address), and nothing else: no card, no summary of the pages to come. Upstart then shows the maker the list of pages and the button to go on.";

/** How the agent asks a page type's choices of the guide, before it changes its files (Q298, Q304). */
const CHOICES =
  "ask the maker in one card with AskUserQuestion, all of them together: in the maker's language, each option with what it means for the site, the guide's first option recommended. A choice the maker's messages settle, follow it without asking; when they settle them all, or when there are none, ask nothing. A skipped card means the recommended choices.";

/** How the agent writes what it adapts, page type by page type (Q246). */
const REWRITE = [
  "- Rewrite every text of what you adapt for this business, in the language of the maker's message: the pages' titles and descriptions, the parts, the fragments, the records of the datasources they show, the alternative texts. Keep no sentence of the template's own there: its business is invented.",
  "- Replace the template's images there with images for this site (find_images, then use_image), and delete the media files no page or record uses any more.",
  "- Keep the design: theme.css, the layout, the type, the effects, the scripts and styles. Change them only where the maker asks.",
].join("\n");

/**
 * What the agent receives with the maker's first message (Q246, Q302-Q313):
 * the template, its guide, and the first turn of its adaptation: the card of
 * pages, the home page's choices left open, then the home page and what every
 * page shares, the page types not kept removed.
 */
export function adaptMessage(
  manifest: Pick<Manifest, "id" | "name" | "description">,
  message: string,
  guide: string | undefined,
  steps: { route: string; name: string; line?: string }[],
): string {
  const sections = guide ? guideSections(guide) : undefined;
  const home = sections?.pages.find((p) => p.route === HOME);
  const guided = guide
    ? `\n\nThe template's guide, written by its author for the agent that adapts it (it is not in the website):\n\n<template-guide>\n${guide}\n</template-guide>`
    : "";
  const listed = steps.map((s) => `  - ${s.route} (${s.name})${s.line ? `: ${s.line}` : ""}`).join("\n");
  return `This website starts from Upstart's template "${manifest.name}" (${manifest.description}), already copied into the project: its pages, parts, data, media, fonts, scripts, styles and blocks. The project is not empty, so read before you write: ${guide ? "the template's guide below, " : ""}its design notes (the ${DESIGN_SKILL(manifest.id).split("/").pop()} skill), then the pages and parts you change.${guided}

It is adapted to the maker's business one page type at a time, the home page first: the maker looks at each before the next comes, a turn of its own. In this first turn:
1. First, before you change any file: show the maker the card of pages with choose_pages. List every page type of the template below, each named and described in one line for this business, in the language of the maker's message, which is the site's (a message in English about a bar in Seville gives a card in English); checked when the maker's message calls for it or does not rule it out, unchecked when the business has no use for it; the home page always kept. Add, as new pages, those the message asks for that the template lacks.
${listed}
2. Then, ${home ? "of the choices in the guide's section for the home page (they hold for the home page and the whole website), those the maker's message leaves open: " : "if the maker's message leaves open a choice for the home page or the whole website that is costly to guess, "}${CHOICES} Ask nothing yet of the other pages: their choices come with their turn.
3. Adapt the home page and what every page shares: the header, the footer, the navigation (data/navigation/: the pages kept, new ones included, named in the maker's language), the website's name. Remove the page types the maker did not keep${sections?.pages.length ? ', as their sections\' "When removed" say' : ""}, with their navigation records and what only they use, and point what led to them elsewhere. Leave the other pages as they are: they keep the template's contents until their turn, and so do the records the home page only teases (the dishes of the menu, the next events): they are adapted with their own page.
${REWRITE}
- Look at the home page with look_at_preview, down to its footer: one look shows one screen, so look again with \`at\` on the parts further down. New texts are longer or shorter than the template's, in another language above all: fix what they broke in the markup and the problems the looks measured, keeping the design.
4. ${END_OF_PAGE}
At the end of each turn Upstart checks that no text of the template is left in what was adapted.

The maker's message:

${message}`;
}

/**
 * What Continue sends the agent (Q303): the next page type of the adaptation,
 * the guide's general part and the page type's section (Q299 amended), and
 * what the maker took off the website since.
 */
export function stepMessage(
  state: Adaptation,
  step: { route: string; name: string; new?: boolean },
  sections: GuideSections | undefined,
  { again = false, removals = [] as { name: string; route: string; files: string[] }[] } = {},
): string {
  const section: GuidePage | undefined = sections?.pages.find((p) => p.route === step.route);
  const done = state.steps.filter((s) => s.status === "done" || s.status === "ready").map((s) => s.name);
  const after = state.steps.filter((s) => s.status === "todo" && s.route !== step.route).map((s) => s.name);
  const page = step.route.slice(1);
  const build = step.new
    ? `2. Build this new page: find_blocks, then use_block into pages/${page}.liquid, its blocks for what the maker's messages ask of it, preferring the blocks of this site's own design; then write its texts and records for this business. It is in the navigation, or add it.`
    : `2. Adapt this page type only: its pages (pages/${page}.liquid, pages/${page}/…), and what only they show (their parts, the records of their datasources, their images), as you adapted the home page. Change a page already adapted only where this one needs it (a link to it).`;
  const removed = removals.length
    ? `\n- Also remove these page types, which the maker took off the website: ${removals.map((r) => `${r.name} (${r.files.join(", ")})`).join("; ")}${sections?.pages.length ? ', as their sections\' "When removed" say' : ""}, with their navigation records and what only they use, pointing what led to them elsewhere.`
    : "";
  return `${again ? "Taking up again the page the last turn left unfinished. " : ""}Next page of the adaptation: ${step.name} (${step.route})${step.new ? ", a new page" : ""}.${done.length ? ` Adapted already: ${done.join(", ")}.` : ""}${after.length ? ` Still to do after it: ${after.join(", ")}.` : " It is the last."}
${sections?.general ? `\nThe template's guide, its general part:\n\n<template-guide>\n${sections.general}\n</template-guide>\n` : ""}${section ? `\nIts section of the template's guide:\n\n<template-guide-section>\n${section.text}\n</template-guide-section>\n` : ""}
1. First, before you change its files: of ${section ? "this section's choices" : "the choices for this page that are costly to guess"}, those the maker's messages leave open: ${CHOICES}
${build}
${REWRITE}${removed}
3. Look at each of its pages with look_at_preview, down to the footer (\`at\` on the parts further down; one record's page is enough), and fix what the new texts broke and the problems the looks measured.
4. ${END_OF_PAGE}`;
}

/** What Continue sends when only page types taken off the website are left to remove (Q307). */
export function removalMessage(
  removals: { name: string; files: string[] }[],
  sections: GuideSections | undefined,
): string {
  return `The maker took these page types off the website: ${removals.map((r) => `${r.name} (${r.files.join(", ")})`).join("; ")}. Remove them${sections?.pages.length ? ' as their sections of the template\'s guide say ("When removed")' : ""}, with their navigation records and what only they use, pointing what led to them elsewhere. Then stop with one sentence on what you removed.`;
}

/**
 * What the agent reads before a message the maker writes during the
 * adaptation (Q303): the page they are looking at, and the pages to come,
 * which it leaves alone.
 */
export function reviewNote(state: Adaptation, removals: { name: string; files: string[] }[] = []): string {
  const looked = state.steps.find((s) => s.status === "ready" || s.status === "doing");
  const after = state.steps.filter((s) => s.status === "todo").map((s) => `${s.name} (${s.route})`);
  if (!state.chosen)
    return "[Upstart: this website is being adapted from its template, one page at a time, and the maker has not chosen its pages yet. Do what the message asks; then show them the card of pages with choose_pages, as the first message said, before adapting the home page.]";
  return `[Upstart: this website is being adapted from its template, one page at a time.${looked ? ` The maker is looking at ${looked.name} (${looked.route}).` : ""} Do what they ask now, as for any website${after.length ? `, and leave the pages still to do as they are (${after.join(", ")}): they come one at a time when the maker goes on` : ""}.${removals.length ? ` Also remove the pages the maker took off the website: ${removals.map((r) => `${r.name} (${r.files.join(", ")})`).join("; ")}, as the template's guide says.` : ""} End with what you changed, no card.]`;
}

/** The page types taken off the website whose pages are still there, for the messages. */
export function removalsOf(root: string, state: Adaptation) {
  return removalsLeft(root, state).map(({ step, files }) => ({ name: step.name, route: step.route, files }));
}

/**
 * The template's sentences still in the site's files, by file (Q246); none
 * once adapted. `scope`: the files looked at, during an adaptation those of
 * the page types adapted and what they share (Q305).
 */
export function templateTextsLeft(
  root: string,
  scope?: (file: string) => boolean,
): { file: string; texts: string[] }[] {
  const stored = readStored(root);
  if (!stored?.texts.length) return [];
  const template = new Set(stored.texts.map(key));
  const left: { file: string; texts: string[] }[] = [];
  for (const file of siteFiles(root)) {
    if (scope && !scope(file)) continue;
    const texts = sentencesOf(file, readFileSync(join(root, file), "utf8")).filter((s) => template.has(key(s)));
    if (texts.length) left.push({ file, texts });
  }
  return left;
}

/**
 * The end of a turn: the sentences left after the agent was told of them are
 * kept on purpose and forgotten; with none left, the check is over.
 */
export function forgetTemplateTexts(root: string, kept: string[]) {
  const stored = readStored(root);
  if (!stored) return;
  const gone = new Set(kept.map(key));
  const texts = stored.texts.filter((s) => !gone.has(key(s)));
  if (!texts.length || !templateTextsLeft(root).length) rmSync(join(root, TEMPLATE_TEXTS), { force: true });
  else writeStored(root, { ...stored, texts });
}

/** What the agent is told when its turn would end with page types taken off the website still there (Q307). */
export function removalsLeftNote(removals: { name: string; files: string[] }[]): string {
  return `The maker took these pages off the website, and they are still there: ${removals.map((r) => `${r.name} (${r.files.join(", ")})`).join("; ")}. Remove them as the template's guide says, with their navigation records and what only they use, before you finish.`;
}

/** What the agent is told when its turn would end with the template's texts left. */
export function templateLeftNote(left: { file: string; texts: string[] }[]): string {
  const count = left.reduce((n, l) => n + l.texts.length, 0);
  const shown = left
    .slice(0, 12)
    .map(({ file, texts }) => {
      const quoted = texts.slice(0, 3).map((s) => `"${s.length > 90 ? `${s.slice(0, 87)}…` : s}"`);
      return `- ${file}: ${quoted.join(", ")}${texts.length > 3 ? ` and ${texts.length - 3} more` : ""}`;
    })
    .join("\n");
  return `${count} ${count === 1 ? "sentence" : "sentences"} of the template's invented business ${count === 1 ? "is" : "are"} still in the site:\n${shown}${left.length > 12 ? `\n- and ${left.length - 12} more files` : ""}\nRewrite them for this business, or delete what it does not need, before you finish. Keep one only if the maker asked for it.`;
}

function siteFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const child = join(abs, e.name);
      if (e.isDirectory()) walk(child);
      else {
        const path = relative(root, child).split(sep).join("/");
        if (TEXT_FILE.test(path)) out.push(path);
      }
    }
  };
  for (const top of ["pages", "parts", "fragments", "data"]) walk(join(root, top));
  return out.sort();
}

function readStored(root: string): Stored | undefined {
  const file = join(root, TEMPLATE_TEXTS);
  if (!existsSync(file)) return undefined;
  try {
    const stored = JSON.parse(readFileSync(file, "utf8")) as Stored;
    return Array.isArray(stored.texts) ? stored : undefined;
  } catch {
    return undefined;
  }
}

function writeStored(root: string, stored: Stored) {
  const file = join(root, TEMPLATE_TEXTS);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`);
}

/** Sentences compare without case or spacing. */
const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

/** Tags inside a sentence: they do not end it. */
const INLINE =
  /<\/?(?:a|abbr|b|bdi|bdo|cite|code|data|dfn|em|i|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr)\b[^>]*>/gi;

/** A file's sentences: what a visitor reads of a page or a record. */
export function sentencesOf(path: string, src: string): string[] {
  const segments: string[] = [];
  if (path.endsWith(".md")) {
    const split = splitRecord(src);
    if (!split) return [];
    segments.push(...yamlStrings(split.yaml));
    segments.push(...markdownBlocks(split.body));
  } else {
    let html = src
      .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");
    // What a visitor reads in attributes: alternative texts, labels, the description.
    for (const m of html.matchAll(/\s(?:alt|title|placeholder|aria-label|content)\s*=\s*(["'])([^"']*)\1/gi))
      segments.push(m[2]!);
    html = html.replace(/<br\s*\/?>/gi, " ").replace(INLINE, "");
    // Liquid's output and tags split texts: what they hold is not the template's.
    html = html.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, "\n");
    for (const part of html.split(/<[^>]*>/)) segments.push(part);
  }
  const sentences: string[] = [];
  for (const segment of segments)
    for (const raw of decode(segment).split(/(?<=[.!?…])\s+|\n+/)) {
      const s = raw.replace(/\s+/g, " ").trim();
      if (isSentence(s)) sentences.push(s);
    }
  return sentences;
}

/** Three words and sixteen characters at least, mostly letters: not a label, an address or code. */
function isSentence(s: string): boolean {
  if (s.length < 16 || s.split(" ").length < 3) return false;
  if (/^(?:\/|https?:|#|\.|[\w-]+\.(?:jpe?g|png|webp|svg)$)/i.test(s) || /[{}<>=;]/.test(s)) return false;
  const letters = s.match(/\p{L}/gu)?.length ?? 0;
  return letters >= s.length * 0.6;
}

/** The string values of a record's fields. */
function yamlStrings(yaml: string): string[] {
  const out: string[] = [];
  for (const m of yaml.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'/g))
    out.push((m[1] ?? m[2] ?? "").replace(/\\"/g, '"'));
  const unquoted = yaml.replace(/"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'/g, "");
  for (const line of unquoted.split("\n")) {
    const value = /^\s*(?:-\s+|[\w-]+:\s+)(?:-\s+)?(.+)$/.exec(line)?.[1]?.trim();
    if (!value || /^[[{|>]/.test(value)) {
      const flow = /\[(.*)\]/.exec(line)?.[1];
      if (flow) out.push(...flow.split(","));
      continue;
    }
    out.push(value);
  }
  return out;
}

/** A record's Markdown, as its paragraphs, headings and list items. */
function markdownBlocks(md: string): string[] {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "\n")
    .split(/\n\s*\n|\n(?=\s*(?:[-*+]|\d+\.|#{1,6})\s)/)
    .map((block) => block.replace(/^\s*(?:#{1,6}|[-*+]|\d+\.|>)\s+/gm, "").replace(/[*_`]+/g, ""));
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;|&#8217;/g, "’")
    .replace(/&lsquo;|&#8216;/g, "‘")
    .replace(/&ldquo;|&#8220;/g, "“")
    .replace(/&rdquo;|&#8221;/g, "”")
    .replace(/&mdash;|&#8212;/g, "—")
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
