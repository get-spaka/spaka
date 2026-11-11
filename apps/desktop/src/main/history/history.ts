// A project's history (decisions, Q84): snapshots of its files kept in the
// app's data, linked to the project by its identifier, without git. Each file
// is stored once per content, under its hash; a snapshot lists which content
// each path had. Going back to a snapshot adds a new one: the line stays single.
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

/** "hand": an edit the maker made in the preview, written by the app (Q94). */
export type SnapshotKind = "start" | "turn" | "outside" | "restore" | "hand";

export type Snapshot = {
  id: string;
  at: number;
  kind: SnapshotKind;
  /** What led to it: the maker's message; for a restore, the label of the snapshot gone back to. */
  label: string;
  /** For a restore: the snapshot gone back to. */
  from?: string;
  files: Record<string, string>;
};

/** What the history keeps out: Upstart's own folder, hidden files, installed packages. */
export function tracked(path: string): boolean {
  return !path.split("/").some((part) => part.startsWith(".") || part === "node_modules");
}

export class History {
  private readonly objects: string;
  private readonly index: string;
  private cache: Snapshot[] | undefined;

  constructor(
    dataDir: string,
    private readonly projectDir: string,
  ) {
    const dir = join(dataDir, "history");
    this.objects = join(dir, "objects");
    this.index = join(dir, "snapshots.json");
  }

  list(): Snapshot[] {
    if (!this.cache) {
      try {
        this.cache = JSON.parse(readFileSync(this.index, "utf8")) as Snapshot[];
      } catch {
        this.cache = [];
      }
    }
    return this.cache;
  }

  /** The project's files as they are on disk, as path → content hash. */
  scan(): Record<string, string> {
    const files: Record<string, string> = {};
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name);
        const rel = relative(this.projectDir, abs).split("\\").join("/");
        if (!tracked(rel)) continue;
        if (entry.isDirectory()) walk(abs);
        else if (entry.isFile()) files[rel] = this.store(readFileSync(abs));
      }
    };
    if (existsSync(this.projectDir)) walk(this.projectDir);
    return files;
  }

  /**
   * Takes a snapshot of the files as they are, unless nothing changed since
   * the last one. Returns the new snapshot, or undefined.
   */
  snapshot(kind: SnapshotKind, label: string): Snapshot | undefined {
    const files = this.scan();
    const last = this.list().at(-1);
    if (last && same(last.files, files)) return undefined;
    // An empty folder before anything was written is not worth a snapshot.
    if (!last && Object.keys(files).length === 0 && kind !== "turn") return undefined;
    const snapshot: Snapshot = { id: randomUUID(), at: Date.now(), kind, label, files };
    this.save([...this.list(), snapshot]);
    return snapshot;
  }

  /** Puts the project's files back as a snapshot had them, and records it as a new snapshot. */
  restore(id: string): Snapshot {
    const target = this.list().find((s) => s.id === id);
    if (!target) throw new Error("This version is no longer in the history.");
    // What the maker changed by hand since the last snapshot is kept too.
    this.snapshot("outside", "Changes made outside Upstart");
    const now = this.scan();
    for (const [path, hash] of Object.entries(target.files)) {
      if (now[path] === hash) continue;
      const abs = join(this.projectDir, path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, readFileSync(join(this.objects, hash)));
    }
    for (const path of Object.keys(now)) {
      if (path in target.files) continue;
      rmSync(join(this.projectDir, path), { force: true });
      this.removeEmptyParents(dirname(join(this.projectDir, path)));
    }
    const snapshot: Snapshot = {
      id: randomUUID(),
      at: Date.now(),
      kind: "restore",
      label: target.label,
      from: target.id,
      files: { ...target.files },
    };
    this.save([...this.list(), snapshot]);
    return snapshot;
  }

  /** A file as it was after the first turn of the agent that wrote it. */
  firstByAgent(path: string): string | undefined {
    const hash = this.list().find((s) => s.kind === "turn" && path in s.files)?.files[path];
    if (!hash) return undefined;
    try {
      return readFileSync(join(this.objects, hash), "utf8");
    } catch {
      return undefined;
    }
  }

  /** The snapshot an "undo" goes back to: the one before the last change. */
  undoTarget(): Snapshot | undefined {
    const list = this.list();
    const current = this.scan();
    const last = list.at(-1);
    // Changes since the last snapshot are undone first.
    if (last && !same(last.files, current)) return last;
    for (let i = list.length - 2; i >= 0; i--) if (!same(list[i]!.files, current)) return list[i];
    return undefined;
  }

  private store(content: Buffer): string {
    const hash = createHash("sha256").update(content).digest("hex");
    const file = join(this.objects, hash);
    if (!existsSync(file)) {
      mkdirSync(this.objects, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, content);
      renameSync(tmp, file);
    }
    return hash;
  }

  private save(list: Snapshot[]) {
    mkdirSync(dirname(this.index), { recursive: true });
    const tmp = `${this.index}.tmp`;
    writeFileSync(tmp, JSON.stringify(list));
    renameSync(tmp, this.index);
    this.cache = list;
  }

  private removeEmptyParents(dir: string) {
    while (dir.startsWith(this.projectDir) && dir !== this.projectDir) {
      try {
        if (readdirSync(dir).length || !statSync(dir).isDirectory()) return;
        rmdirSync(dir);
      } catch {
        return;
      }
      dir = dirname(dir);
    }
  }
}

function same(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}
