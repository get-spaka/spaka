// The maker's own edits, written by the app into a template's source
// (decisions, Q90). Each function takes a file's text and a place in it, and
// returns the new text, or throws with a reason the maker can read. Nothing
// here touches the disk.
import { locate, type Range, replaceTexts, sections, textRuns } from "@upstart/runtime";

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
