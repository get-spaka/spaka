// The maker's own edits, written by the app into a template's source
// (decisions, Q90). Each function takes a file's text and a place in it, and
// returns the new text, or throws with a reason the maker can read. Nothing
// here touches the disk.
import { locate, type Range, replaceTexts, sections, textRuns } from "@spaka/runtime";
import {
  type Format,
  type Frame,
  type Frames,
  frameClasses,
  frameOf,
  frameUtilities,
  readFrameClasses,
} from "../../shared/frame";
import { en } from "../../shared/strings/en";

export class EditRefused extends Error {}

/** A {% render %} or {% include %} of a shared part, starting at `at`. */
export function includeAt(src: string, at: number): { range: Range; name: string } | undefined {
  const m = /^\{%-?\s*(?:render|include)\s+(['"])([^'"]+)\1[^%]*-?%\}/.exec(src.slice(at));
  return m ? { range: { start: at, end: at + m[0].length }, name: m[2]! } : undefined;
}

/** What starts at `at`: an element, or an include, as a range the maker can act on. */
export function targetAt(src: string, at: number): { range: Range; include?: string } {
  const include = includeAt(src, at);
  if (include) return { range: include.range, include: include.name };
  const el = locate(src, at);
  if (!el) throw new EditRefused("This element has changed since it was shown.");
  if (el.inLoop) throw new EditRefused("This element is repeated for each item of a list: ask the agent.");
  if (!el.whole) throw new EditRefused("This element is made by the page's logic: ask the agent.");
  return { range: el.outer };
}

export function editText(src: string, at: number, texts: string[], tags?: string[]): string {
  const el = locate(src, at);
  if (!el) throw new EditRefused("This text has changed since it was shown.");
  if (el.notEditable === "liquid") throw new EditRefused("This text is computed: ask the agent.");
  if (el.notEditable) throw new EditRefused("This text cannot be edited in place: ask the agent.");
  const runs = textRuns(src, at);
  if (tags && runs && tags.join(",") !== runs.tags.join(","))
    throw new EditRefused("Only the text can be changed in place; ask the agent for the rest.");
  const out = replaceTexts(src, at, texts);
  if (out === undefined) throw new EditRefused("Only the text can be changed in place; ask the agent for the rest.");
  return out;
}

export function setLink(src: string, at: number, href: string): string {
  const el = locate(src, at);
  if (el?.name !== "a") throw new EditRefused("This is not a link.");
  const tag = src.slice(el.outer.start, src.indexOf(">", el.outer.start) + 1);
  const value = href.trim().replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  if (/\{[{%]/.test(href)) throw new EditRefused("A link cannot hold Liquid.");
  const attr = /(\shref\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/i.exec(tag);
  if (attr && /\{[{%]/.test(attr[2]!)) throw new EditRefused("This link is computed: ask the agent.");
  const next = attr
    ? `${tag.slice(0, attr.index)}${attr[1]}"${value}"${tag.slice(attr.index + attr[0].length)}`
    : `<a href="${value}"${tag.slice(2)}`;
  return src.slice(0, el.outer.start) + next + src.slice(el.outer.start + tag.length);
}

/** Sets an attribute of the tag starting at `at`, adding it after the tag's name when it has none. */
function setAttribute(tag: string, name: string, value: string): string {
  const escaped = value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const attr = new RegExp(`(\\s${name}\\s*=\\s*)("[^"]*"|'[^']*'|[^\\s>]+)`, "i").exec(tag);
  if (attr) return `${tag.slice(0, attr.index)}${attr[1]}"${escaped}"${tag.slice(attr.index + attr[0].length)}`;
  const nameEnd = /^<[\w-]+/.exec(tag)![0].length;
  return `${tag.slice(0, nameEnd)} ${name}="${escaped}"${tag.slice(nameEnd)}`;
}

/**
 * An image's address replaced in the template (Q159), and its alt text with
 * the new image's when it has one, so that it says what the image now shows.
 */
export function setImageSource(src: string, at: number, address: string, alt?: string): string {
  const el = locate(src, at);
  if (el?.name !== "img") throw new EditRefused("This is not an image.");
  const tag = src.slice(el.outer.start, src.indexOf(">", el.outer.start) + 1);
  if (/\{[{%]/.test(address)) throw new EditRefused("An address cannot hold Liquid.");
  const current = /\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.exec(tag)?.[1];
  if (current && /\{[{%]/.test(current)) throw new EditRefused(en.editor.notReplaceable);
  let next = setAttribute(tag, "src", address.trim());
  const currentAlt = /\salt\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.exec(tag)?.[1];
  if (alt?.trim() && !(currentAlt && /\{[{%]/.test(currentAlt))) next = setAttribute(next, "alt", alt.trim());
  return src.slice(0, el.outer.start) + next + src.slice(el.outer.start + tag.length);
}

const ATTRIBUTE = (name: string) => new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i");

/** An attribute's value as written in the tag, without its quotes; undefined when the tag has none. */
function attributeOf(tag: string, name: string): string | undefined {
  const value = ATTRIBUTE(name).exec(tag)?.[1];
  return value?.replace(/^(["'])([\s\S]*)\1$/, "$2");
}

function removeAttribute(tag: string, name: string): string {
  return tag.replace(ATTRIBUTE(name), "");
}

/** The <img> starting at `at`, written for this place alone: not repeated for each item of a list. */
function ownImage(src: string, at: number): { start: number; tag: string } {
  const el = locate(src, at);
  if (el?.name !== "img") throw new EditRefused("This is not an image.");
  if (el.inLoop) throw new EditRefused(en.editing.notFramed);
  return { start: el.outer.start, tag: src.slice(el.outer.start, src.indexOf(">", el.outer.start) + 1) };
}

/** An <img>'s classes as written, or undefined when Liquid writes some of them. */
function classesOf(tag: string): string | undefined {
  const written = attributeOf(tag, "class") ?? "";
  return /\{[{%]/.test(written) ? undefined : written;
}

/**
 * An image set in its frame for some screens (Q490): the frame's classes
 * among the <img>'s, in place of the ones an earlier frame left for those
 * screens; the other screens keep theirs, and the template's classes stay.
 * Without a frame they are only taken out, and the image is there as the
 * template's classes have it.
 */
export function setImageFrame(src: string, at: number, frame: Frame | null, formats: Format[]): string {
  const { start, tag } = ownImage(src, at);
  const classes = classesOf(tag);
  if (classes === undefined) throw new EditRefused(en.editing.notFramed);
  const { utilities, rest } = readFrameClasses(classes);
  for (const format of formats) {
    if (frame) utilities[format] = frameUtilities(frame);
    else delete utilities[format];
  }
  const all = [...rest, ...frameClasses(utilities)];
  const next = all.length ? setAttribute(tag, "class", all.join(" ")) : removeAttribute(tag, "class");
  return src.slice(0, start) + next + src.slice(start + tag.length);
}

/**
 * The frame each screen has for an image (Q490); undefined when it cannot be
 * given one: repeated for each item of a list, or with computed classes.
 */
export function imageFrames(src: string, at: number): Frames | undefined {
  const el = locate(src, at);
  if (el?.name !== "img" || el.inLoop) return undefined;
  const classes = classesOf(src.slice(at, src.indexOf(">", at) + 1));
  if (classes === undefined) return undefined;
  const { utilities } = readFrameClasses(classes);
  return Object.fromEntries(Object.entries(utilities).map(([format, own]) => [format, frameOf(own)]));
}

/** Removes a range, with the whitespace that only served to put it on its own line. */
export function removeRange(src: string, range: Range): string {
  const { start, end } = lineSpan(src, range);
  return src.slice(0, start) + src.slice(end);
}

/** Copies a range just after itself, on a new line with the same indentation if it was on its own line. */
export function duplicateRange(src: string, range: Range, copy = src.slice(range.start, range.end)): string {
  if (lineSpan(src, range).ownLine) {
    const indent = indentOf(src, range.start);
    return `${src.slice(0, range.end)}\n${indent}${copy}${src.slice(range.end)}`;
  }
  return src.slice(0, range.end) + copy + src.slice(range.end);
}

/** Moves section `from` of a page to just before section `to` (or after the last one when `to` is their count). */
export function moveSection(src: string, from: number, to: number): string {
  const list = sections(src);
  if (!list[from] || to < 0 || to > list.length) throw new EditRefused("This section has moved since it was shown.");
  if (to === from || to === from + 1) return src;
  const moving = list[from]!;
  const text = src.slice(moving.outer.start, moving.outer.end);
  const without = removeRange(src, moving.outer);
  const after = sections(without);
  const target = to > from ? to - 1 : to;
  return insertSection(without, after, target, text);
}

/** Inserts a piece of template as a section, before section `before` (or after the last one). */
export function insertBefore(src: string, before: number, text: string): string {
  return insertSection(src, sections(src), before, text);
}

function insertSection(src: string, list: ReturnType<typeof sections>, index: number, text: string): string {
  const anchor = list[index] ?? list[list.length - 1];
  if (!anchor) {
    // No section yet: before </main> or </body>, else at the end.
    const close = /<\/(main|body)\s*>/i.exec(src);
    const at = close ? close.index : src.length;
    return `${src.slice(0, at)}${text}\n${src.slice(at)}`;
  }
  const own = lineSpan(src, anchor.outer).ownLine;
  const indent = indentOf(src, anchor.outer.start);
  if (list[index]) {
    return own
      ? `${src.slice(0, anchor.outer.start)}${text}\n${indent}${src.slice(anchor.outer.start)}`
      : `${src.slice(0, anchor.outer.start)}${text}${src.slice(anchor.outer.start)}`;
  }
  return own
    ? `${src.slice(0, anchor.outer.end)}\n${indent}${text}${src.slice(anchor.outer.end)}`
    : `${src.slice(0, anchor.outer.end)}${text}${src.slice(anchor.outer.end)}`;
}

/**
 * Where a block of a kind goes when the maker adds it without saying where: a
 * header first, a footer last, anything else before the page's footer, if it
 * ends with one. A section index, as insertBefore takes.
 */
export function placeFor(src: string, kind: string): number {
  const list = sections(src);
  if (kind === "banner") return 0;
  if (kind === "header") {
    // Below a banner the page opens with.
    const first = list[0];
    return first && first.kind !== "element" && /^banner/.test(first.name) ? 1 : 0;
  }
  const last = list.at(-1);
  const isFooter = last && (last.kind === "element" ? last.name === "footer" : /footer/.test(last.name));
  return kind !== "footer" && isFooter ? list.length - 1 : list.length;
}

/** A free name for a copy of a shared part: hero → hero-2, hero-2 → hero-3. */
export function copyName(name: string, taken: (name: string) => boolean): string {
  const base = name.replace(/-\d+$/, "");
  for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
}

/** The include of `name` renamed to `to`, its arguments kept. */
export function renameInclude(tag: string, to: string): string {
  return tag.replace(/^(\{%-?\s*(?:render|include)\s+)(['"])[^'"]+\2/, `$1$2${to}$2`);
}

/** How many pages include a shared part, directly or through another part. */
export function pagesUsing(name: string, files: Record<string, string>): number {
  const includes = (src: string) =>
    [...src.matchAll(/\{%-?\s*(?:render|include)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
  const partsUsing = new Set([name]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [path, src] of Object.entries(files)) {
      const part = /^parts\/(.+)\.liquid$/.exec(path)?.[1];
      if (part && !partsUsing.has(part) && includes(src).some((n) => partsUsing.has(n))) {
        partsUsing.add(part);
        grew = true;
      }
    }
  }
  return Object.entries(files).filter(
    ([path, src]) => path.startsWith("pages/") && includes(src).some((n) => partsUsing.has(n)),
  ).length;
}

function indentOf(src: string, at: number): string {
  let start = at;
  while (start > 0 && (src[start - 1] === " " || src[start - 1] === "\t")) start--;
  return src.slice(start, at);
}

/** A range widened to its whole line when nothing else is on that line. */
function lineSpan(src: string, range: Range): Range & { ownLine: boolean } {
  let start = range.start;
  while (start > 0 && (src[start - 1] === " " || src[start - 1] === "\t")) start--;
  let end = range.end;
  while (end < src.length && (src[end] === " " || src[end] === "\t")) end++;
  const ownLine =
    (start === 0 || src[start - 1] === "\n") && (end === src.length || src[end] === "\n" || src[end] === "\r");
  if (!ownLine) return { ...range, ownLine };
  if (src[end] === "\r") end++;
  if (src[end] === "\n") end++;
  else if (start > 0) start--; // the last line: take the line break before it
  return { start, end, ownLine };
}
