// Exporting a project as a static website into a folder the maker picks.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { buildStatic } from "@upstart/builder";
import { diskSource } from "@upstart/runtime/node";
import type { ExportResult } from "../shared/ipc";
import { tracked } from "./history/history";

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

export async function exportProject(projectDir: string, chosen: string): Promise<ExportResult> {
  const folder = exportFolder(chosen, projectDir);
  // A previous export is replaced as a whole: no page that no longer exists is left behind.
  if (existsSync(join(folder, MARKER)))
    for (const entry of readdirSync(folder)) rmSync(join(folder, entry), { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const files = listFiles(projectDir);
  const result = await buildStatic({
    source: diskSource(projectDir),
    outDir: folder,
    files,
    readFile: (path) => readFileSync(join(projectDir, path)),
  });
  writeFileSync(join(folder, MARKER), "This folder was exported by Upstart. A new export replaces what it holds.\n");
  return { folder, pages: result.pages, files: result.files.length, warnings: result.warnings };
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).split("\\").join("/");
      if (!tracked(rel)) continue;
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) out.push(rel);
    }
  };
  walk(root);
  return out;
}
