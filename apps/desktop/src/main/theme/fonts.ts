// The fonts the Theme tab offers (Q93): the system's, and open fonts shipped
// with the app. A shipped font the theme uses is copied into the project's
// fonts/ folder, with its @font-face in a region of theme.css the app keeps,
// so that the published site asks no font service for it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FontChoice } from "../../shared/ipc";

type Shipped = {
  id: string;
  family: string;
  category: string;
  weight: string;
  files: { normal?: string; italic?: string };
};

const FALLBACK: Record<string, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  "sans-serif": "system-ui, sans-serif",
  display: "system-ui, sans-serif",
  handwriting: "cursive",
  monospace: "ui-monospace, monospace",
};

/** The system's own fonts: nothing to copy. */
export const SYSTEM_FONTS: FontChoice[] = [
  {
    id: "system-sans",
    name: "System sans-serif",
    category: "sans-serif",
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    shipped: false,
  },
  {
    id: "system-serif",
    name: "System serif",
    category: "serif",
    stack: 'ui-serif, Georgia, "Times New Roman", serif',
    shipped: false,
  },
  {
    id: "system-rounded",
    name: "System rounded",
    category: "sans-serif",
    stack: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
    shipped: false,
  },
  {
    id: "system-mono",
    name: "System monospace",
    category: "monospace",
    stack: "ui-monospace, Menlo, Consolas, monospace",
    shipped: false,
  },
];

const START = "/* Fonts chosen in Upstart's Theme tab (kept by Upstart) */";
const END = "/* End of the fonts chosen in Upstart's Theme tab */";

export class Fonts {
  private shipped: Shipped[] | undefined;

  constructor(private readonly dir: string) {}

  private all(): Shipped[] {
    this.shipped ??= JSON.parse(readFileSync(join(this.dir, "fonts.json"), "utf8")) as Shipped[];
    return this.shipped;
  }

  list(): FontChoice[] {
    return [
      ...SYSTEM_FONTS,
      ...this.all().map((f) => ({
        id: f.id,
        name: f.family,
        category: f.category,
        stack: `"${f.family}", ${FALLBACK[f.category] ?? "sans-serif"}`,
        shipped: true,
      })),
    ];
  }

  /** The shipped font a theme value starts with, if any: `"Fraunces", Georgia, serif` → fraunces. */
  usedBy(value: string | undefined): Shipped | undefined {
    const first = value
      ?.split(",")[0]
      ?.trim()
      .replace(/^["']|["']$/g, "");
    return first ? this.all().find((f) => f.family.toLowerCase() === first.toLowerCase()) : undefined;
  }

  /** Where a shipped font's file is, from "<id>/normal.woff2". */
  path(file: string): string | undefined {
    const [id, name] = file.split("/");
    const f = this.all().find((x) => x.id === id);
    return f && name && Object.values(f.files).includes(name) ? join(this.dir, id!, name) : undefined;
  }

  /** The files of these fonts, as the project keeps them: fonts/<id>/normal.woff2 → contents. */
  files(ids: string[]): Record<string, Buffer> {
    const out: Record<string, Buffer> = {};
    for (const f of this.all().filter((x) => ids.includes(x.id)))
      for (const file of Object.values(f.files))
        if (file) out[`fonts/${f.id}/${file}`] = readFileSync(join(this.dir, f.id, file));
    return out;
  }

  /**
   * theme.css with the region of @font-face rules for exactly these fonts (none:
   * no region). `base` is where the files are: the project's /fonts, or the
   * app's own while the theme is only shown.
   */
  withFaces(css: string, ids: string[], base = "/fonts"): string {
    const faces = this.all()
      .filter((f) => ids.includes(f.id))
      .flatMap((f) =>
        (["normal", "italic"] as const)
          .filter((style) => f.files[style])
          .map(
            (style) =>
              `@font-face { font-family: "${f.family}"; font-style: ${style}; font-weight: ${f.weight}; font-display: swap; src: url("${base}/${f.id}/${f.files[style]}") format("woff2"); }`,
          ),
      );
    return setRegion(css, faces.length ? `${START}\n${faces.join("\n")}\n${END}\n` : "");
  }
}

/** Puts the region (or removes it) after any @charset and @import lines, which must come first. */
export function setRegion(css: string, region: string): string {
  const start = css.indexOf(START);
  const end = css.indexOf(END);
  if (start >= 0 && end > start) {
    const after = css.slice(end + END.length).replace(/^\n/, "");
    return css.slice(0, start) + region + after;
  }
  if (!region) return css;
  const lead = /^(?:\s*(?:@charset|@import)[^;]*;[^\S\n]*\n?)*/.exec(css)?.[0] ?? "";
  const rest = css.slice(lead.length);
  const gap = lead && !lead.endsWith("\n") ? "\n" : "";
  return `${lead}${gap}${lead ? "\n" : ""}${region}${rest && !region.endsWith("\n") ? "\n" : ""}${rest}`;
}
