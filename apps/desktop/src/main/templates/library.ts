// The templates a new website may start from (Q245, Q249): Upstart's own,
// shipped beside the app, and those the maker imported, kept in the app's
// data. Each is a folder in the template format; the start screen lists them,
// shows their pictures and opens one large.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TemplateImport, TemplateSummary } from "../../shared/ipc";
import { checkTemplate } from "./check";
import { MANIFEST, Manifest } from "./manifest";
import { readTemplateFolder, readTemplateZip, type TemplateFiles } from "./reader";

/** An imported template waits this long for the maker to add it. */
const PENDING_MS = 30 * 60_000;

export class TemplateLibrary {
  private pending = new Map<string, { files: TemplateFiles; at: number }>();

  constructor(
    /** Upstart's own templates. */
    private readonly builtIn: string,
    /** The maker's imported templates. */
    private readonly imported: string,
  ) {}

  /** Every template, originals first, then the standard ones, each by name (Q264). */
  list(): TemplateSummary[] {
    const seen = new Set<string>();
    const all: TemplateSummary[] = [];
    for (const [root, imported] of [
      [this.builtIn, false],
      [this.imported, true],
    ] as const) {
      for (const id of folders(root)) {
        const summary = readSummary(join(root, id), imported);
        if (!summary || summary.id !== id || seen.has(id)) continue;
        seen.add(id);
        all.push(summary);
      }
    }
    return all.sort((a, b) => Number(b.original) - Number(a.original) || a.name.localeCompare(b.name));
  }

  /** A template's folder, by its id. */
  dir(id: string): string | undefined {
    if (!/^[a-z][a-z0-9-]{1,47}$/.test(id)) return undefined;
    for (const root of [this.builtIn, this.imported]) {
      const dir = join(root, id);
      if (existsSync(join(dir, MANIFEST))) return dir;
    }
    return undefined;
  }

  get(id: string): TemplateSummary | undefined {
    return this.list().find((t) => t.id === id);
  }

  /** Its cover or its hover sequence, as a data URL. */
  picture(id: string, which: "cover" | "hover"): string | null {
    const dir = this.dir(id);
    const file = dir && join(dir, "pictures", `${which}.webp`);
    if (!file || !existsSync(file)) return null;
    return `data:image/webp;base64,${readFileSync(file).toString("base64")}`;
  }

  /**
   * A folder or a .zip read as a template, to be added once the maker has seen
   * its name and pictures (Q248); or why it cannot be one: what the check
   * calls an error. Its scripts are not run until then.
   */
  read(path: string): TemplateImport {
    let files: TemplateFiles;
    try {
      files = statSync(path).isDirectory() ? readTemplateFolder(path) : readTemplateZip(readFileSync(path));
    } catch (error) {
      return { problems: [error instanceof Error ? error.message : String(error)] };
    }
    const check = checkTemplate(files);
    if (check.errors.length || !check.template) return { problems: check.errors };
    const { manifest, pictures } = check.template;
    if (this.dir(manifest.id) && !existsSync(join(this.imported, manifest.id, MANIFEST)))
      return { problems: [`Upstart already has a template named "${manifest.id}".`] };
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
    original: m.original,
    tags: m.tags,
    imported,
  };
}
