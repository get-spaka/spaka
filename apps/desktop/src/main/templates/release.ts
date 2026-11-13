// A release of Upstart's templates (Q247, Q250): built by the CI of the public
// repository upstart-gg/upstart-templates from the template folders it holds,
// and attached to a GitHub release — catalogue.json (each template's manifest,
// its .zip's sha256 and size, its pictures), each template's cover and hover
// sequence, and one .zip per template. The app ships a snapshot of the
// catalogue and pictures, reads the latest one, and downloads a .zip when the
// maker views a template large or chooses it.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkTemplate } from "./check";
import type { Manifest } from "./manifest";
import { readTemplateFolder } from "./reader";
import { writeZip } from "./zip";

/** The format of catalogue.json; an app reads only the formats it knows. */
export const CATALOGUE_FORMAT = 1;
export const CATALOGUE_FILE = "catalogue.json";

export type CatalogueEntry = Manifest & {
  /** The .zip, attached to the same release: its file name, sha256 (hex) and size in bytes. */
  zip: { file: string; sha256: string; size: number };
  /** Its pictures, attached to the same release, by file name. */
  cover?: string;
  hover?: string;
};

export type Catalogue = {
  format: typeof CATALOGUE_FORMAT;
  /** The release's tag, whose assets the files are. */
  release: string;
  templates: CatalogueEntry[];
};

/** The folders of `root` that hold a template. */
export function templateFolders(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => join(root, e.name))
    .filter((dir) => {
      try {
        return readdirSync(dir).includes("template.json");
      } catch {
        return false;
      }
    })
    .sort();
}

/**
 * Builds a release of the templates in `root` into `out`, each checked as a
 * finished one first: a template with an error stops the release.
 */
export function buildRelease(root: string, out: string, release: string): Catalogue {
  mkdirSync(out, { recursive: true });
  const templates: CatalogueEntry[] = [];
  const problems: string[] = [];
  for (const dir of templateFolders(root)) {
    const files = readTemplateFolder(dir);
    const { template, errors } = checkTemplate(files, { finished: true });
    if (!template || errors.length) {
      problems.push(`${dir}:\n${errors.map((e) => `  ✗ ${e}`).join("\n")}`);
      continue;
    }
    const { manifest, pictures } = template;
    // Its pictures are attached apart: the app shows them before it downloads the template.
    const zip = writeZip(new Map([...files].filter(([path]) => !path.startsWith("pictures/"))));
    const file = `${manifest.id}-${manifest.version}.zip`;
    writeFileSync(join(out, file), zip);
    const entry: CatalogueEntry = {
      ...manifest,
      zip: { file, sha256: createHash("sha256").update(zip).digest("hex"), size: zip.length },
    };
    for (const which of ["cover", "hover"] as const) {
      const path = pictures[which];
      if (!path) continue;
      const name = `${manifest.id}-${manifest.version}-${which}.webp`;
      writeFileSync(join(out, name), files.get(path)!);
      entry[which] = name;
    }
    templates.push(entry);
  }
  if (problems.length) throw new Error(`These templates are not ready:\n${problems.join("\n")}`);
  const ids = templates.map((t) => t.id);
  const twice = ids.find((id, i) => ids.indexOf(id) !== i);
  if (twice) throw new Error(`Two templates are named "${twice}".`);
  const catalogue: Catalogue = { format: CATALOGUE_FORMAT, release, templates };
  writeFileSync(join(out, CATALOGUE_FILE), `${JSON.stringify(catalogue, null, 2)}\n`);
  return catalogue;
}
