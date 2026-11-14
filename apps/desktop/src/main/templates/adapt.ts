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
import { MANIFEST, Manifest, type TemplateQuestion } from "./manifest";
import { DESIGN_SKILL, projectFiles, readTemplateFolder, type TemplateFiles } from "./reader";

export const TEMPLATE_TEXTS = ".upstart/template-texts.json";

type Stored = { template: string; texts: string[] };

/** Where a site's texts are: its pages, parts, fragments and records. */
const TEXT_FILE = /^(?:pages|parts|fragments)\/.+\.(?:liquid|html?)$|^data\/[^/]+\/[^_][^/]*\.md$/;

/**
 * Copies the site of the template in `dir` into the project `root` (its pages,
 * parts, data, media, fonts, scripts, styles, blocks and design notes; not its
 * manifest or pictures) and keeps its texts for the check. The manifest.
 */
export function copyTemplate(dir: string, root: string): Manifest {
  const files = readTemplateFolder(dir);
  const raw = JSON.parse(files.get(MANIFEST)!.toString("utf8"));
  // Read with its defaults (its questions' among them), as the catalogue reads it.
  const parsed = Manifest.safeParse(raw);
  const manifest = parsed.success ? parsed.data : (raw as Manifest);
  for (const [path, bytes] of projectFiles(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
  writeStored(root, { template: manifest.id, texts: templateTexts(files) });
  return manifest;
}

/** The template's sentences, from the files of its site where texts are. */
export function templateTexts(files: TemplateFiles): string[] {
  const texts = new Set<string>();
  for (const [path, bytes] of projectFiles(files))
    if (TEXT_FILE.test(path)) for (const s of sentencesOf(path, bytes.toString("utf8"))) texts.add(s);
  return [...texts].sort();
}

/** A template's question as the maker left it on the start screen (Q287): the labels, and whether they chose them. */
export type TemplateAnswer = { question: TemplateQuestion; labels: string[]; chosen: boolean };

/**
 * The answers to a template's questions: what the maker chose, each question
 * they did not answer (or answered with labels it does not have) left on its
 * recommended choice, the first.
 */
export function templateAnswers(
  questions: TemplateQuestion[],
  given: Record<string, string | string[]> = {},
): TemplateAnswer[] {
  return questions.map((question) => {
    const recommended = [question.options[0]!.label];
    const labels = question.options.map((o) => o.label);
    const raw = given[question.question];
    const asked = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).filter((l) => labels.includes(l));
    const kept = question.multiSelect ? labels.filter((l) => asked.includes(l)) : asked.slice(0, 1);
    if (!kept.length) return { question, labels: recommended, chosen: false };
    return { question, labels: kept, chosen: kept.join("\n") !== recommended.join("\n") };
  });
}

/**
 * What the agent receives with the maker's first message: the template, how
 * its questions were answered, what adapting it means, and the message itself
 * (Q246, Q287).
 */
export function adaptMessage(
  manifest: Pick<Manifest, "id" | "name" | "description"> & { questions?: TemplateQuestion[] },
  message: string,
  given?: Record<string, string | string[]>,
): string {
  const answers = templateAnswers(manifest.questions ?? [], given);
  const answered = answers.length
    ? `\n\nThe maker answered the template's questions on the start screen; its design notes say what each answer changes:\n${answers
        .map(
          (a) =>
            `- ${a.question.question} → ${a.labels.join(", ")} (${a.chosen ? "the maker's choice" : "left on the recommended answer"})`,
        )
        .join(
          "\n",
        )}\nFollow these answers. Where the maker's message says otherwise, the message wins over an answer left on the recommended one.`
    : "";
  return `This website starts from Upstart's template "${manifest.name}" (${manifest.description}), already copied into the project: its pages, parts, data, media, fonts, scripts, styles and blocks. The project is not empty, so read before you write: first the template's design notes, the ${DESIGN_SKILL(manifest.id).split("/").pop()} skill, then the pages and parts you change.${answered}

Adapt it to the maker's business, described below:
- Rewrite every text for this business, in the language of the maker's message: the pages' titles and descriptions, every part, every fragment, every record of every datasource (data/navigation/ included), the alternative texts. Keep no sentence of the template's own: its business is invented.
- Replace the template's images with images for this site (find_images, then use_image) and delete the media files no page or record uses any more.
- Add the pages the description calls for and remove those it does not need, each in data/navigation/; a datasource the site does not need goes with its pages and parts.
- Keep the design: theme.css, the layout, the type, the effects, the scripts and styles. Change them only where the maker asks.
- Then look at each page with look_at_preview, giving it each page's route: new texts are longer or shorter than the template's, in another language above all. Fix what they broke (a menu label running into a button, a heading wider than the screen) in the markup, keeping the design.
- Last, once the pages are adapted and looked at, ask the maker one card on what you guessed that matters, as for any new website (see Questions to the maker); the template's questions are answered already.
At the end Upstart checks that no text of the template is left.

The maker's message:

${message}`;
}

/** The template's sentences still in the site's files, by file (Q246); none once adapted. */
export function templateTextsLeft(root: string): { file: string; texts: string[] }[] {
  const stored = readStored(root);
  if (!stored?.texts.length) return [];
  const template = new Set(stored.texts.map(key));
  const left: { file: string; texts: string[] }[] = [];
  for (const file of siteFiles(root)) {
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
