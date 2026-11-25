// Scanning, repairing and tracing a Liquid + HTML template that may still be
// in the middle of being written (ADR 0009).
//
// repairTemplate(): cut the unfinished tail (half a Liquid tag, half an HTML
//   tag, an unfinished <script>/<style>), then close what is still open, so
//   that LiquidJS can parse it and the browser gets a well-formed tree.
// injectTrace(): add data-spaka-src="file:line:offset" to every HTML start tag,
//   data-spaka-rec="{{ item.__ref }}" inside loops, and HTML comments around each
//   shared part a page includes, before Liquid renders, so any previewed
//   element can be traced back to its page, shared part or record, and to the
//   exact place the app writes to when the maker edits it.

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
// Elements whose content is not HTML. Liquid inside them is left alone: a finished
// block is complete anyway, and an unfinished one is dropped whole.
const RAWTEXT = new Set(["script", "style"]);
const LIQUID_BLOCKS = new Set(["if", "unless", "case", "for", "tablerow", "capture", "raw", "comment", "block"]);
// Start tags that get no trace attribute: nothing the maker can point at.
const UNTRACED = new Set(["html", "head", "meta", "title", "link", "script", "style", "base", "body", "template"]);

export type Token =
  | { type: "text"; start: number; end: number }
  | { type: "liquidTag"; start: number; end: number; name: string; args: string }
  | { type: "liquidOutput"; start: number; end: number }
  | { type: "htmlComment"; start: number; end: number }
  | { type: "htmlOpen"; start: number; end: number; name: string; nameEnd: number; selfClosing: boolean }
  | { type: "htmlClose"; start: number; end: number; name: string }
  | { type: "rawText"; start: number; end: number; name: string };

export type Scan = {
  tokens: Token[];
  /** Offset where the source stops being complete (== src.length when nothing is cut). */
  cutAt: number;
  /** Why the tail was cut, if it was. */
  cutReason?: string;
};

/** Find the end of an HTML start tag, skipping quoted values and embedded Liquid. Returns -1 if unfinished. */
function endOfStartTag(src: string, from: number): number {
  let i = from;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    if (c === "{" && (src[i + 1] === "{" || src[i + 1] === "%")) {
      const close = src[i + 1] === "{" ? "}}" : "%}";
      const j = src.indexOf(close, i + 2);
      if (j < 0) return -1;
      i = j + 2;
      continue;
    }
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
    else if (c === "<") return -1; // a new tag starts inside an unquoted tag: treat as unfinished
    i++;
  }
  return -1;
}

export function scan(src: string): Scan {
  const tokens: Token[] = [];
  let i = 0;
  let textStart = 0;
  const n = src.length;
  const flushText = (end: number) => {
    if (end > textStart) tokens.push({ type: "text", start: textStart, end });
  };
  const cut = (at: number, reason: string): Scan => {
    flushText(at);
    return { tokens, cutAt: at, cutReason: reason };
  };

  while (i < n) {
    const c = src[i];
    if (c === "{") {
      const d = src[i + 1];
      if (d === undefined) return cut(i, "lone { at the end");
      if (d === "%") {
        const close = src.indexOf("%}", i + 2);
        if (close < 0) return cut(i, "unfinished {% tag");
        const inner = src
          .slice(i + 2, close)
          .replace(/^-/, "")
          .replace(/-$/, "")
          .trim();
        const name = (inner.match(/^[\w-]+/) ?? [""])[0];
        const args = inner.slice(name.length).trim();
        flushText(i);
        if (name === "raw" || name === "comment") {
          const endRe = new RegExp(`\\{%-?\\s*end${name}\\s*-?%\\}`, "g");
          endRe.lastIndex = close + 2;
          const m = endRe.exec(src);
          if (!m) {
            // An unfinished comment shows nothing: drop it whole.
            if (name === "comment") return { tokens, cutAt: i, cutReason: "unfinished comment block" };
            // An unfinished raw block: keep its text, minus a half-written closer; the repair step closes it.
            let end = n;
            const lastOpen = src.lastIndexOf("{%", n);
            if (lastOpen >= close + 2) end = lastOpen;
            else if (src.endsWith("{")) end = n - 1;
            tokens.push({ type: "liquidTag", start: i, end: close + 2, name, args });
            if (end > close + 2) tokens.push({ type: "text", start: close + 2, end });
            return { tokens, cutAt: end, cutReason: end < n ? "unfinished endraw" : undefined };
          }
          tokens.push({ type: "liquidTag", start: i, end: close + 2, name, args });
          if (m.index > close + 2) tokens.push({ type: "text", start: close + 2, end: m.index });
          tokens.push({ type: "liquidTag", start: m.index, end: m.index + m[0].length, name: `end${name}`, args: "" });
          i = textStart = m.index + m[0].length;
          continue;
        }
        tokens.push({ type: "liquidTag", start: i, end: close + 2, name, args });
        i = textStart = close + 2;
        continue;
      }
      if (d === "{") {
        const close = src.indexOf("}}", i + 2);
        if (close < 0) return cut(i, "unfinished {{ output");
        flushText(i);
        tokens.push({ type: "liquidOutput", start: i, end: close + 2 });
        i = textStart = close + 2;
        continue;
      }
      i++;
      continue;
    }
    if (c === "<") {
      const rest = src.slice(i + 1, i + 12);
      if (rest === "") return cut(i, "lone < at the end");
      if (src.startsWith("<!--", i)) {
        const close = src.indexOf("-->", i + 4);
        if (close < 0) return cut(i, "unfinished comment");
        flushText(i);
        tokens.push({ type: "htmlComment", start: i, end: close + 3 });
        i = textStart = close + 3;
        continue;
      }
      if ("<!--".startsWith(src.slice(i))) return cut(i, "unfinished comment opener");
      if (src[i + 1] === "!") {
        // <!doctype ...>
        const close = src.indexOf(">", i);
        if (close < 0) return cut(i, "unfinished doctype");
        i = close + 1;
        continue; // stays part of the surrounding text
      }
      if (src[i + 1] === "/") {
        const m = /^<\/([a-zA-Z][\w:-]*)\s*>/.exec(src.slice(i, i + 80));
        if (!m) {
          if (src.indexOf(">", i) < 0) return cut(i, "unfinished end tag");
          i++;
          continue;
        }
        flushText(i);
        tokens.push({ type: "htmlClose", start: i, end: i + m[0].length, name: m[1]!.toLowerCase() });
        i = textStart = i + m[0].length;
        continue;
      }
      const m = /^<([a-zA-Z][\w:-]*)/.exec(src.slice(i, i + 80));
      if (!m) {
        i++;
        continue; // a literal "<" in text
      }
      const tagStart = i;
      const nameEnd = i + m[0].length;
      const close = endOfStartTag(src, nameEnd);
      if (close < 0) return cut(i, `unfinished <${m[1]} start tag`);
      const name = m[1]!.toLowerCase();
      const selfClosing = src[close - 1] === "/";
      flushText(i);
      tokens.push({ type: "htmlOpen", start: i, end: close + 1, name, nameEnd, selfClosing });
      i = textStart = close + 1;
      if (RAWTEXT.has(name) && !selfClosing) {
        const endRe = new RegExp(`</${name}\\s*>`, "gi");
        endRe.lastIndex = i;
        const e = endRe.exec(src);
        if (!e) {
          // Never run half a script or apply half a stylesheet: drop the block.
          tokens.pop();
          return { tokens, cutAt: tagStart, cutReason: `unfinished <${name}> block` };
        }
        if (e.index > i) tokens.push({ type: "rawText", start: i, end: e.index, name });
        tokens.push({ type: "htmlClose", start: e.index, end: e.index + e[0].length, name });
        i = textStart = e.index + e[0].length;
      }
      continue;
    }
    if (c === "&") {
      // A half-written entity at the very end would show as "&am": hold it back.
      const m = /^&#?\w*$/.exec(src.slice(i));
      if (m) return cut(i, "unfinished entity");
    }
    i++;
  }
  flushText(n);
  return { tokens, cutAt: n };
}

type Open = { kind: "html"; name: string } | { kind: "liquid"; name: string };

export type Repair = {
  /** A complete template: the source up to the cut, plus the closers. */
  src: string;
  cutAt: number;
  cutReason?: string;
  /** What had to be closed, innermost first, e.g. ["</h2>", "{% endfor %}", "</ul>"]. */
  closers: string[];
};

export function repairTemplate(src: string): Repair {
  const { tokens, cutAt, cutReason } = scan(src);
  const stack: Open[] = [];
  for (const t of tokens) {
    if (t.type === "liquidTag") {
      if (LIQUID_BLOCKS.has(t.name)) stack.push({ kind: "liquid", name: t.name });
      else if (t.name.startsWith("end")) {
        const name = t.name.slice(3);
        for (let k = stack.length - 1; k >= 0; k--) {
          const o = stack[k]!;
          if (o.kind === "liquid" && o.name === name) {
            stack.length = k; // also drops HTML left open inside the block
            break;
          }
        }
      }
    } else if (t.type === "htmlOpen") {
      if (!VOID.has(t.name) && !t.selfClosing && !RAWTEXT.has(t.name)) stack.push({ kind: "html", name: t.name });
    } else if (t.type === "htmlClose") {
      if (RAWTEXT.has(t.name)) continue;
      // Close only within the current Liquid block: a branch may legitimately leave tags to a sibling branch.
      for (let k = stack.length - 1; k >= 0; k--) {
        const o = stack[k]!;
        if (o.kind === "liquid") break;
        if (o.name === t.name) {
          stack.length = k;
          break;
        }
      }
    }
  }
  const closers: string[] = [];
  for (let k = stack.length - 1; k >= 0; k--) {
    const o = stack[k]!;
    closers.push(o.kind === "html" ? `</${o.name}>` : `{% end${o.name} %}`);
  }
  return { src: src.slice(0, cutAt) + closers.join(""), cutAt, cutReason, closers };
}

/**
 * The Liquid that gives a loop's item its index in the whole list: `offset: 1`
 * starts one further, `reversed` counts from the end. Undefined when the
 * offset is not a number written in the template.
 */
function placeIn(args: string): string | undefined {
  const offset = /\boffset\s*:\s*([^\s,]+)/.exec(args)?.[1];
  if (offset !== undefined && !/^\d+$/.test(offset)) return undefined;
  const index = /\sreversed\b/.test(args) ? "forloop.rindex0" : "forloop.index0";
  return offset && offset !== "0" ? `${index} | plus: ${offset}` : index;
}

/**
 * Add the trace attributes. `src` must be complete (run repairTemplate first).
 * Line numbers refer to the file as written, since the repair only cuts the tail.
 */
export function injectTrace(src: string, file: string): string {
  const { tokens } = scan(src);
  const inserts: { at: number; text: string }[] = [];
  // A loop's item, and for a loop over a record's own list (`item.links`), the record it belongs to.
  // `place` is the Liquid giving the item's index in the list, when it can be known.
  const loops: { name: string; item: string | null; of?: string; place?: string }[] = [];
  // Outside a loop, an element of a shared part belongs to the record its caller was looping over
  // (handed down as __rec), and an element of a fragment to the record it was rendered for.
  // So does an element of a record's page, named after its datasource in brackets (Q147).
  const outer = file.startsWith("parts/")
    ? "__rec"
    : file.startsWith("fragments/") || (file.startsWith("pages/") && /\[[\w-]+\]/.test(file))
      ? "record.__ref"
      : null;
  let line = 1;
  let pos = 0;
  // Inside <title> or <textarea> a comment would show as text: no include markers there.
  let inText: string | null = null;
  const lineAt = (offset: number) => {
    for (; pos < offset; pos++) if (src.charCodeAt(pos) === 10) line++;
    return line;
  };
  // The record an element belongs to, as an expression: the innermost loop's item that is a record.
  const record = () => {
    const loop = [...loops].reverse().find((l) => l.item && !l.of);
    return loop ? `${loop.item}.__ref` : outer;
  };
  // Inside a loop over a record's list, the trace also says which item: "team/anna#2" (Q212).
  const trace = () => {
    const inner = loops.at(-1);
    if (inner?.of) {
      const owner = inner.of === "record" ? "record.__ref" : `${inner.of}.__ref`;
      // An offset the loop starts at, or its reversed order, kept in the item's place in the list.
      if (inner.place === undefined) return `{{ ${owner} }}`;
      return `{{ ${owner} }}#{{ ${inner.place} }}`;
    }
    const rec = record();
    return rec ? `{{ ${rec} }}` : undefined;
  };
  for (const t of tokens) {
    if (t.type === "liquidTag") {
      if (t.name === "for" || t.name === "tablerow") {
        // {% for item in collection ... %}; a range such as (1..3) has no record to point at.
        const m = /^([\w-]+)\s+in\s+([^\s(][^\s]*)/.exec(t.args);
        const list = m && /^([a-z_]\w*)\.[a-z_]\w*$/i.exec(m[2]!);
        const of =
          list && list[1] !== "data" && (list[1] === "record" || loops.some((l) => l.item === list[1]))
            ? list[1]
            : undefined;
        loops.push({ name: t.name, item: m ? m[1]! : null, ...(of ? { of, place: placeIn(t.args) } : {}) });
      } else if (t.name === "endfor" || t.name === "endtablerow") loops.pop();
      else if (t.name === "render" || t.name === "include") {
        const marked = !inText;
        if (marked) inserts.push({ at: t.start, text: `<!--spaka-inc ${file}:${t.start}:${t.end}-->` });
        if (record() && !/\b__rec\s*:/.test(t.args)) {
          // Hand the current record down to the shared part: {% render 'card', book: book, __rec: book.__ref %}
          const close = src.slice(t.start, t.end).search(/-?%\}$/);
          if (close > 0) inserts.push({ at: t.start + close, text: `, __rec: ${record()} ` });
        }
        if (marked) inserts.push({ at: t.end, text: "<!--/spaka-inc-->" });
      }
    } else if (t.type === "htmlOpen" && (t.name === "title" || t.name === "textarea") && !t.selfClosing) {
      inText = t.name;
    } else if (t.type === "htmlClose" && t.name === inText) {
      inText = null;
    }
    if (t.type === "htmlOpen" && !UNTRACED.has(t.name)) {
      let text = ` data-spaka-src="${file}:${lineAt(t.start)}:${t.start}"`;
      const rec = trace();
      if (rec) text += ` data-spaka-rec="${rec}"`;
      inserts.push({ at: t.nameEnd, text });
    }
  }
  let out = "";
  let last = 0;
  for (const ins of inserts) {
    out += src.slice(last, ins.at) + ins.text;
    last = ins.at;
  }
  return out + src.slice(last);
}
