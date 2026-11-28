// The templates a new website may start from (Q245, Q249): Spaka's own and
// those the maker imported, kept in the app's data. Spaka's come from a
// folder while it is developed, or from the catalogue of the public
// repository's releases (Q247, Q250): the app ships a snapshot of it with the
// pictures, reads the latest one when it starts, and downloads a template's
// .zip, checked against its sha256, into its cache when the maker views it
// large or chooses it. Each template is then a folder in the template format.
// Of a template's versions in the catalogue, the app takes the newest one its
// own version opens, from the release that holds it, or shows none (Q368).
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TemplateImport, TemplateSummary } from "../../shared/ipc";
import { USER_AGENT } from "../media/search";
import { checkTemplate } from "./check";
import { MANIFEST, Manifest, olderVersion } from "./manifest";
import { readTemplateFolder, readTemplateZip, type TemplateFiles } from "./reader";
import { CATALOGUE_FILE, type Catalogue, type EarlierEntry, parseCatalogue } from "./release";
import { ZIP_LIMITS } from "./zip";

/** An imported template waits this long for the maker to add it. */
const PENDING_MS = 30 * 60_000;

/** The public repository's releases (Q250): get-spaka/templates. */
export const TEMPLATES_RELEASES = "https://github.com/get-spaka/templates/releases";

/** Where Spaka's own templates come from. */
export type TemplateSource =
  /** A folder of template folders: the repository's, while Spaka is developed. */
  | { folder: string }
  | {
      /** The releases' address: `<releases>/latest/download/catalogue.json`, `<releases>/download/<tag>/<file>`. */
      releases: string;
      /** The catalogue and pictures shipped with the app. */
      snapshot: string;
      /** The latest catalogue, pictures and downloaded templates. */
      cache: string;
      /** The app's version, which picks each template's version (Q368). */
      app: string;
      fetch?: typeof fetch;
    };

export class TemplateLibrary {
  private pending = new Map<string, { files: TemplateFiles; at: number }>();
  private latest: Catalogue | undefined;
  private downloads = new Map<string, Promise<string>>();

  constructor(
    private readonly source: TemplateSource,
    /** The maker's imported templates. */
    private readonly imported: string,
  ) {
    if ("releases" in source) this.latest = readCatalogue(join(source.cache, CATALOGUE_FILE));
  }

  /** Every template, by name (Q396: no longer the originals first). */
  list(): TemplateSummary[] {
    const seen = new Set<string>();
    const all: TemplateSummary[] = [];
    const add = (summary: TemplateSummary | undefined) => {
      if (!summary || seen.has(summary.id)) return;
      seen.add(summary.id);
      all.push(summary);
    };
    if ("folder" in this.source)
      for (const id of folders(this.source.folder)) {
        const summary = readSummary(join(this.source.folder, id), false);
        if (summary?.id === id) add(summary);
      }
    else for (const entry of this.entries()) add(summaryOf(entry, false));
    for (const id of folders(this.imported)) {
      const summary = readSummary(join(this.imported, id), true);
      if (summary?.id === id) add(summary);
    }
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): TemplateSummary | undefined {
    return this.list().find((t) => t.id === id);
  }

  /**
   * A template's folder, by its id, downloaded first if it has to be; throws,
   * in words the maker reads, when it cannot be had.
   */
  async dir(id: string): Promise<string> {
    const summary = this.get(id);
    if (!summary) throw new Error("Spaka has no such template.");
    if (summary.imported) return join(this.imported, id);
    if ("folder" in this.source) return join(this.source.folder, id);
    const entry = this.entries().find((t) => t.id === id);
    if (!entry) throw new Error("Spaka has no such template.");
    const dir = join(this.source.cache, "templates", id, entry.version);
    if (existsSync(join(dir, MANIFEST))) return dir;
    const key = `${id}@${entry.version}`;
    let download = this.downloads.get(key);
    if (!download) {
      download = this.download(entry, dir).finally(() => this.downloads.delete(key));
      this.downloads.set(key, download);
    }
    return download;
  }

  /** Its cover or its hover sequence, as a data URL. */
  async picture(id: string, which: "cover" | "hover"): Promise<string | null> {
    const summary = this.get(id);
    if (!summary) return null;
    if (summary.imported || "folder" in this.source) {
      const root = summary.imported ? this.imported : (this.source as { folder: string }).folder;
      return webpFile(join(root, id, "pictures", `${which}.webp`));
    }
    const entry = this.entries().find((t) => t.id === id);
    const name = entry?.[which];
    if (!entry || !name) return null;
    const shipped = webpFile(join(this.source.snapshot, name));
    if (shipped) return shipped;
    const cached = join(this.source.cache, "pictures", name);
    if (!existsSync(cached)) {
      try {
        const bytes = await this.fetchBytes(`${this.source.releases}/download/${entry.release}/${name}`);
        mkdirSync(dirname(cached), { recursive: true });
        writeFileSync(cached, bytes);
      } catch {
        return null;
      }
    }
    return webpFile(cached);
  }

  /**
   * Reads the latest release's catalogue (at the app's start); whether the list
   * changed. Offline, or with an answer it cannot read, the one it had stays.
   */
  async refresh(): Promise<boolean> {
    if (!("releases" in this.source)) return false;
    let catalogue: Catalogue | undefined;
    try {
      const bytes = await this.fetchBytes(`${this.source.releases}/latest/download/${CATALOGUE_FILE}`);
      catalogue = parseCatalogue(bytes.toString("utf8"));
    } catch {
      return false;
    }
    if (!catalogue) return false;
    const before = JSON.stringify(this.catalogue());
    this.latest = catalogue;
    mkdirSync(this.source.cache, { recursive: true });
    writeFileSync(join(this.source.cache, CATALOGUE_FILE), JSON.stringify(catalogue));
    return before !== JSON.stringify(catalogue);
  }

  /** The latest catalogue read, or the one shipped with the app. */
  private catalogue(): Catalogue | undefined {
    if (!("releases" in this.source)) return undefined;
    return this.latest ?? readCatalogue(join(this.source.snapshot, CATALOGUE_FILE));
  }

  /** Each template's version this app takes, with the release holding it. */
  private entries(): EarlierEntry[] {
    if (!("releases" in this.source)) return [];
    return compatibleEntries(this.catalogue(), this.source.app);
  }

  private async download(entry: EarlierEntry, dir: string): Promise<string> {
    const source = this.source as Extract<TemplateSource, { releases: string }>;
    const { release } = entry;
    if (entry.zip.size > ZIP_LIMITS.bytes) throw new Error(`${entry.name} is too large to download.`);
    let zip: Buffer;
    try {
      zip = await this.fetchBytes(`${source.releases}/download/${release}/${entry.zip.file}`);
    } catch {
      throw new Error(`${entry.name} could not be downloaded: check the connection, then try again.`);
    }
    const sum = createHash("sha256").update(zip).digest("hex");
    if (zip.length !== entry.zip.size || sum !== entry.zip.sha256)
      throw new Error(`${entry.name} did not arrive whole: try again.`);
    const files = readTemplateZip(zip);
    const manifest = Manifest.safeParse(JSON.parse(files.get(MANIFEST)?.toString("utf8") ?? "null"));
    if (!manifest.success || manifest.data.id !== entry.id || manifest.data.version !== entry.version)
      throw new Error(`${entry.name} is not the template the catalogue names.`);
    const part = `${dir}.part-${randomUUID()}`;
    for (const [path, bytes] of files) {
      const file = join(part, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    rmSync(dir, { recursive: true, force: true });
    renameSync(part, dir);
    return dir;
  }

  private async fetchBytes(url: string): Promise<Buffer> {
    const source = this.source as Extract<TemplateSource, { releases: string }>;
    const answer = await (source.fetch ?? fetch)(url, { headers: { "user-agent": USER_AGENT } });
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
    return Buffer.from(await answer.arrayBuffer());
  }

  /**
   * A folder or a .zip read as a template, to be added once the maker has seen
   * its name and pictures (Q248); or why it cannot be one: what the check
   * calls an error. Its scripts are not run until then.
   */
  async read(path: string): Promise<TemplateImport> {
    let files: TemplateFiles;
    try {
      files = statSync(path).isDirectory() ? readTemplateFolder(path) : readTemplateZip(readFileSync(path));
    } catch (error) {
      return { problems: [error instanceof Error ? error.message : String(error)] };
    }
    const check = await checkTemplate(files);
    if (check.errors.length || !check.template) return { problems: check.errors };
    const { manifest, pictures } = check.template;
    const known = this.get(manifest.id);
    if (known && !known.imported) return { problems: [`Spaka already has a template named "${manifest.id}".`] };
    this.forget();
    const token = randomUUID();
    this.pending.set(token, { files, at: Date.now() });
    const webp = (p: string | undefined) => {
      const bytes = p && files.get(p);
      return bytes ? `data:image/webp;base64,${bytes.toString("base64")}` : null;
    };
    return {
      token,
      template: summaryOf(manifest, true),
      cover: webp(pictures.cover),
      pages: pictures.pages.flatMap((p) => webp(p.desktop) ?? []).slice(0, 4),
    };
  }

  /** Adds a template read by read(), replacing an earlier import of the same id. */
  accept(token: string): TemplateSummary {
    const pending = this.pending.get(token);
    if (!pending) throw new Error("This template is no longer waiting to be added: import it again.");
    this.pending.delete(token);
    const manifest = Manifest.parse(JSON.parse(pending.files.get(MANIFEST)!.toString("utf8")));
    const dir = join(this.imported, manifest.id);
    rmSync(dir, { recursive: true, force: true });
    for (const [path, bytes] of pending.files) {
      const file = join(dir, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    return summaryOf(manifest, true);
  }

  private forget() {
    const now = Date.now();
    for (const [token, p] of this.pending) if (now - p.at > PENDING_MS) this.pending.delete(token);
  }
}

function folders(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function readSummary(dir: string, imported: boolean): TemplateSummary | undefined {
  try {
    const parsed = Manifest.safeParse(JSON.parse(readFileSync(join(dir, MANIFEST), "utf8")));
    return parsed.success ? summaryOf(parsed.data, imported) : undefined;
  } catch {
    return undefined;
  }
}

function summaryOf(m: Manifest, imported: boolean): TemplateSummary {
  return {
    id: m.id,
    version: m.version,
    name: m.name,
    description: m.description,
    category: m.category,
    tags: m.tags,
    imported,
  };
}

function webpFile(file: string): string | null {
  return existsSync(file) ? `data:image/webp;base64,${readFileSync(file).toString("base64")}` : null;
}

function readCatalogue(file: string): Catalogue | undefined {
  try {
    return parseCatalogue(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Each template's newest version an app of version `app` opens: one whose
 * `app` is at most its own (Q368), from the catalogue's release or, for an
 * earlier one, from the release that holds it. A template with none is left out.
 */
export function compatibleEntries(catalogue: Catalogue | undefined, app: string): EarlierEntry[] {
  if (!catalogue) return [];
  const all = [...catalogue.templates.map((t) => ({ ...t, release: catalogue.release })), ...catalogue.earlier];
  const chosen = new Map<string, EarlierEntry>();
  for (const entry of all) {
    if (entry.app && olderVersion(app, entry.app)) continue;
    const known = chosen.get(entry.id);
    if (!known || olderVersion(known.version, entry.version)) chosen.set(entry.id, entry);
  }
  return [...chosen.values()];
}
