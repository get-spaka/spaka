// Where the runtime reads a project from. Paths are relative to the project
// folder, with forward slashes ("pages/index.liquid").

export interface ProjectSource {
  /** The file's text, or undefined when there is no such file. */
  read(path: string): string | undefined;
  /** Every file under `dir` (recursively), as project paths, sorted. */
  list(dir: string): string[];
}

/** A project held in memory, for tests and for runtimes without a disk. */
export function memorySource(files: Record<string, string>): ProjectSource {
  return {
    read: (path) => files[path],
    list: (dir) =>
      Object.keys(files)
        .filter((p) => p.startsWith(`${dir.replace(/\/$/, "")}/`))
        .sort(),
  };
}

/**
 * A project as it will be once the files being written are finished: those
 * files, held here, take the place of what is on disk (ADR 0009).
 */
export class Overlay implements ProjectSource {
  private readonly files = new Map<string, string>();

  constructor(private readonly base: ProjectSource) {}

  set(path: string, content: string) {
    this.files.set(path, content);
  }
  delete(path: string) {
    this.files.delete(path);
  }
  has(path: string) {
    return this.files.has(path);
  }
  get size() {
    return this.files.size;
  }
  paths() {
    return [...this.files.keys()];
  }

  read(path: string) {
    return this.files.has(path) ? this.files.get(path) : this.base.read(path);
  }
  list(dir: string) {
    const prefix = `${dir.replace(/\/$/, "")}/`;
    const all = new Set(this.base.list(dir));
    for (const path of this.files.keys()) if (path.startsWith(prefix)) all.add(path);
    return [...all].sort();
  }
}
