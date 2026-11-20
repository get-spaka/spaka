// Projects: folders of plain files (ADR 0001). What belongs to a project
// travels in its hidden .upstart/ folder; what belongs to this machine (where
// the folder is, when it was last opened) is kept in the app's own data.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { AgentMode, Effort, ListedProject, ProjectInfo } from "../shared/ipc";
import { replaceFile } from "./replace-file";

export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_EFFORT: Effort = "high";

/** .upstart/project.json */
export type ProjectFile = {
  id: string;
  name: string;
  model: string;
  effort: Effort;
  siteUrl?: string;
  /** Where each collected datasource's form sends in a static export: a form service's address (Q178). */
  formServices?: Record<string, string>;
  /** The template the website started from, if any (Q245). */
  template?: { id: string; version: string };
  /** The Build / Plan selector, kept for the website (Q296); Build when absent. */
  mode?: AgentMode;
};

/** `createdAt` is missing from the entries kept before Q394: the folder's own creation stands for it. */
type Entry = { id: string; path: string; name: string; openedAt: number; createdAt?: number };

export class Projects {
  private readonly registryFile: string;

  constructor(
    private readonly dataDir: string,
    private readonly projectsDir: string,
  ) {
    this.registryFile = join(dataDir, "projects.json");
  }

  /**
   * Known projects whose folder still exists, the one whose website changed
   * last first (Q393); the sidebar orders them as the maker chose.
   */
  list(): ListedProject[] {
    return this.entries()
      .filter((e) => existsSync(e.path))
      .map(({ id, name, path, createdAt }) => {
        const created = createdAt ?? bornAt(path);
        return { id, name, path, createdAt: created, updatedAt: this.changedAt(id) ?? created };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** When the project's website last changed: its history's latest snapshot, if it has one. */
  private changedAt(id: string): number | undefined {
    try {
      return statSync(join(this.dataDir, "projects", id, "history", "snapshots.json")).mtimeMs;
    } catch {
      return undefined;
    }
  }

  /** A new, empty project folder in the projects folder, named after `name`. */
  create(name: string): ProjectInfo {
    mkdirSync(this.projectsDir, { recursive: true });
    const base = slug(name) || "website";
    let folder = join(this.projectsDir, base);
    for (let n = 2; existsSync(folder); n++) folder = join(this.projectsDir, `${base}-${n}`);
    mkdirSync(folder, { recursive: true });
    const file: ProjectFile = {
      id: randomUUID(),
      name: name.trim() || "Untitled website",
      model: DEFAULT_MODEL,
      effort: DEFAULT_EFFORT,
    };
    writeProjectFile(folder, file);
    return this.remember(folder, file);
  }

  /** Opens a known project by its identifier. */
  open(id: string): ProjectInfo {
    const entry = this.entries().find((e) => e.id === id);
    if (!entry || !existsSync(entry.path)) throw new Error("This project's folder is no longer where it was.");
    return this.openFolder(entry.path);
  }

  /**
   * Opens any folder as a project. A folder without .upstart/ becomes one. A
   * folder that is a copy of a project known here (same identifier, other
   * place, original still there) gets an identifier of its own, so that it
   * starts without the original's history and conversation.
   */
  openFolder(path: string): ProjectInfo {
    const folder = resolve(path);
    let file = readProjectFile(folder);
    if (!file) {
      file = { id: randomUUID(), name: basename(folder), model: DEFAULT_MODEL, effort: DEFAULT_EFFORT };
      writeProjectFile(folder, file);
    } else {
      const known = this.entries().find((e) => e.id === file!.id);
      if (known && resolve(known.path) !== folder && existsSync(known.path)) {
        file = { ...file, id: randomUUID() };
        writeProjectFile(folder, file);
      }
    }
    return this.remember(folder, file);
  }

  /** Changes what .upstart/project.json says (the name, the model, the effort). */
  update(id: string, change: Partial<Omit<ProjectFile, "id">>): ProjectInfo {
    const entry = this.entries().find((e) => e.id === id);
    if (!entry) throw new Error("Unknown project");
    const file = readProjectFile(entry.path);
    if (!file) throw new Error("This folder is no longer a project.");
    const next = { ...file, ...change, id: file.id };
    writeProjectFile(entry.path, next);
    return this.remember(entry.path, next);
  }

  /** Where this machine keeps what belongs to a project but not to its folder. */
  dataFor(id: string): string {
    const dir = join(this.dataDir, "projects", id);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  private remember(folder: string, file: ProjectFile): ProjectInfo {
    const all = this.entries();
    const known = all.find((e) => e.id === file.id);
    const entries = all.filter((e) => e.id !== file.id && resolve(e.path) !== folder);
    // Strictly after every other, even within the same millisecond.
    const latest = Math.max(0, ...entries.map((e) => e.openedAt));
    const now = Math.max(Date.now(), latest + 1);
    entries.push({
      id: file.id,
      path: folder,
      name: file.name,
      openedAt: now,
      createdAt: known ? (known.createdAt ?? bornAt(known.path)) : now,
    });
    this.save(entries);
    return { ...file, path: folder };
  }

  private entries(): Entry[] {
    try {
      return JSON.parse(readFileSync(this.registryFile, "utf8")) as Entry[];
    } catch {
      return [];
    }
  }

  private save(entries: Entry[]) {
    mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${this.registryFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(entries, null, 2));
    replaceFile(tmp, this.registryFile);
  }
}

/** When a folder was made, where the file system knows it; else when it last changed. */
function bornAt(path: string): number {
  try {
    const stat = statSync(path);
    return stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs;
  } catch {
    return 0;
  }
}

export function readProjectFile(folder: string): ProjectFile | undefined {
  try {
    const raw = JSON.parse(readFileSync(join(folder, ".upstart", "project.json"), "utf8"));
    if (typeof raw?.id !== "string") return undefined;
    return {
      id: raw.id,
      name: typeof raw.name === "string" ? raw.name : basename(folder),
      model: typeof raw.model === "string" ? raw.model : DEFAULT_MODEL,
      effort: isEffort(raw.effort) ? raw.effort : DEFAULT_EFFORT,
      ...(typeof raw.siteUrl === "string" && raw.siteUrl ? { siteUrl: raw.siteUrl } : {}),
      ...(formServices(raw.formServices) ? { formServices: formServices(raw.formServices) } : {}),
      ...(raw.mode === "plan" ? { mode: "plan" as const } : {}),
    };
  } catch {
    return undefined;
  }
}

function formServices(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const kept = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && !!entry[1],
  );
  return kept.length ? Object.fromEntries(kept) : undefined;
}

function writeProjectFile(folder: string, file: ProjectFile) {
  mkdirSync(join(folder, ".upstart"), { recursive: true });
  writeFileSync(join(folder, ".upstart", "project.json"), `${JSON.stringify(file, null, 2)}\n`);
}

export function isEffort(value: unknown): value is Effort {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "max";
}

/** A folder name from a project's name: lowercase ASCII words joined by dashes. */
export function slug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}
