// The cascade layers of a site's styles, the same in the preview and once
// exported: Tailwind's theme and base, then daisyUI's components, then the
// site's own `@layer components`, then the utilities. So a site that styles
// `.btn` in its components layer restyles daisyUI's buttons, and a class such
// as rounded-none still beats both.

/** The layers' order, declared before any of them. */
export const LAYER_ORDER = "@layer theme, base, daisyui, components, utilities;";

/**
 * daisyUI's components moved out of Tailwind's utilities layer into the
 * daisyui layer. daisyUI 5 puts them in `@layer utilities` (each in a
 * `daisyui.l1…` layer of its own), whether from its daisyui.css or compiled
 * by Tailwind with `@plugin "daisyui"`; there they beat every rule of a
 * site's `@layer components`. Each part of a utilities layer that holds a
 * `@layer daisyui…` goes, in its place and order, into `@layer daisyui`; the
 * rest stays a utility. Nothing else is changed.
 */
export function daisyuiBelowComponents(css: string): string {
  return statements(css, 0, css.length)
    .map((statement) => {
      const utilities = /^((?:\s|\/\*[\s\S]*?\*\/)*)@layer\s+utilities\s*\{([\s\S]*)\}\s*$/.exec(statement);
      if (!utilities) return statement;
      const [, lead, inner] = utilities as unknown as [string, string, string];
      const groups: { daisyui: boolean; text: string }[] = [];
      for (const part of statements(inner, 0, inner.length)) {
        const daisyui = /@layer\s+daisyui\b/.test(part.replace(/\/\*[\s\S]*?\*\//g, ""));
        const last = groups.at(-1);
        if (last && (last.daisyui === daisyui || !part.trim())) last.text += part;
        else groups.push({ daisyui, text: part });
      }
      return lead + groups.map((g) => `@layer ${g.daisyui ? "daisyui" : "utilities"}{${g.text}}`).join("");
    })
    .join("");
}

/**
 * The cascade layers the rules with exactly this selector are in, each as
 * "outer > inner" ("" for none): how the checks see where a rule landed.
 */
export function layersOf(css: string, selector: string): string[] {
  const found = new Set<string>();
  const heads: string[] = [];
  let text = "";
  for (const c of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (c === "{") {
      const head = text.trim();
      heads.push(head);
      text = "";
      if (head === selector)
        found.add(
          heads
            .filter((h) => h.startsWith("@layer "))
            .map((h) => h.slice(7))
            .join(" > "),
        );
    } else if (c === "}") {
      heads.pop();
      text = "";
    } else if (c === ";") text = "";
    else text += c;
  }
  return [...found].sort();
}

/** The statements and blocks between start and end, each with the space and comments before it. */
function statements(css: string, start: number, end: number): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = start;
  for (let i = start; i < end; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      for (i++; i < end && css[i] !== c; i++) if (css[i] === "\\") i++;
    } else if (c === "/" && css[i + 1] === "*") {
      const close = css.indexOf("*/", i + 2);
      i = close < 0 ? end : close + 1;
    } else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        parts.push(css.slice(from, i + 1));
        from = i + 1;
      }
    } else if (c === ";" && depth === 0) {
      parts.push(css.slice(from, i + 1));
      from = i + 1;
    }
  }
  if (from < end) parts.push(css.slice(from, end));
  return parts;
}
