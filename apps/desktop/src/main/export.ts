// Exporting a project into a folder the maker picks, with one of the
// builders (Q181, Q186): the app knows only their common interface.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { BUILDERS, type BuildProject, builderById, collectedUse } from "@spaka/builder";
import { diskSource } from "@spaka/runtime/node";
import type { ExportResult, PublishInfo } from "../shared/ipc";
import { published } from "./history/history";
import { webpCopies } from "./media/library";
import { slug } from "./projects";

/** Marks a folder as an export of Spaka's, which a new export may replace. */
const MARKER = ".spaka-export";

/**
 * The folder the export goes into: the chosen one when it is empty or holds a
 * previous export, else a new folder inside it, so that nothing of the
 * maker's is ever overwritten, named after the website (its folder is
 * project-<random id>, Q410).
 */
export function exportFolder(chosen: string, projectDir: string, name: string): string {
  const usable = (dir: string) =>
    !existsSync(dir) || existsSync(join(dir, MARKER)) || readdirSync(dir).filter((f) => f !== ".DS_Store").length === 0;
  if (usable(chosen)) return chosen;
  const base = `${slug(name) || basename(projectDir)}-site`;
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
  /** The website's management token, made when a builder first needs it (Q191). */
  managementToken: () => string;
};

function buildProject(projectDir: string, name: string): BuildProject {
  return {
    name,
    source: diskSource(projectDir),
    files: listFiles(projectDir),
    readFile: (path: string) => readFileSync(join(projectDir, path)),
  };
}

/** The ways of exporting, as the Publish dialog lists them (Q181), and the forms that need a form service. */
export function publishChoices(projectDir: string, name: string): PublishInfo {
  const project = buildProject(projectDir, name);
  const use = collectedUse(project);
  return {
    choices: BUILDERS.map((b) => {
      const checked = b.check(project);
      return { id: b.id, needs: { ...b.needs }, ...(checked.ok ? {} : { refused: checked.refusal.datasources }) };
    }),
    forms: use.forms,
  };
}

export async function exportProject(projectDir: string, chosen: string, options: ExportOptions): Promise<ExportResult> {
  const builder = builderById(options.builder);
  if (!builder) throw new Error(`There is no ${options.builder} export.`);
  const project = buildProject(projectDir, options.name);
  const checked = builder.check(project);
  if (!checked.ok)
    throw new Error(
      `A static site cannot show what visitors send (${checked.refusal.datasources.join(", ")}): publish it on a server or on Cloudflare instead.`,
    );
  const folder = exportFolder(chosen, projectDir, options.name);
  // A previous export is replaced: no page that no longer exists is left behind.
  // What the maker wrote into its .env is given to the builder, which keeps it (Q556).
  let earlierEnv: string | undefined;
  if (existsSync(join(folder, MARKER))) {
    try {
      earlierEnv = readFileSync(join(folder, ".env"), "utf8");
    } catch {}
    for (const entry of readdirSync(folder))
      if (!KEPT.has(entry)) rmSync(join(folder, entry), { recursive: true, force: true });
  }
  mkdirSync(folder, { recursive: true });
  const result = await builder.build(project, {
    outDir: folder,
    images: webpCopies,
    ...(builder.server ? { serverBundle: readFileSync(join(options.hostsDir, builder.server), "utf8") } : {}),
    ...(options.formServices ? { formServices: options.formServices } : {}),
    ...(builder.needs.managementToken ? { managementToken: options.managementToken() } : {}),
    ...(builder.needs.managementToken && earlierEnv !== undefined ? { earlierEnv } : {}),
  });
  writeFileSync(join(folder, MARKER), "This folder was exported by Spaka. A new export replaces what it holds.\n");
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
