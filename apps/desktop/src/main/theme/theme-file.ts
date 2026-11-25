// The Theme tab's reading and writing of theme.css (Q93): only the core
// values (THEME_VARIABLES), changed where they are written, the rest of the
// file left as the agent or the maker wrote it.
import { THEME_VARIABLES } from "@spaka/runtime";

export type ThemeVariable = (typeof THEME_VARIABLES)[number];
export type ThemeValues = Partial<Record<ThemeVariable, string>>;

const CORE = new Set<string>(THEME_VARIABLES);

type Declaration = { name: string; value: string; start: number; end: number };

/** The :root block holding the theme, with its declarations; comments are skipped. */
function rootBlock(css: string): { open: number; close: number; declarations: Declaration[] } | undefined {
  const masked = css.replace(/\/\*[\s\S]*?\*\//g, (c) => " ".repeat(c.length));
  const re = /(^|[}\s;])(:root)\s*\{/g;
  let found: { open: number; close: number; declarations: Declaration[] } | undefined;
  for (let m = re.exec(masked); m; m = re.exec(masked)) {
    const open = m.index + m[0].length;
    const close = masked.indexOf("}", open);
    if (close < 0) break;
    const declarations: Declaration[] = [];
    const decl = /(--[\w-]+)\s*:\s*([^;}]*?)\s*(;|$)/g;
    const body = masked.slice(open, close);
    for (let d = decl.exec(body); d; d = decl.exec(body)) {
      const valueStart = open + d.index + d[0].indexOf(":") + 1;
      const raw = css.slice(valueStart, open + d.index + d[0].length - d[3]!.length);
      const lead = raw.length - raw.trimStart().length;
      declarations.push({
        name: d[1]!,
        value: raw.trim(),
        start: valueStart + lead,
        end: valueStart + lead + raw.trim().length,
      });
    }
    const block = { open, close, declarations };
    found ??= block;
    // The block that defines the theme wins over an earlier, unrelated :root.
    if (declarations.some((x) => CORE.has(x.name))) return block;
  }
  return found;
}

/** The theme's core values as theme.css sets them; the last declaration of a name wins. */
/** The colours of a theme (its fonts and roundness aside), for the "Site's own" palette (Q113). */
export function themeColors(css: string | undefined): ThemeValues | undefined {
  if (!css) return undefined;
  const colors = Object.fromEntries(
    Object.entries(readTheme(css)).filter(([name]) => name.startsWith("--theme-color-")),
  ) as ThemeValues;
  return Object.keys(colors).length ? colors : undefined;
}

export function readTheme(css: string): ThemeValues {
  const out: ThemeValues = {};
  for (const d of rootBlock(css)?.declarations ?? []) if (CORE.has(d.name)) out[d.name as ThemeVariable] = d.value;
  return out;
}

/** theme.css with these values set: changed in place, missing ones added at the end of the block. */
export function writeTheme(css: string, values: ThemeValues): string {
  const entries = Object.entries(values).filter(([name, v]) => CORE.has(name) && v !== undefined) as [
    ThemeVariable,
    string,
  ][];
  const block = rootBlock(css);
  if (!block) {
    const lines = entries.map(([n, v]) => `  ${n}: ${v};`).join("\n");
    const sep = css && !css.endsWith("\n") ? "\n" : "";
    return `${css}${sep}${css ? "\n" : ""}:root {\n${lines}\n}\n`;
  }
  const edits: { start: number; end: number; text: string }[] = [];
  const missing: [string, string][] = [];
  for (const [name, value] of entries) {
    const last = block.declarations.filter((d) => d.name === name).at(-1);
    if (last) {
      if (last.value !== value) edits.push({ start: last.start, end: last.end, text: value });
    } else missing.push([name, value]);
  }
  if (missing.length) {
    const first = block.declarations[0];
    const line = first ? css.slice(css.lastIndexOf("\n", first.start) + 1) : "";
    const indent = /^[ \t]+/.exec(line)?.[0] ?? "  ";
    // After the last declaration, ending it with a semicolon if it had none.
    const lastDecl = block.declarations.at(-1);
    let at = block.close;
    let text = missing.map(([n, v]) => `${indent}${n}: ${v};`).join("\n");
    if (lastDecl) {
      const after = css.slice(lastDecl.end, block.close);
      const semi = /^\s*;/.exec(after);
      at = semi ? lastDecl.end + semi[0].length : lastDecl.end;
      text = `${semi ? "" : ";"}\n${text}`;
    } else {
      const inside = css.slice(block.open, block.close);
      text = `${inside.startsWith("\n") ? "" : "\n"}${text}\n`;
    }
    edits.push({ start: at, end: at, text });
  }
  let out = css;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}
