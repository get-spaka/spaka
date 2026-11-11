// The gallery's blocks (Q92): ready-made sections, shipped with the app in
// gallery/<kind>/<id>/, each a template (block.liquid) and what describes it
// (block.json), for the maker's Blocks tab and the agent's search (Q97, Q98).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { BLOCK_KINDS, type BlockKind, type GalleryBlock } from "../../shared/ipc";

const Described = z.object({
  name: z.string().min(1),
  kind: z.enum(BLOCK_KINDS),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  mood: z.array(z.string()).default([]),
  synonyms: z.array(z.string()).default([]),
});

export type Block = GalleryBlock & { source: string };

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
        const described = Described.parse(JSON.parse(readFileSync(join(folder, "block.json"), "utf8")));
        const source = readFileSync(join(folder, "block.liquid"), "utf8");
        out.push({ id: entry.name, ...described, source });
      } catch (error) {
        console.warn(`[upstart] gallery block ${entry.name} left out:`, error instanceof Error ? error.message : error);
      }
    }
  }
  const order = (kind: BlockKind) => BLOCK_KINDS.indexOf(kind);
  return out.sort((a, b) => order(a.kind) - order(b.kind) || a.name.localeCompare(b.name));
}

/** What the interface shows of a block: everything but its template. */
export function described({ source: _source, ...block }: Block): GalleryBlock {
  return block;
}
