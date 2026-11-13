// The agent's use_block tool on disk (Q213-Q217): the placing written into
// the project during the agent's turn, as use_image writes its image, and the
// sample records it wrote noted in .upstart/, so that those the agent leaves
// as the gallery wrote them are named to it before its turn ends.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  Datasources,
  DEFINITION_FILE,
  readRecordFile,
  recordFile,
  recordIdFrom,
  recordOf,
  renameInOrder,
  titleField,
} from "@upstart/runtime";
import { diskSource } from "@upstart/runtime/node";
import { type DroppedBlock, NAVIGATION, type ProjectView } from "./data-drop";
import { type Placement, placementsOf } from "./pending";
import { type Placing, placeBlocks, placedAnswer } from "./place-blocks";

/** path → hash of the text the gallery wrote. */
export const GALLERY_SAMPLES = ".upstart/gallery-samples.json";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/** The project folder, read only, as a dropped block's datasource needs to see it. */
export function diskView(root: string): ProjectView {
  const at = (path: string) => (path.split("/").includes("..") ? undefined : join(root, path));
  return {
    exists: (path) => {
      const abs = at(path);
      return !!abs && existsSync(abs);
    },
    read: (path) => {
      const abs = at(path);
      return abs && existsSync(abs) && statSync(abs).isFile() ? readFileSync(abs, "utf8") : undefined;
    },
    templates: () => projectTemplates(root),
  };
}

/** Every template of the project, path → text. */
export function projectTemplates(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const path = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".liquid")) out[path] = readFileSync(join(root, path), "utf8");
    }
  };
  walk("pages");
  walk("parts");
  return out;
}

function readSamples(root: string): Record<string, string> {
  try {
    const raw = JSON.parse(readFileSync(join(root, GALLERY_SAMPLES), "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writeSamples(root: string, samples: Record<string, string>): void {
  mkdirSync(join(root, ".upstart"), { recursive: true });
  writeFileSync(join(root, GALLERY_SAMPLES), `${JSON.stringify(samples, null, 2)}\n`);
}

/**
 * Places the blocks, writes them into the project, and answers the agent,
 * with the sample records written; a refusal is answered too, nothing written.
 */
export function useBlocks(
  root: string,
  input: Placing,
  block: (id: string) => DroppedBlock | undefined,
): { text: string; samples: string[]; placements: Placement[] } {
  let placed: ReturnType<typeof placeBlocks>;
  try {
    placed = placeBlocks(input, diskView(root), block);
  } catch (error) {
    return { text: (error as Error).message, samples: [], placements: [] };
  }
  for (const [path, text] of Object.entries(placed.writes)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  if (placed.samples.length) {
    const samples = readSamples(root);
    for (const path of placed.samples) samples[path] = hash(placed.writes[path]!);
    writeSamples(root, samples);
  }
  return { text: placedAnswer(input, placed), samples: placed.samples, placements: placementsOf(placed) };
}

/**
 * The samples the agent rewrote but left under the sample's name, renamed
 * after their title (Q218): a record's file name is its page's address. Its
 * place in the manual order and the links to its old address follow.
 * Answers "from → to" for each.
 */
export function nameRecords(root: string): string[] {
  const samples = readSamples(root);
  const sources = new Datasources(diskSource(root));
  const templates = projectTemplates(root);
  const done: string[] = [];
  const links: [string, string][] = [];
  for (const [path, sum] of Object.entries(samples)) {
    const of = recordOf(path);
    const abs = join(root, path);
    if (!of || of.datasource === NAVIGATION || !existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    if (hash(text) === sum) continue; // still the sample: named to the agent instead (Q217)
    const title = readRecordFile(text).values[titleField(sources.definition(of.datasource).definition)];
    if (typeof title !== "string" || !title.trim()) continue;
    const id = recordIdFrom(title, (i) => i !== of.id && existsSync(join(root, recordFile(of.datasource, i))));
    if (id === of.id) continue;
    const to = recordFile(of.datasource, id);
    writeFileSync(join(root, to), text);
    rmSync(abs);
    delete samples[path];
    const definition = join(root, "data", of.datasource, DEFINITION_FILE);
    if (existsSync(definition)) {
      const before = readFileSync(definition, "utf8");
      const after = renameInOrder(before, of.id, id);
      if (after !== before) writeFileSync(definition, after);
    }
    // Its page's address, where the site has a page per record of this datasource.
    for (const page of Object.keys(templates)) {
      const m = new RegExp(`^pages/(.+)/\\[${of.datasource}\\]\\.liquid$`).exec(page);
      if (m) links.push([`/${m[1]}/${of.id}`, `/${m[1]}/${id}`]);
    }
    done.push(`${path} → ${to}`);
  }
  if (!done.length) return done;
  writeSamples(root, samples);
  if (links.length) {
    const files = [...Object.keys(projectTemplates(root)), ...dataFiles(root)];
    for (const file of files) {
      const abs = join(root, file);
      const before = readFileSync(abs, "utf8");
      let after = before;
      for (const [from, to] of links)
        after = after.replace(new RegExp(`${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "g"), to);
      if (after !== before) writeFileSync(abs, after);
    }
  }
  return done;
}

/** The records of every datasource, as project paths. */
function dataFiles(root: string): string[] {
  const data = join(root, "data");
  if (!existsSync(data)) return [];
  return readdirSync(data, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .flatMap((d) =>
      readdirSync(join(data, d.name))
        .filter((f) => f.endsWith(".md"))
        .map((f) => `data/${d.name}/${f}`),
    );
}

/** The sample records still as the gallery wrote them; those changed or deleted are forgotten. */
export function unchangedSamples(root: string): string[] {
  const samples = readSamples(root);
  const still: Record<string, string> = {};
  for (const [path, sum] of Object.entries(samples)) {
    const abs = join(root, path);
    if (existsSync(abs) && hash(readFileSync(abs, "utf8")) === sum) still[path] = sum;
  }
  if (Object.keys(still).length !== Object.keys(samples).length) writeSamples(root, still);
  return Object.keys(still).sort();
}

/** What the agent is told when its turn would end with samples left (Q217). */
export function samplesLeftNote(paths: string[]): string {
  return `These records are still the gallery's samples, as use_block wrote them: ${paths.join(", ")}. Write this site's own records in their place, or delete those the site does not need, before you finish.`;
}
