// How much of the htmx the agent wrote is valid htmx 4 (ADR 0004)?
// Every hx-* attribute in the project's templates is one unit. The rules come
// from the material shipped inside htmx.org@4.0.1: the attribute list of
// dist/editors/jetbrains/htmx.web-types.json and the two guidance files in
// dist/skills. Throwaway spike code.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { scan } from "../runtime/template.ts";

const CORE = new Set([
  "hx-get", "hx-post", "hx-put", "hx-patch", "hx-delete", "hx-query", "hx-trigger", "hx-swap", "hx-target", "hx-select",
  "hx-vals", "hx-include", "hx-swap-oob", "hx-select-oob", "hx-push-url", "hx-replace-url", "hx-headers", "hx-encoding",
  "hx-indicator", "hx-boost", "hx-sync", "hx-confirm", "hx-validate", "hx-disable", "hx-ignore", "hx-preserve",
  "hx-morph-skip", "hx-morph-skip-children", "hx-action", "hx-method", "hx-config", "hx-history-elt",
]);
// Valid htmx 4, but only once the named extension script is loaded.
const EXTENSION: Record<string, string> = {
  "hx-preload": "hx-preload", "hx-pending": "hx-pending", "hx-head": "hx-head", "hx-sse": "hx-sse", "hx-ws": "hx-ws",
  "hx-browser-indicator": "hx-browser-indicator", "hx-targets": "hx-targets", "hx-ptag": "hx-ptag",
  "hx-history": "hx-history-cache", "hx-nonce": "hx-csp", "hx-live": "hx-live", "hx-prompt": "hx-prompt",
};
const REMOVED: Record<string, string> = {
  "hx-disabled-elt": "renamed hx-disable in htmx 4",
  "hx-ext": "removed: an extension is loaded by its script alone",
  "hx-vars": "removed: use hx-vals with a js: prefix",
  "hx-params": "removed",
  "hx-request": "renamed hx-config",
  "hx-disinherit": "removed: inheritance is explicit",
  "hx-inherit": "removed: use the :inherited modifier",
};
const REQUEST = ["hx-get", "hx-post", "hx-put", "hx-patch", "hx-delete", "hx-query", "hx-action"];
const INHERITABLE = new Set([
  "hx-target", "hx-include", "hx-swap", "hx-boost", "hx-confirm", "hx-headers", "hx-indicator", "hx-sync", "hx-config",
  "hx-encoding", "hx-validate", "hx-select",
]);
const SWAP_STYLES = new Set([
  "innerhtml", "outerhtml", "outersync", "innermorph", "outermorph", "textcontent", "before", "beforebegin", "prepend",
  "afterbegin", "append", "beforeend", "after", "afterend", "delete", "none",
]);
const SWAP_MODIFIERS = new Set([
  "swap", "settle", "transition", "ignoreTitle", "scroll", "show", "scrollTarget", "showTarget", "strip", "focusScroll",
  "swapEmpty", "target",
]);
const TRIGGER_MODIFIERS = new Set([
  "once", "changed", "delay", "throttle", "from", "target", "prevent", "stop", "consume", "halt", "capture", "passive",
  "root", "threshold",
]);
const HTMX_EVENTS = new Set([
  "before:process", "after:process", "before:init", "after:init", "before:cleanup", "after:cleanup", "before:on:init",
  "confirm", "config:request", "before:request", "before:response", "after:request", "finally:request", "error",
  "response:error", "before:swap", "after:swap", "finally:swap", "before:settle", "after:settle",
  "before:history:update", "after:history:update", "after:history:push", "after:history:replace",
  "before:history:restore", "before:viewTransition", "after:viewTransition", "abort",
].map((e) => e.toLowerCase()));
// Fields of event.detail that existed in htmx 2 only.
const OLD_DETAIL = /\bdetail\.(successful|failed|xhr|requestConfig|pathInfo|parameters|elt|isError|boosted)\b/;

export type Finding = { file: string; line: number; tag: string; attribute: string; value: string; problem: string };
export type HtmxCheck = {
  attributes: number;
  valid: number;
  share: number | null;
  invalid: Finding[];
  needsExtension: Finding[];
  byAttribute: Record<string, number>;
  /** htmx 2 names found inside <script> blocks (not counted in the share). */
  scriptReferences: Finding[];
  filesScanned: string[];
};

function attributesOf(tagText: string): { name: string; value: string }[] {
  // Liquid tags between attributes are not attributes; outputs inside values stay.
  const text = tagText.replace(/\{%[\s\S]*?%\}/g, " ");
  const out: { name: string; value: string }[] = [];
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (let m; (m = re.exec(text)); ) out.push({ name: m[1].toLowerCase(), value: m[2] ?? m[3] ?? m[4] ?? "" });
  return out;
}

function splitOutside(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (const c of s) {
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "[" || c === "(" || c === "<") depth++;
    else if (c === "]" || c === ")" || c === ">") depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function htmxEventProblem(name: string): string | null {
  // name is what follows "htmx:" (already lower-cased by the HTML parser when it comes from an attribute name)
  if (HTMX_EVENTS.has(name.toLowerCase())) return null;
  return `"htmx:${name}" is not an htmx 4 event (htmx 4 names are colon-separated, e.g. htmx:after:request)`;
}

function checkValue(base: string, value: string): string | null {
  if (base === "hx-swap") {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    const first = parts[0].includes(":") && !SWAP_STYLES.has(parts[0].toLowerCase()) ? null : parts[0];
    const mods = first ? parts.slice(1) : parts;
    if (first && !SWAP_STYLES.has(first.toLowerCase())) {
      if (/^(upsert|download)$/i.test(first)) return null; // extension styles, reported separately by the caller
      return `swap style "${first}" does not exist in htmx 4`;
    }
    for (const mod of mods) {
      const key = mod.split(":")[0];
      if (!SWAP_MODIFIERS.has(key)) return `swap modifier "${key}" does not exist in htmx 4`;
    }
    return null;
  }
  if (base === "hx-trigger") {
    for (const spec of splitOutside(value, ",")) {
      if (/^every\s+\d/.test(spec)) continue;
      const [event, ...mods] = splitOutside(spec, " ");
      const name = event.replace(/\[.*$/, "");
      if (name.startsWith("htmx:")) {
        const p = htmxEventProblem(name.slice(5));
        if (p) return p;
      }
      for (const mod of mods) {
        const key = mod.split(":")[0];
        if (!TRIGGER_MODIFIERS.has(key)) return `trigger modifier "${key}" does not exist in htmx 4`;
      }
    }
    return null;
  }
  if (base === "hx-disable" && (value === "" || value === "true")) return 'hx-disable without a selector is the htmx 2 meaning (now hx-ignore); in htmx 4 it names the elements to disable';
  if (base === "hx-on" || base === "hx-vals" || base === "hx-confirm" || base === "hx-headers") {
    if (OLD_DETAIL.test(value)) return `uses an htmx 2 event detail field (${OLD_DETAIL.exec(value)![0]}); htmx 4 exposes detail.ctx`;
    if (/htmx\.(defineExtension|addClass|removeClass|toggleClass|takeClass|closest|remove|off|values)\(/.test(value)) return "calls an htmx 2 JavaScript API removed in htmx 4";
  }
  return null;
}

export function checkHtmxSource(src: string, file: string): Pick<HtmxCheck, "invalid" | "needsExtension" | "byAttribute" | "scriptReferences"> & { attributes: number } {
  const invalid: Finding[] = [];
  const needsExtension: Finding[] = [];
  const scriptReferences: Finding[] = [];
  const byAttribute: Record<string, number> = {};
  let attributes = 0;
  const lineAt = (offset: number) => src.slice(0, offset).split("\n").length;
  for (const t of scan(src).tokens) {
    if (t.type === "rawText" && t.name === "script") {
      const text = src.slice(t.start, t.end);
      for (const m of text.matchAll(/htmx:[a-z]+[A-Z]\w*|htmx\.(defineExtension|addClass|removeClass|toggleClass|takeClass)\b/g))
        scriptReferences.push({ file, line: lineAt(t.start + (m.index ?? 0)), tag: "script", attribute: "", value: m[0], problem: "htmx 2 name inside a script" });
      continue;
    }
    if (t.type !== "htmlOpen") continue;
    const attrs = attributesOf(src.slice(t.nameEnd, t.end - 1));
    const hx = attrs.filter((a) => /^(data-)?hx-/.test(a.name));
    if (!hx.length) continue;
    const names = hx.map((a) => a.name.replace(/^data-/, ""));
    const makesRequest = names.some((n) => REQUEST.includes(n.split(":")[0]));
    for (const a of hx) {
      attributes++;
      const full = a.name.replace(/^data-/, "");
      const add = (list: Finding[], problem: string) => list.push({ file, line: lineAt(t.start), tag: t.name, attribute: a.name, value: a.value.slice(0, 120), problem });
      let base = full;
      let problem: string | null = null;
      if (full === "hx-on" || full.startsWith("hx-on:")) {
        base = "hx-on";
        const event = full.slice("hx-on:".length);
        if (full !== "hx-on") {
          if (event.startsWith(":")) problem = htmxEventProblem(event.slice(1));
          else if (event.startsWith("htmx:")) problem = htmxEventProblem(event.slice(5));
          else if (!event) problem = "hx-on: without an event name";
        }
      } else if (/^hx-status:/.test(full)) {
        base = "hx-status";
        if (!/^hx-status:(\d{3}|\d{2}x|\dxx)$/.test(full)) problem = "hx-status needs a status code such as 422, 50x or 5xx";
      } else {
        const [name, ...mods] = full.split(":");
        base = name;
        if (name === "hx-sse" || name === "hx-ws" || name === "hx-live") {
          // hx-sse:connect, hx-ws:send, hx-live:text ... the part after the colon is not a modifier
        } else {
          const bad = mods.find((m) => m !== "inherited" && m !== "append");
          if (bad !== undefined) problem = `unknown modifier ":${bad}"`;
        }
      }
      byAttribute[base] = (byAttribute[base] ?? 0) + 1;
      if (problem) {
        add(invalid, problem);
        continue;
      }
      if (REMOVED[base]) {
        add(invalid, REMOVED[base]);
        continue;
      }
      if (EXTENSION[base]) {
        add(needsExtension, `needs the ${EXTENSION[base]} extension`);
        continue;
      }
      if (base !== "hx-on" && base !== "hx-status" && !CORE.has(base)) {
        add(invalid, "not an htmx 4 attribute");
        continue;
      }
      const valueProblem = checkValue(base, a.value);
      if (valueProblem) {
        add(invalid, valueProblem);
        continue;
      }
      if (base === "hx-swap" && /^(upsert|download)\b/i.test(a.value.trim())) {
        add(needsExtension, `swap style needs the hx-${a.value.trim().split(/\s/)[0].toLowerCase()} extension`);
        continue;
      }
      // An inheritable attribute on an element that makes no request itself only works with :inherited.
      const inherited = full.includes(":inherited");
      const boostOnItself = base === "hx-boost" && (t.name === "a" || t.name === "form");
      if (INHERITABLE.has(base) && !inherited && !makesRequest && !boostOnItself && t.name !== "hx-partial")
        add(invalid, "relies on implicit inheritance: in htmx 4 it applies to this element only unless written with :inherited");
    }
  }
  return { attributes, invalid, needsExtension, byAttribute, scriptReferences };
}

export function checkHtmx(projectDir: string): HtmxCheck {
  const result: HtmxCheck = { attributes: 0, valid: 0, share: null, invalid: [], needsExtension: [], byAttribute: {}, scriptReferences: [], filesScanned: [] };
  const walk = (dir: string) => {
    const abs = path.join(projectDir, dir);
    if (!existsSync(abs)) return;
    for (const e of readdirSync(abs)) {
      const rel = `${dir}/${e}`;
      if (statSync(path.join(projectDir, rel)).isDirectory()) walk(rel);
      else if (/\.(liquid|html)$/.test(e)) {
        const r = checkHtmxSource(readFileSync(path.join(projectDir, rel), "utf8"), rel);
        result.filesScanned.push(rel);
        result.attributes += r.attributes;
        result.invalid.push(...r.invalid);
        result.needsExtension.push(...r.needsExtension);
        result.scriptReferences.push(...r.scriptReferences);
        for (const [k, v] of Object.entries(r.byAttribute)) result.byAttribute[k] = (result.byAttribute[k] ?? 0) + v;
      }
    }
  };
  for (const dir of ["pages", "parts", "fragments"]) walk(dir);
  // Valid = works in htmx 4 with the core alone, the compatibility extension off.
  result.valid = result.attributes - result.invalid.length - result.needsExtension.length;
  result.share = result.attributes ? result.valid / result.attributes : null;
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = checkHtmx(path.resolve(process.argv[2]));
  console.log(JSON.stringify(r, null, 2));
}
