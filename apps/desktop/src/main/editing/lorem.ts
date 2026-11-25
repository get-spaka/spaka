// A gallery block put into a site shows lorem ipsum in place of its example
// texts (Q223, Q224): the Blocks tab keeps the gallery's examples, but a
// section placed by the agent or the maker no longer shows another
// business's words, which looked like a mistake while the agent wrote. Each
// word becomes a lorem word of about its length, so the layout holds; numbers,
// dates and times, addresses for the web, a form's texts and the site's
// navigation stay as they are. Pure: the block in, the block out.
import { readRecordFile, setRecordValue } from "@spaka/runtime";
import type { DroppedBlock } from "./data-drop";

const WORDS =
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nunc vitae mauris praesent viverra semper augue a eu nam".split(
    " ",
  );

/** Words that say when, kept as they are: a week's days and the year's months. */
const WHEN = new Set(
  "monday tuesday wednesday thursday friday saturday sunday mon tue tues wed thu thur thurs fri sat sun january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec am pm".split(
    " ",
  ),
);

/** Lorem words, each about the length of the word it replaces, in a fixed order. */
class Lorem {
  private at = 0;
  word(like: string): string {
    const n = like.length;
    for (let tries = 0; tries < WORDS.length; tries++) {
      const w = WORDS[(this.at + tries) % WORDS.length]!;
      if (Math.abs(w.length - n) <= Math.max(1, Math.round(n / 4))) {
        this.at = (this.at + tries + 1) % WORDS.length;
        return shaped(w, like);
      }
    }
    const w = WORDS[this.at]!;
    this.at = (this.at + 1) % WORDS.length;
    return shaped(w, like);
  }

  /**
   * A text's words, made lorem ipsum. What says how much or when stays: a
   * word with a number, a day or a month, and the little word joining it to
   * the next ("9 am to 8 pm", "Monday to Friday"); so do addresses for the web.
   */
  text(text: string): string {
    let joined = false;
    return text
      .split(/(\s+)/)
      .map((token) => {
        if (/^\s*$/.test(token)) return token;
        const bare = token.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, "").toLowerCase();
        const keep =
          /\d/.test(token) ||
          /[@/]|:\/\/|\w\.\w|^&[#\w]+;$/.test(token) ||
          WHEN.has(bare) ||
          (joined && JOINS.has(bare));
        joined = /\d/.test(token) || WHEN.has(bare);
        return keep
          ? token
          : token.replace(/&[#\w]+;|\p{L}[\p{L}'’]*/gu, (w) => (w.startsWith("&") ? w : this.word(w)));
      })
      .join("");
  }
}

const JOINS = new Set(["to", "and", "or", "until", "from", "at", "-", "–", "—"]);

function shaped(word: string, like: string): string {
  if (like.length > 1 && like === like.toUpperCase()) return word.toUpperCase();
  if (like[0] === like[0]!.toUpperCase() && like[0] !== like[0]!.toLowerCase())
    return word[0]!.toUpperCase() + word.slice(1);
  return word;
}

const TOKEN =
  /(\{%-?\s*(?:raw|comment)\s*-?%\}[\s\S]*?\{%-?\s*end(?:raw|comment)\s*-?%\}|\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}|<!--[\s\S]*?-->|<(?:[^>{]|\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{)*>)/;
/** Elements whose text stays: code and drawings, and a form's labels, choices and button (Q224). */
const KEPT = /^(script|style|svg|code|pre|form|textarea|select)$/i;

/** A template's texts, between its tags and its Liquid, made lorem ipsum. */
export function loremTemplate(source: string, lorem = new Lorem()): string {
  const kept: string[] = [];
  return source
    .split(TOKEN)
    .map((piece, i) => {
      if (i % 2 === 1) {
        const tag = /^<(\/?)([a-zA-Z][\w-]*)/.exec(piece);
        if (tag && KEPT.test(tag[2]!) && !piece.endsWith("/>")) {
          if (tag[1]) {
            const at = kept.lastIndexOf(tag[2]!.toLowerCase());
            if (at >= 0) kept.length = at;
          } else kept.push(tag[2]!.toLowerCase());
        }
        return piece;
      }
      return kept.length ? piece : lorem.text(piece);
    })
    .join("");
}

/** A Markdown text made lorem ipsum, its links' addresses and its marks kept. */
function loremMarkdown(text: string, lorem: Lorem): string {
  return text
    .split(/(\]\([^)]*\)|`[^`]*`)/)
    .map((piece, i) => (i % 2 === 1 ? piece : lorem.text(piece)))
    .join("");
}

type Field = { name: string; kind: string };

function fieldsOf(definition: string): { fields: Field[]; body?: string } {
  const fields: Field[] = [];
  const list = /^fields:\s*\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m.exec(definition)?.[1] ?? "";
  for (const item of list.split(/^\s*-\s+/m).slice(1)) {
    const name = /^(?:name:\s*)?([\w-]+)/.exec(item.replace(/^name:\s*/, ""))?.[1];
    const kind = /\bkind:\s*([\w-]+)/.exec(item)?.[1];
    if (name && kind) fields.push({ name, kind });
  }
  return { fields, body: /^body:\s*([\w-]+)/m.exec(definition)?.[1] };
}

/** A sample record's texts made lorem ipsum: its text, Markdown and list fields. */
export function loremRecord(text: string, definition: string, lorem = new Lorem()): string {
  const { fields, body } = fieldsOf(definition);
  const read = readRecordFile(text);
  if (read.error) return text;
  let out = text;
  for (const { name, kind } of fields) {
    const value = read.values[name];
    if (name === body) continue;
    if ((kind === "text" || kind === "markdown") && typeof value === "string" && value)
      out = setRecordValue(out, name, lorem.text(value), false);
    else if (kind === "list" && Array.isArray(value))
      out = setRecordValue(
        out,
        name,
        value.map((v) => (typeof v === "string" ? lorem.text(v) : v)),
        false,
      );
  }
  if (body && read.body.trim()) out = setRecordValue(out, body, loremMarkdown(read.body, lorem), true);
  return out;
}

/** A gallery block as it is put into a site: its texts and sample records lorem ipsum (Q223). */
export function loremBlock(block: DroppedBlock): DroppedBlock {
  const lorem = new Lorem();
  const out: DroppedBlock = { ...block, source: loremTemplate(block.source, lorem) };
  if (block.detail) out.detail = loremTemplate(block.detail, lorem);
  // The site's navigation is its own pages' links, never samples to replace.
  if (block.datasource && block.data?.name !== "navigation") {
    const records: Record<string, string> = {};
    for (const [file, text] of Object.entries(block.datasource.records))
      records[file] = loremRecord(text, block.datasource.definition, lorem);
    out.datasource = { ...block.datasource, records };
  }
  return out;
}
