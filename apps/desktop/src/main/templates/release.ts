// A release of Spaka's templates (Q247, Q250): built by the CI of the public
// repository get-spaka/templates from the template folders it holds,
// and attached to a GitHub release — catalogue.json (each template's manifest,
// its .zip's sha256 and size, its pictures), each template's cover and hover
// sequence, and one .zip per template. The app ships a snapshot of the
// catalogue and pictures, reads the latest one, and downloads a .zip when the
// maker views a template large, which shows the pictures of its pages the .zip
// holds (Q541, Q545), or chooses it. A template that needs a newer app
// than an older one (Q368) keeps its earlier versions in the catalogue, with
// the release holding their files, for those apps to take instead.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkTemplate } from "./check";
import { checkPackagesOnline } from "./check-packages";
import { Manifest, olderVersion } from "./manifest";
import { readTemplateFolder } from "./reader";
import { writeZip } from "./zip";

/**
 * The format of catalogue.json; an app reads only the formats it knows. An app
 * older than Q368 reads format 1 still, without `app` and `earlier`.
 */
export const CATALOGUE_FORMAT = 1;
export const CATALOGUE_FILE = "catalogue.json";

export type CatalogueEntry = Manifest & {
  /** The .zip, attached to the same release: its file name, sha256 (hex) and size in bytes. */
  zip: { file: string; sha256: string; size: number };
  /** Its pictures, attached to the same release, by file name. */
  cover?: string;
  hover?: string;
};

/** An earlier version of a template, for apps older than its later ones need. */
export type EarlierEntry = CatalogueEntry & {
  /** The release's tag whose assets its .zip and pictures are. */
  release: string;
};

export type Catalogue = {
  format: typeof CATALOGUE_FORMAT;
  /** The release's tag, whose assets the files are. */
  release: string;
  templates: CatalogueEntry[];
  /** Earlier versions still needed by older apps, newest first for each template (Q368). */
  earlier: EarlierEntry[];
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
 * finished one first, its packages online (Q546): a template with an error
 * stops the release. The `previous` release's catalogue gives the earlier
 * versions to keep.
 */
export async function buildRelease(
  root: string,
  out: string,
  release: string,
  previous?: Catalogue,
  { packages = checkPackagesOnline }: { packages?: typeof checkPackagesOnline } = {},
): Promise<Catalogue> {
  mkdirSync(out, { recursive: true });
  const templates: CatalogueEntry[] = [];
  const problems: string[] = [];
  for (const dir of templateFolders(root)) {
    const files = readTemplateFolder(dir);
    const { template, errors } = checkTemplate(files, { finished: true });
    errors.push(...(await packages(files)));
    if (!template || errors.length) {
      problems.push(`${dir}:\n${errors.map((e) => `  ✗ ${e}`).join("\n")}`);
      continue;
    }
    const { manifest, pictures } = template;
    // Its cover and hover are attached apart: the app shows them before it
    // downloads the template. The pictures of its pages are in it (Q545).
    const zip = writeZip(
      new Map([...files].filter(([path]) => !path.startsWith("pictures/") || path.startsWith("pictures/pages/"))),
    );
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
  const catalogue: Catalogue = {
    format: CATALOGUE_FORMAT,
    release,
    templates,
    earlier: earlierOf(templates, previous),
  };
  writeFileSync(join(out, CATALOGUE_FILE), `${JSON.stringify(catalogue, null, 2)}\n`);
  return catalogue;
}

/**
 * The earlier versions an older app still needs: going back from each
 * template's version, one is kept when it needs an older app than every
 * version after it, so that each app takes the newest version it can open.
 * Those of the previous release, and those it kept, are the ones there are.
 */
export function earlierOf(templates: CatalogueEntry[], previous: Catalogue | undefined): EarlierEntry[] {
  if (!previous) return [];
  const known = [...previous.templates.map((t) => ({ ...t, release: previous.release })), ...previous.earlier];
  const earlier: EarlierEntry[] = [];
  for (const template of templates) {
    let below = template.app ?? NO_APP;
    const older = known
      .filter((e) => e.id === template.id && olderVersion(e.version, template.version))
      .sort((a, b) => (olderVersion(a.version, b.version) ? 1 : olderVersion(b.version, a.version) ? -1 : 0));
    for (const entry of older)
      if (olderVersion(entry.app ?? NO_APP, below)) {
        earlier.push(entry);
        below = entry.app ?? NO_APP;
      }
  }
  return earlier;
}

/** The app version of a template that says none: any app opens it. */
const NO_APP = "0.0.0";

/** A catalogue of a format this app knows, its entries' manifests valid; undefined otherwise. */
export function parseCatalogue(text: string): Catalogue | undefined {
  const json = JSON.parse(text) as Partial<Catalogue>;
  if (json.format !== CATALOGUE_FORMAT || typeof json.release !== "string" || !Array.isArray(json.templates))
    return undefined;
  const templates = json.templates.flatMap((t) => entryOf(t) ?? []);
  const earlier = (Array.isArray(json.earlier) ? json.earlier : []).flatMap((t) => {
    const entry = entryOf(t);
    const release = (t as Partial<EarlierEntry>).release;
    return entry && typeof release === "string" && /^[\w.-]+$/.test(release) ? { ...entry, release } : [];
  });
  return { format: CATALOGUE_FORMAT, release: json.release, templates, earlier };
}

/** An entry whose manifest is valid and whose file names stay in their release; undefined otherwise. */
function entryOf(t: unknown): CatalogueEntry | undefined {
  const manifest = Manifest.safeParse(t);
  const zip = (t as Partial<CatalogueEntry>).zip;
  if (
    !manifest.success ||
    !zip ||
    typeof zip.size !== "number" ||
    !/^[a-f0-9]{64}$/.test(zip.sha256) ||
    !/^[\w.-]+\.zip$/.test(zip.file)
  )
    return undefined;
  const pictures = (name: unknown) => (typeof name === "string" && /^[\w.-]+\.webp$/.test(name) ? name : undefined);
  const cover = pictures((t as CatalogueEntry).cover);
  const hover = pictures((t as CatalogueEntry).hover);
  return { ...manifest.data, zip, ...(cover ? { cover } : {}), ...(hover ? { hover } : {}) };
}
