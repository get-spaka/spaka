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
  spaka: undefined,
} as const;

const Described = z.object({
  name: z.string().min(1),
  kind: z.enum(BLOCK_KINDS),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  mood: z.array(z.string()).default([]),
  synonyms: z.array(z.string()).default([]),
  source: z.enum(Object.keys(BLOCK_SOURCES) as [keyof typeof BLOCK_SOURCES]).default("spaka"),
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

/**
 * The blocks a project can use (Q235): its own, in its blocks/ folder (the
 * design of the template it started from), first, then the gallery's. The
 * project's are read again when a file of blocks/ changes.
 */
export class ProjectBlocks {
  private design: { root: string; blocks: Block[] } | undefined;
  private merged: { design: Block[]; blocks: Block[] } | undefined;

  constructor(
    private readonly gallery: Gallery,
    private readonly root: () => string | undefined,
  ) {}

  /** The project's own blocks, marked as its design. */
  designBlocks(): Block[] {
    const root = this.root();
    if (!root) return [];
    if (this.design?.root !== root) {
      const { blocks, skipped } = readBlocks(diskTree(join(root, "blocks")));
      for (const { id, problem } of skipped) console.warn(`[spaka] the project's block ${id} left out: ${problem}`);
      this.design = { root, blocks: blocks.map((b) => ({ ...b, design: true })) };
    }
    return this.design.blocks;
  }

  /** Every block: the project's first, then the gallery's, a gallery block of the same id left out. */
  list(): Block[] {
    const design = this.designBlocks();
    if (this.merged?.design !== design) {
      const ids = new Set(design.map((b) => b.id));
      this.merged = { design, blocks: [...design, ...this.gallery.list().filter((b) => !ids.has(b.id))] };
    }
    return this.merged.blocks;
  }

  get(id: string): Block | undefined {
    return this.list().find((b) => b.id === id);
  }

  /** A file of the project changed: under blocks/, its blocks are read again. */
  changed(path: string) {
    if (path === "blocks" || path.startsWith("blocks/")) this.design = undefined;
  }
}

/** Where blocks are read from: a folder on disk, or a template's files held in memory. */
export type BlockTree = {
  /** The entries of a folder, `kind` and `id` folders among them. */
  entries(dir: string): { name: string; folder: boolean }[];
  read(path: string): string | undefined;
};

/** A folder on disk as a block tree. */
export function diskTree(root: string): BlockTree {
  return {
    entries: (dir) => {
      const abs = join(root, dir);
      if (!existsSync(abs)) return [];
      return readdirSync(abs, { withFileTypes: true }).map((e) => ({ name: e.name, folder: e.isDirectory() }));
    },
    read: (path) => {
      try {
        return readFileSync(join(root, path), "utf8");
      } catch {
        return undefined;
      }
    },
  };
}

/** Files held by path as a block tree, under `prefix` ("blocks/"). */
export function filesTree(files: Map<string, Buffer>, prefix: string): BlockTree {
  return {
    entries: (dir) => {
      const base = `${prefix}${dir ? `${dir}/` : ""}`;
      const seen = new Map<string, boolean>();
      for (const path of files.keys()) {
        if (!path.startsWith(base)) continue;
        const [name, ...rest] = path.slice(base.length).split("/");
        if (name) seen.set(name, (seen.get(name) ?? false) || rest.length > 0);
      }
      return [...seen].map(([name, folder]) => ({ name, folder }));
    },
    read: (path) => files.get(`${prefix}${path}`)?.toString("utf8"),
  };
}

/** The blocks of a gallery folder. A block that does not describe itself properly is left out, with a warning. */
export function readGallery(dir: string): Block[] {
  const { blocks, skipped } = readBlocks(diskTree(dir));
  for (const { id, problem } of skipped) console.warn(`[spaka] gallery block ${id} left out: ${problem}`);
  return blocks;
}

/** The blocks of a tree, and those left out for not describing themselves properly, with why. */
export function readBlocks(tree: BlockTree): { blocks: Block[]; skipped: { id: string; problem: string }[] } {
  const out: Block[] = [];
  const skipped: { id: string; problem: string }[] = [];
  const sorted = (dir: string) => tree.entries(dir).sort((a, b) => a.name.localeCompare(b.name));
  for (const kind of sorted("")) {
    if (!kind.folder) continue;
    for (const entry of sorted(kind.name)) {
      if (!entry.folder || !/^[a-z0-9-]+$/.test(entry.name)) continue;
      const folder = `${kind.name}/${entry.name}`;
      const read = (file: string) => tree.read(`${folder}/${file}`);
      try {
        const json = read("block.json");
        if (json === undefined) throw new Error("block.json is missing");
        const { source: origin, ...described } = Described.parse(JSON.parse(json));
        if (described.kind !== kind.name) throw new Error(`its kind is ${described.kind}, in a ${kind.name} folder`);
        const source = read("block.liquid");
        if (source === undefined) throw new Error("block.liquid is missing");
        const block: Block = { id: entry.name, ...described, source, origin };
        if (described.data) {
          const definition = read(`data/${DEFINITION}`);
          if (definition === undefined) throw new Error(`data/${DEFINITION} is missing`);
          const records: Record<string, string> = {};
          for (const file of sorted(`${folder}/data`).map((e) => e.name))
            if (file.endsWith(".md")) records[file] = read(`data/${file}`) ?? "";
          block.datasource = { definition, records };
        }
        const detail = read("detail.liquid");
        if (detail !== undefined) block.detail = detail;
        const fragments: Record<string, string> = {};
        for (const file of sorted(`${folder}/fragments`).map((e) => e.name))
          if (/^[a-z0-9][\w-]*\.liquid$/.test(file)) fragments[file] = read(`fragments/${file}`) ?? "";
        if (Object.keys(fragments).length) block.fragments = fragments;
        out.push(block);
      } catch (error) {
        const problem =
          error instanceof z.ZodError
            ? error.issues.map((i) => `${i.path.join(".") || "block.json"}: ${i.message}`).join("; ")
            : error instanceof Error
              ? error.message
              : String(error);
        skipped.push({ id: entry.name, problem });
      }
    }
  }
  const order = (kind: BlockKind) => BLOCK_KINDS.indexOf(kind);
  return { blocks: out.sort((a, b) => order(a.kind) - order(b.kind) || a.name.localeCompare(b.name)), skipped };
}

/** What the interface shows of a block: everything but its template. */
export function described(block: Block): GalleryBlock {
  const { id, kind, name, description, tags, mood, synonyms, data, design } = block;
  return {
    id,
    kind,
    name,
    description,
    tags,
    mood,
    synonyms,
    ...(data ? { data } : {}),
    ...(design ? { design } : {}),
  };
}
