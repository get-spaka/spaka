// The gallery's blocks (Q92): ready-made sections, shipped with the app in
// gallery/<kind>/<id>/, each a template (block.liquid) and what describes it
// (block.json), for the maker's Blocks tab and the agent's search (Q97, Q98).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { BLOCK_KINDS, type BlockKind, type GalleryBlock } from "../../shared/ipc";

/** Where a block's layout comes from, and the licence file kept beside the gallery for it (Q195, Q202). */
export const BLOCK_SOURCES = {
  hyperui: "LICENSE-HyperUI",
  "meraki-ui": "LICENSE-Meraki-UI",
  "mamba-ui": "LICENSE-Mamba-UI",
  "wicked-blocks": "LICENSE-Wicked-Blocks",
  upstart: undefined,
} as const;

const Described = z.object({
  name: z.string().min(1),
  kind: z.enum(BLOCK_KINDS),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  mood: z.array(z.string()).default([]),
  synonyms: z.array(z.string()).default([]),
  source: z.enum(Object.keys(BLOCK_SOURCES) as [keyof typeof BLOCK_SOURCES]).default("upstart"),
  data: z
    .object({
      name: z.string().regex(/^[a-z][a-z0-9-]*$/),
      family: z.enum(["collection", "section"]),
    })
    .optional(),
});

/**
 * A block as the app holds it: its template, where its layout comes from and,
 * for a data block, its datasource's definition and sample records (the
 * files of its data/ folder, by name) and the detail section of its record
 * page, when its collection has one (Q199, Q200); a form's fragments, the one
 * its datasource answers with among them, by file name (Q194).
 */
export type Block = GalleryBlock & {
  source: string;
  origin: keyof typeof BLOCK_SOURCES;
  datasource?: { definition: string; records: Record<string, string> };
  detail?: string;
  fragments?: Record<string, string>;
};

const DEFINITION = "_datasource.yaml";

export class Gallery {
  private blocks: Block[] | undefined;

  constructor(private readonly dir: string) {}

  /** Every block, by kind in the gallery's order, then by name. Read once. */
  list(): Block[] {
    this.blocks ??= readGallery(this.dir);
    return this.blocks;
  }

  get(id: string): Block | undefined {
    return this.list().find((b) => b.id === id);
  }
}

/** The blocks of a gallery folder. A block that does not describe itself properly is left out, with a warning. */
export function readGallery(dir: string): Block[] {
  const out: Block[] = [];
  if (!existsSync(dir)) return out;
  for (const kind of readdirSync(dir, { withFileTypes: true })) {
    if (!kind.isDirectory()) continue;
    for (const entry of readdirSync(join(dir, kind.name), { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-z0-9-]+$/.test(entry.name)) continue;
      const folder = join(dir, kind.name, entry.name);
      try {
        const { source: origin, ...described } = Described.parse(
          JSON.parse(readFileSync(join(folder, "block.json"), "utf8")),
        );
        const source = readFileSync(join(folder, "block.liquid"), "utf8");
        const block: Block = { id: entry.name, ...described, source, origin };
        if (described.data) {
          const dataDir = join(folder, "data");
          if (!existsSync(join(dataDir, DEFINITION))) throw new Error(`data/${DEFINITION} is missing`);
          const records: Record<string, string> = {};
          for (const file of readdirSync(dataDir).sort()) {
            if (file.endsWith(".md")) records[file] = readFileSync(join(dataDir, file), "utf8");
          }
          block.datasource = { definition: readFileSync(join(dataDir, DEFINITION), "utf8"), records };
        }
        if (existsSync(join(folder, "detail.liquid")))
          block.detail = readFileSync(join(folder, "detail.liquid"), "utf8");
        const fragmentsDir = join(folder, "fragments");
        if (existsSync(fragmentsDir)) {
          const fragments: Record<string, string> = {};
          for (const file of readdirSync(fragmentsDir).sort())
            if (/^[a-z0-9][\w-]*\.liquid$/.test(file)) fragments[file] = readFileSync(join(fragmentsDir, file), "utf8");
          if (Object.keys(fragments).length) block.fragments = fragments;
        }
        out.push(block);
      } catch (error) {
        console.warn(`[upstart] gallery block ${entry.name} left out:`, error instanceof Error ? error.message : error);
      }
    }
  }
  const order = (kind: BlockKind) => BLOCK_KINDS.indexOf(kind);
  return out.sort((a, b) => order(a.kind) - order(b.kind) || a.name.localeCompare(b.name));
}

/** What the interface shows of a block: everything but its template. */
export function described(block: Block): GalleryBlock {
  const { id, kind, name, description, tags, mood, synonyms, data } = block;
  return { id, kind, name, description, tags, mood, synonyms, ...(data ? { data } : {}) };
}
