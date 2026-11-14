// Follows what the agent is writing, before it reaches the disk (ADR 0009):
// the unfinished content of each Write, Edit or Append goes into the overlay
// in front of the project's files, and the preview renders it. Once the tool
// has written the file, and no other call on it is pending, the overlay lets
// the disk show through again. An Append (Gemini's long files, in parts,
// ADR 0012) adds to what is shown of its file: the part of a Write before it
// in the same reply, not yet on the disk, or the disk.
import { realpathSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { repairTemplate } from "@upstart/runtime";
import type { AgentEvent } from "../agent/stream";

export type TapTarget = {
  /** The project's folder. */
  root: string;
  /** The file as the disk has it, before the call. */
  read(rel: string): string | undefined;
  /** Shows an unfinished file; undefined lets the disk show through again. */
  set(rel: string, content: string | undefined): void;
  /** Asks for a new rendering; `final` once the files are complete. */
  changed(final: boolean): void;
  /** The agent started writing this file. */
  follow(rel: string): void;
};

type Call = { name: string; rel?: string; base?: string; shown?: boolean };

/** The calls that write a file, by their canonical names. */
const WRITES = ["Write", "Edit", "Append"];

export class FileTap {
  private readonly calls = new Map<string, Call>();
  private readonly roots: string[];

  constructor(private readonly target: TapTarget) {
    let real = target.root;
    try {
      real = realpathSync(target.root);
    } catch {}
    this.roots = [...new Set([target.root, real])];
  }

  handle(e: AgentEvent) {
    switch (e.kind) {
      case "tool-start":
        this.calls.set(e.id, { name: e.name });
        return;
      case "tool-input":
      case "tool-input-end": {
        const call = this.calls.get(e.id);
        if (!call || !WRITES.includes(call.name)) return;
        const fields = e.kind === "tool-input" ? e.fields : strings(e.input);
        const done = e.kind === "tool-input" ? e.done : allDone(fields);
        if (!call.rel && done.file_path) call.rel = this.rel(fields.file_path);
        if (!call.rel) return;
        if (call.name !== "Write") call.base ??= this.target.read(call.rel) ?? "";
        const content =
          call.name === "Write"
            ? fields.content
            : call.name === "Append"
              ? fields.content === undefined
                ? undefined
                : call.base! + fields.content
              : editPreview(call.base!, call.rel, fields, done);
        if (content === undefined) return;
        // Shown first, so that a new page exists when the preview moves to it.
        this.target.set(call.rel, content);
        if (!call.shown) {
          call.shown = true;
          this.target.follow(call.rel);
        }
        this.target.changed(false);
        return;
      }
      case "tool-result":
      case "permission-denied": {
        const call = this.calls.get(e.id);
        this.calls.delete(e.id);
        if (!call) return;
        // Written (or refused): the disk has the last word, once no other call on the file is pending.
        if (call.rel && call.shown && !this.pendingOn(call.rel)) this.target.set(call.rel, undefined);
        // A shell command may have changed any file.
        if (call.shown || call.name === "Bash") this.target.changed(true);
        return;
      }
      case "result": {
        // A turn that ended in the middle of a call leaves nothing unfinished on screen.
        for (const call of this.calls.values()) if (call.rel && call.shown) this.target.set(call.rel, undefined);
        this.calls.clear();
        this.target.changed(true);
        return;
      }
    }
  }

  private pendingOn(rel: string) {
    for (const call of this.calls.values()) if (call.rel === rel && call.shown) return true;
    return false;
  }

  private rel(file: string | undefined): string | undefined {
    if (!file) return undefined;
    if (!isAbsolute(file)) return file.split("\\").join("/");
    for (const root of this.roots) {
      const rel = relative(root, file);
      if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel.split("\\").join("/");
    }
    return undefined;
  }
}

/**
 * The content a file will have once an Edit under way is complete, given the
 * part of its input received so far (from the live-generation spike).
 */
export function editPreview(
  base: string,
  rel: string,
  fields: Record<string, string>,
  done: Record<string, boolean>,
): string | undefined {
  if (!done.old_string || fields.new_string === undefined || fields.old_string === undefined) return undefined;
  const at = base.indexOf(fields.old_string);
  if (at < 0) return undefined;
  let piece = fields.new_string;
  if (!done.new_string) {
    // The new text lands in the middle of the file: close what it leaves open
    // before the rest of the file follows, or the next section is drawn inside
    // the unfinished one. A stylesheet is shown once the new text is complete.
    if (!/\.(liquid|html)$/.test(rel)) return undefined;
    piece = repairTemplate(piece).src;
    // An insertion is usually written as "the new text, then the old text
    // again", the old text often an anchor cut in the middle of a tag. Until
    // the new text is complete, keep the old text after it, unless the new
    // text visibly starts by repeating the old one.
    const probe = Math.min(fields.old_string.length, fields.new_string.length, 12);
    const repeatsOld = probe > 0 && fields.new_string.slice(0, probe) === fields.old_string.slice(0, probe);
    if (!repeatsOld) return base.slice(0, at) + piece + base.slice(at);
  }
  return base.slice(0, at) + piece + base.slice(at + fields.old_string.length);
}

function strings(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) if (typeof v === "string") out[k] = v;
  return out;
}

function allDone(fields: Record<string, string>): Record<string, boolean> {
  return Object.fromEntries(Object.keys(fields).map((k) => [k, true]));
}
