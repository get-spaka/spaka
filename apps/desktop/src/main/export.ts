// Exporting a project into a folder the maker picks, with one of the
// builders (Q181, Q186): the app knows only their common interface.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { builderById } from "@upstart/builder";
import { diskSource } from "@upstart/runtime/node";
import type { ExportResult } from "../shared/ipc";
import { published } from "./history/history";
import { webpCopies } from "./media/library";

/** Marks a folder as an export of Upstart's, which a new export may replace. */
const MARKER = ".upstart-export";

/**
 * The folder the export goes into: the chosen one when it is empty or holds a
 * previous export, else a new folder inside it, so that nothing of the
 * maker's is ever overwritten.
 */
export function exportFolder(chosen: string, projectDir: string): string {
  const usable = (dir: string) =>
    !existsSync(dir) || existsSync(join(dir, MARKER)) || readdirSync(dir).filter((f) => f !== ".DS_Store").length === 0;
  if (usable(chosen)) return chosen;
  const base = `${basename(projectDir)}-site`;
  let folder = join(chosen, base);
  for (let n = 2; !usable(folder); n++) folder = join(chosen, `${base}-${n}`);
  return folder;
}

/**
 * What a new export keeps of the one it replaces: what a server keeps (its
 * SQLite records, run on this machine), what installing and deploying made,
 * and the Worker's configuration, which holds the database's id.
 */
const KEPT = new Set(["data", "node_modules", ".wrangler", ".git", "wrangler.jsonc"]);

export type ExportOptions = {
  builder: string;
  /** The website's name, for the names an export gives. */
  name: string;
  /** Where the app keeps the servers it ships (server.mjs, worker.mjs). */
  hostsDir: string;
  formServices?: Record<string, string>;
};

export async function exportProject(projectDir: string, chosen: string, options: ExportOptions): Promise<ExportResult> {
  const builder = builderById(options.builder);
  if (!builder) throw new Error(`There is no ${options.builder} export.`);
  const files = listFiles(projectDir);
  const project = {
    name: options.name,
    source: diskSource(projectDir),
    files,
    readFile: (path: string) => readFileSync(join(projectDir, path)),
  };
  const checked = builder.check(project);
  if (!checked.ok)
    throw new Error(
      `A static site cannot show what visitors send (${checked.refusal.datasources.join(", ")}): choose the Node or Cloudflare export.`,
    );
  const folder = exportFolder(chosen, projectDir);
  // A previous export is replaced: no page that no longer exists is left behind.
  if (existsSync(join(folder, MARKER)))
    for (const entry of readdirSync(folder))
      if (!KEPT.has(entry)) rmSync(join(folder, entry), { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const result = await builder.build(project, {
    outDir: folder,
    images: webpCopies,
    ...(builder.server ? { serverBundle: readFileSync(join(options.hostsDir, builder.server), "utf8") } : {}),
    ...(options.formServices ? { formServices: options.formServices } : {}),
  });
  writeFileSync(join(folder, MARKER), "This folder was exported by Upstart. A new export replaces what it holds.\n");
  return {
    folder,
    builder: builder.id,
    pages: result.pages,
    files: result.files.length,
    warnings: result.warnings,
    guide: builder.guide(result),
  };
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).split("\\").join("/");
      if (!published(rel)) continue;
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) out.push(rel);
    }
  };
  walk(root);
  return out;
}
