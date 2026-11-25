// Finding, in a template's source, what a previewed element came from, so the
// app can write the maker's own edits (decisions, Q90): the element's extent,
// its texts, and the sections of a page. Everything here reads the source as
// it is on disk; the offsets are those injectTrace() puts in data-spaka-src.

import { scan, type Token } from "./template.ts";

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
/** Elements a text edited in place may contain: its formatting is kept as written. */
export const INLINE = new Set([
  "a",
  "abbr",
  "b",
  "br",
  "code",
  "em",
  "i",
  "mark",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
]);
const LIQUID_BLOCKS = new Set(["if", "unless", "case", "for", "tablerow", "capture", "raw", "comment", "block"]);

export type Range = { start: number; end: number };

export type Located = {
  name: string;
  /** From the start tag's "<" to just after the end tag (or the start tag, for a void element). */
  outer: Range;
  /** Between the start tag and the end tag; undefined for a void element. */
  inner?: Range;
  /** Inside a {% for %} of this file: shown once per item, so not duplicated or deleted by hand. */
  inLoop: boolean;
  /**
   * Whether its Liquid is balanced within the element, so the element can be
   * moved, copied or removed as a whole.
   */
  whole: boolean;
  /** Why its text cannot be edited in place, if it cannot. */
  notEditable?: "liquid" | "markup" | "empty";
};

export type Section = {
  kind: "element" | "include";
  /** The element's name, or the shared part's name. */
  name: string;
  outer: Range;
};

/** The element whose start tag begins at `offset`, or undefined if there is none there. */
export function locate(src: string, offset: number): Located | undefined {
  const { tokens } = scan(src);
  const index = tokens.findIndex((t) => t.type === "htmlOpen" && t.start === offset);
  if (index < 0) return undefined;
  const open = tokens[index] as Extract<Token, { type: "htmlOpen" }>;
  const inLoop = loopDepth(tokens, index) > 0;
  if (VOID.has(open.name) || open.selfClosing)
    return { name: open.name, outer: { start: open.start, end: open.end }, inLoop, whole: true, notEditable: "markup" };
  const close = matchingClose(tokens, index);
  if (close < 0)
    return {
      name: open.name,
      outer: { start: open.start, end: open.end },
      inLoop,
      whole: false,
      notEditable: "markup",
    };
  const end = tokens[close]!;
  const inside = tokens.slice(index + 1, close);
  return {
    name: open.name,
    outer: { start: open.start, end: end.end },
    inner: { start: open.end, end: end.start },
    inLoop,
    whole: liquidBalanced(inside),
    notEditable: whyNotEditable(src, inside),
  };
}

/**
 * The texts of an element, in order, between its tags: `A<b>B</b>C` has the
 * tags ["b", "/b"] and three texts. An edit in place keeps the tags and
 * replaces the texts, so whatever the element's formatting carries (classes,
 * links) stays as written.
 */
export function textRuns(src: string, offset: number): { tags: string[]; texts: Range[] } | undefined {
  const located = locate(src, offset);
  if (!located?.inner || located.notEditable) return undefined;
  const { tokens } = scan(src);
  const tags: string[] = [];
  const texts: Range[] = [];
  let from = located.inner.start;
  for (const t of tokens) {
    if (t.start < located.inner.start || t.end > located.inner.end || t.type === "text") continue;
    if (t.type === "htmlOpen") tags.push(t.name);
    else if (t.type === "htmlClose") tags.push(`/${t.name}`);
    else continue;
    texts.push({ start: from, end: t.start });
    from = t.end;
  }
  texts.push({ start: from, end: located.inner.end });
  return { tags, texts };
}

/**
 * Writes new texts into an element, keeping its tags. A text that reads the
 * same as before (entities decoded) is left as written. Returns undefined if
 * the element cannot take them.
 */
export function replaceTexts(src: string, offset: number, texts: string[]): string | undefined {
  const runs = textRuns(src, offset);
  if (!runs || runs.texts.length !== texts.length) return undefined;
  let out = "";
  let last = 0;
  runs.texts.forEach((range, i) => {
    const before = src.slice(range.start, range.end);
    const wanted = texts[i]!;
    out += src.slice(last, range.start) + (decodeText(before) === wanted ? before : encodeText(wanted, before));
    last = range.end;
  });
  return out + src.slice(last);
}

/** The sections of a page: the children of its <main>, or of its <body>, or of the file itself. */
export function sections(src: string): Section[] {
  const { tokens } = scan(src);
  const containers = ["main", "body"];
  let from = 0;
  let to = tokens.length;
  for (const name of containers) {
    const i = tokens.findIndex((t) => t.type === "htmlOpen" && t.name === name);
    if (i < 0) continue;
    const close = matchingClose(tokens, i);
    from = i + 1;
    to = close < 0 ? tokens.length : close;
    break;
  }
  const out: Section[] = [];
  for (let i = from; i < to; i++) {
    const t = tokens[i]!;
    if (t.type === "liquidTag" && (t.name === "render" || t.name === "include")) {
      const name = /^['"]([^'"]+)['"]/.exec(t.args)?.[1] ?? "";
      out.push({ kind: "include", name, outer: { start: t.start, end: t.end } });
    } else if (t.type === "htmlOpen") {
      if (VOID.has(t.name) || t.selfClosing) {
        out.push({ kind: "element", name: t.name, outer: { start: t.start, end: t.end } });
        continue;
      }
      const close = matchingClose(tokens, i);
      if (close < 0 || close > to) break;
      out.push({ kind: "element", name: t.name, outer: { start: t.start, end: tokens[close]!.end } });
      i = close;
    } else if (t.type === "liquidTag" && LIQUID_BLOCKS.has(t.name)) {
      // A section shown under a condition or in a loop is the agent's to move: skip the block whole.
      const end = matchingLiquidEnd(tokens, i);
      if (end < 0) break;
      i = end;
    }
  }
  return out;
}

/** Decodes the few entities a text written by hand or by the agent carries. */
export function decodeText(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k[0] === "#") return String.fromCodePoint(k[1] === "x" ? Number.parseInt(k.slice(2), 16) : Number(k.slice(1)));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[k] ?? m;
  });
}

/** A text for the source: what HTML or Liquid would read otherwise is escaped. */
export function encodeText(text: string, previous = ""): string {
  if (!previous.trim() && !text.trim()) return previous.includes("\n") ? previous : text.replace(/\u00a0/g, " ");
  // Line breaks and indentation written around the text stay as written.
  const blank = !previous.trim();
  const lead = /^\s*/.exec(previous)![0];
  const trail = blank ? "" : /\s*$/.exec(previous)![0];
  let body = text;
  if (lead.includes("\n")) body = body.replace(/^\s+/, "");
  if (trail.includes("\n")) body = body.replace(/\s+$/, "");
  body = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{(?=[{%])/g, "&#123;")
    // The browser types a non-breaking space where a plain one would vanish:
    // a lone one is written as a space, one beside another space is kept.
    .replace(/\u00a0/g, (_m, at: number, all: string) =>
      /\s/.test(all[at - 1] ?? "") || /\s/.test(all[at + 1] ?? "") ? "&nbsp;" : " ",
    );
  return (lead.includes("\n") ? lead : "") + body + (trail.includes("\n") ? trail : "");
}

function whyNotEditable(src: string, inside: Token[]): Located["notEditable"] {
  let text = "";
  for (const t of inside) {
    if (t.type === "liquidTag" || t.type === "liquidOutput") return "liquid";
    if (t.type === "htmlComment" || t.type === "rawText") return "markup";
    if ((t.type === "htmlOpen" || t.type === "htmlClose") && !INLINE.has(t.name)) return "markup";
    if (t.type === "text") text += src.slice(t.start, t.end);
  }
  return text.trim() ? undefined : "empty";
}

function matchingClose(tokens: Token[], index: number): number {
  const name = (tokens[index] as { name: string }).name;
  let depth = 0;
  for (let i = index + 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type === "htmlOpen" && t.name === name && !t.selfClosing) depth++;
    else if (t.type === "htmlClose" && t.name === name) {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

function matchingLiquidEnd(tokens: Token[], index: number): number {
  const name = (tokens[index] as { name: string }).name;
  let depth = 0;
  for (let i = index + 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type !== "liquidTag") continue;
    if (t.name === name) depth++;
    else if (t.name === `end${name}`) {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

function loopDepth(tokens: Token[], index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i++) {
    const t = tokens[i]!;
    if (t.type !== "liquidTag") continue;
    if (t.name === "for" || t.name === "tablerow") depth++;
    else if ((t.name === "endfor" || t.name === "endtablerow") && depth > 0) depth--;
  }
  return depth;
}

function liquidBalanced(inside: Token[]): boolean {
  const stack: string[] = [];
  for (const t of inside) {
    if (t.type !== "liquidTag") continue;
    if (LIQUID_BLOCKS.has(t.name)) stack.push(t.name);
    else if (t.name.startsWith("end") && LIQUID_BLOCKS.has(t.name.slice(3))) {
      if (stack.pop() !== t.name.slice(3)) return false;
    }
  }
  return stack.length === 0;
}

/** The record field an element shows (Q148, Q159): which, and from which datasource when the template says. */
/**
 * A record's field an element shows: `field` of the record `variable` stands
 * for. Inside a loop over a record's list of links (`{% for link in
 * item.links %}`), `field` is that list and `sub` the link's own value it
 * shows (`label`); which link it is comes from the element's trace. Inside a
 * loop over a list of images (`{% for photo in record.photos %}`), `item` says
 * the element shows the list's item itself, an image's address (Q355).
 */
export type RecordField = { field: string; variable: string; datasource?: string; sub?: string; item?: true };

/** The datasource a loop goes over: `data.team`, `data["home-faq"]`. */
export function loopDatasource(iterable: string): string | undefined {
  const m = /^data\.([a-z0-9][\w-]*)$|^data\[\s*["']([a-z0-9][\w-]*)["']\s*\]$/i.exec(iterable);
  return m ? (m[1] ?? m[2]) : undefined;
}

const LONE_OUTPUT = /^\{\{-?\s*([a-z_]\w*)(?:\.([a-z_]\w*))?\s*-?\}\}$/i;

/**
 * Whether the element at `offset` shows a record's field and nothing else, in
 * its text or in an attribute: `<h2>{{ post.title }}</h2>`, `<img src="{{ post.cover }}">`,
 * where `post` is the item of a loop over `data.posts` or the record of a
 * record page. A filter, or anything beside the output, makes it the agent's.
 */
export function recordFieldAt(src: string, offset: number, attribute?: string): RecordField | undefined {
  const { tokens } = scan(src);
  const index = tokens.findIndex((t) => t.type === "htmlOpen" && t.start === offset);
  if (index < 0) return undefined;
  const open = tokens[index] as Extract<Token, { type: "htmlOpen" }>;
  let output: string | undefined;
  if (attribute) {
    const tag = src.slice(open.start, open.end);
    const m = new RegExp(`\\s${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
    output = (m?.[2] ?? m?.[3])?.trim();
  } else {
    const located = locate(src, offset);
    if (!located?.inner) return undefined;
    const inside = tokens.filter((t) => t.start >= located.inner!.start && t.end <= located.inner!.end);
    const meaningful = inside.filter((t) => !(t.type === "text" && !src.slice(t.start, t.end).trim()));
    if (meaningful.length !== 1 || meaningful[0]!.type !== "liquidOutput") return undefined;
    output = src.slice(meaningful[0]!.start, meaningful[0]!.end);
  }
  const m = output ? LONE_OUTPUT.exec(output) : null;
  if (!m) return undefined;
  const [, variable, field] = m as unknown as [string, string, string | undefined];
  // The loops around the element, innermost last.
  type Loop = { variable: string; datasource?: string; list?: { of: string; field: string } };
  const loops: Loop[] = [];
  for (let i = 0; i < index; i++) {
    const t = tokens[i]!;
    if (t.type !== "liquidTag") continue;
    if (t.name === "for") {
      const loop = /^(\w+)\s+in\s+(\S+)/.exec(t.args);
      const iterable = loop?.[2] ?? "";
      const list = /^([a-z_]\w*)\.([a-z_]\w*)$/i.exec(iterable);
      loops.push({
        variable: loop?.[1] ?? "",
        datasource: loopDatasource(iterable),
        ...(list && list[1] !== "data" ? { list: { of: list[1]!, field: list[2]! } } : {}),
      });
    } else if (t.name === "endfor") loops.pop();
  }
  // The trace names the record of the innermost loop, or the page's record outside any.
  const innermost = loops.at(-1);
  // A link of a record's list of links: the record is the loop's around it, or the page's.
  // An image of a record's list of images, the same way, showing the item itself.
  if (innermost?.list && innermost.variable === variable) {
    const parent = loops.at(-2);
    const { of, field: list } = innermost.list;
    const shows = field ? { sub: field } : { item: true as const };
    if (parent)
      return parent.variable === of && parent.datasource
        ? { field: list, variable: of, datasource: parent.datasource, ...shows }
        : undefined;
    return of === "record" ? { field: list, variable: of, ...shows } : undefined;
  }
  if (!field) return undefined;
  if (innermost)
    return innermost.variable === variable && innermost.datasource
      ? { field, variable, datasource: innermost.datasource }
      : undefined;
  return variable === "record" ? { field, variable } : undefined;
}
