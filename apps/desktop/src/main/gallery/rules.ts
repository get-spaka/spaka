// What the gallery's judge (gallery.test.ts) and a template's checks share:
// the moods a block is searched by, the colors that do not follow the theme,
// and the files a block writes into a project when it is dropped.
import { TEST_RECORDS_DIR } from "@spaka/runtime";
import { isCollected } from "../editing/data-drop";
import type { Block } from "./catalogue";

/** The moods a block is searched by, one spelling each. */
export const MOODS = [
  "minimal",
  "friendly",
  "bold",
  "elegant",
  "playful",
  "warm",
  "professional",
  "editorial",
  "dark",
  "colorful",
];

/** Tailwind's own colors, which do not follow the theme: `bg-blue-600`, `text-white`, `bg-[#fff]`. */
export const FIXED_COLOUR =
  /(?:^|[\s"':])(?:[a-z]+:)*!?(?:bg|text|border|ring|ring-offset|from|via|to|fill|stroke|outline|divide|shadow|decoration|placeholder|accent|caret)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|black|white|\[(?:#|rgb|hsl|oklch|color))/;

/** The files a block writes into a project when it is dropped, under its own names. */
export function droppedFiles(b: Block): Record<string, string> {
  const files: Record<string, string> = {
    "pages/index.liquid": `<!doctype html><html><body>{% render '${b.id}' %}</body></html>`,
    [`parts/${b.id}.liquid`]: b.source,
  };
  if (b.data && b.datasource) {
    files[`data/${b.data.name}/_datasource.yaml`] = b.datasource.definition;
    // A form's samples are the preview's test records (Q182).
    const records = isCollected(b.datasource.definition) ? `${TEST_RECORDS_DIR}/${b.data.name}` : `data/${b.data.name}`;
    for (const [file, text] of Object.entries(b.datasource.records)) files[`${records}/${file}`] = text;
  }
  if (b.data && b.detail) {
    files[`pages/${b.data.name}/[${b.data.name}].liquid`] = `<!doctype html><html><body>${b.detail}</body></html>`;
  }
  for (const [file, text] of Object.entries(b.fragments ?? {})) files[`fragments/${file}`] = text;
  return files;
}
