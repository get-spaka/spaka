// Applies the maker's own edits to the open project (decisions, Q90, Q91,
// Q94): checks that the agent is not working, writes the file, takes a
// snapshot for each action, and keeps a note of it for the agent's next
// message. The text changes themselves are in edits.ts.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { locate, sections } from "@upstart/runtime";
import type { EditAction, EditInfo } from "../../shared/ipc";
import { en } from "../../shared/strings/en";
import {
  copyName,
  duplicateRange,
  EditRefused,
  editText,
  includeAt,
  insertBefore,
  moveSection,
  pagesUsing,
  removeRange,
  renameInclude,
  setLink,
  targetAt,
} from "./edits";

/** The index of the section starting at `at` among a page's sections; their count for null. */
function sectionIndex(src: string, at: number | null): number {
  const list = sections(src);
  if (at === null) return list.length;
  const index = list.findIndex((s) => s.outer.start === at);
  if (index < 0) throw new EditRefused("This section has moved since it was shown.");
  return index;
}

/** A template the maker may edit: a page, a shared part or a fragment. */
const EDITABLE = /^(pages|parts|fragments)\/[\w./-]+\.liquid$/;

export type EditorDeps = {
  /** The open project's folder. */
  root: () => string | undefined;
  /** Whether the agent is in the middle of a turn: editing waits (Q91). */
  busy: () => boolean;
  /** Called before anything is written: what changed outside the app gets its own snapshot first. */
  before: () => void;
  /** Called once a change is on the disk, with what it was, for the history and the agent. */
  changed: (change: { label: string; files: string[] }) => void;
};

export class Editor {
  constructor(private readonly deps: EditorDeps) {}

  apply(action: EditAction): { label: string; files: string[] } {
    if (this.deps.busy()) throw new EditRefused(en.editing.busy);
    this.deps.before();
    const t = en.editing.labels;
    const src = this.read(action.file);
    const writes: Record<string, string> = {};
    let label: string;
    switch (action.type) {
      case "text":
        writes[action.file] = editText(src, action.at, action.texts, action.tags);
        label = t.text;
        break;
      case "link":
        writes[action.file] = setLink(src, action.at, action.href);
        label = t.link;
        break;
      case "delete":
        writes[action.file] = removeRange(src, targetAt(src, action.at).range);
        label = t.deleted;
        break;
      case "duplicate": {
        const target = targetAt(src, action.at);
        if (target.include) {
          // A shared part's copy is a part of its own (Q103).
          const name = copyName(target.include, (n) => existsSync(this.abs(`parts/${n}.liquid`)));
          writes[`parts/${name}.liquid`] = this.read(`parts/${target.include}.liquid`);
          const tag = src.slice(target.range.start, target.range.end);
          writes[action.file] = duplicateRange(src, target.range, renameInclude(tag, name));
        } else writes[action.file] = duplicateRange(src, target.range);
        label = t.duplicated;
        break;
      }
      case "move":
        writes[action.file] = moveSection(src, sectionIndex(src, action.at), sectionIndex(src, action.before));
        label = t.moved;
        break;
      case "insert": {
        // A gallery block, already copied as a shared part (Q101).
        if (!existsSync(this.abs(`parts/${action.part}.liquid`))) throw new EditRefused("This block is missing.");
        writes[action.file] = insertBefore(src, sectionIndex(src, action.before), `{% render '${action.part}' %}`);
        label = t.inserted;
        break;
      }
    }
    for (const [file, content] of Object.entries(writes)) this.write(file, content);
    const change = { label, files: Object.keys(writes) };
    this.deps.changed(change);
    return change;
  }

  /** What the preview needs to know before the maker edits an element. */
  info(file: string, at: number): EditInfo {
    const src = this.read(file);
    const include = includeAt(src, at);
    const el = include ? undefined : locate(src, at);
    const part = /^parts\/(.+)\.liquid$/.exec(file)?.[1];
    return {
      text: el ? !el.notEditable : false,
      computed: el?.notEditable === "liquid",
      movable: include ? true : !!el && !el.inLoop && el.whole,
      sharedBy: part ? pagesUsing(part, this.templates()) : 0,
    };
  }

  /** Every template of the project, path → text, to find what uses a part. */
  private templates(): Record<string, string> {
    const root = this.deps.root();
    const out: Record<string, string> = {};
    if (!root) return out;
    for (const dir of ["pages", "parts"]) {
      const walk = (rel: string) => {
        const abs = join(root, rel);
        if (!existsSync(abs)) return;
        for (const entry of readdirSync(abs, { withFileTypes: true })) {
          const path = `${rel}/${entry.name}`;
          if (entry.isDirectory()) walk(path);
          else if (entry.name.endsWith(".liquid")) out[path] = readFileSync(join(root, path), "utf8");
        }
      };
      walk(dir);
    }
    return out;
  }

  private abs(file: string): string {
    const root = this.deps.root();
    if (!root) throw new EditRefused("No project is open.");
    if (!EDITABLE.test(file) || file.split("/").includes("..")) throw new EditRefused("This file cannot be edited.");
    return join(root, file);
  }

  private read(file: string): string {
    try {
      return readFileSync(this.abs(file), "utf8");
    } catch (error) {
      if (error instanceof EditRefused) throw error;
      throw new EditRefused("This file has changed since it was shown.");
    }
  }

  /** Atomic: the preview and the agent never see half a file. The temporary file is hidden, so nothing follows it. */
  private write(file: string, content: string) {
    const abs = this.abs(file);
    mkdirSync(dirname(abs), { recursive: true });
    const tmp = join(dirname(abs), `.${basename(abs)}.upstart-tmp`);
    writeFileSync(tmp, content);
    renameSync(tmp, abs);
  }
}
