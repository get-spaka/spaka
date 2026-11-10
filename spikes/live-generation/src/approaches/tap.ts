// How the agent's output reaches the preview, for the two approaches that work
// on files: A (files plus live stream) and C (files then reload).
//
// A: the input of every Write/Edit call is read while it streams; the unfinished
//    file goes into the runtime's overlay and the page is re-rendered and morphed.
// C: nothing is shown until the tool has written the file; then the page reloads.
// Throwaway spike code.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AgentEvent } from "../agent/drive.ts";
import { parsePartialInput } from "../agent/partial-input.ts";
import type { PreviewServer } from "../preview/server.ts";
import { repairTemplate } from "../runtime/template.ts";

type Call = { name: string; json: string; rel?: string; base?: string };

export class FileTap {
  private calls = new Map<string, Call>();
  private prose = "";
  private server: PreviewServer;
  private live: boolean;
  private replay: boolean;

  /**
   * @param live   true for approach A (tap the stream), false for approach C.
   * @param replay true when the events come from a recorded run: the tools do not
   *               run, so the tap writes the files itself when their result arrives.
   */
  constructor(server: PreviewServer, opts: { live: boolean; replay?: boolean }) {
    this.server = server;
    this.live = opts.live;
    this.replay = !!opts.replay;
  }

  private rel(filePath: unknown): string | undefined {
    if (typeof filePath !== "string" || !filePath) return undefined;
    const files = this.server.runtime.files;
    if (!path.isAbsolute(filePath)) return filePath.split(path.sep).join("/");
    // A replayed run was recorded in another folder: keep what follows ".../project/".
    const direct = files.rel(filePath);
    if (direct !== undefined) return direct;
    const i = filePath.lastIndexOf("/project/");
    return i >= 0 ? filePath.slice(i + "/project/".length) : undefined;
  }

  /** The content a file will have, given the part of the tool input received so far. */
  private preview(call: Call, fields: Record<string, string>, done: Record<string, boolean>): string | undefined {
    if (call.name === "Write") return fields.content;
    if (call.name === "Edit") {
      if (!done.old_string || fields.new_string === undefined) return undefined;
      call.base ??= this.server.runtime.files.read(call.rel!) ?? "";
      const at = call.base.indexOf(fields.old_string);
      if (at < 0) return undefined;
      let piece = fields.new_string;
      if (!done.new_string) {
        // The new text lands in the middle of the file: close what it leaves open before the rest of
        // the file follows, or the next section is drawn inside the unfinished one. A stylesheet or a
        // data file is only shown once the new text is complete.
        if (!/\.(liquid|html)$/.test(call.rel!)) return undefined;
        piece = repairTemplate(piece).src;
        // An insertion is usually written as "the new text, then the old text again", and the old text is
        // often an anchor cut in the middle of a tag. Until the new text is complete, keep the old text
        // after it, unless the new text visibly starts by repeating the old one.
        const probe = Math.min(fields.old_string.length, fields.new_string.length, 12);
        const repeatsOld = probe > 0 && fields.new_string.slice(0, probe) === fields.old_string.slice(0, probe);
        if (!repeatsOld) return call.base.slice(0, at) + piece + call.base.slice(at);
      }
      return call.base.slice(0, at) + piece + call.base.slice(at + fields.old_string.length);
    }
    return undefined;
  }

  handle(e: AgentEvent) {
    const { server } = this;
    const files = server.runtime.files;
    switch (e.kind) {
      case "text": {
        this.prose += e.text;
        const line = this.prose.trim().split("\n").pop() ?? "";
        if (line) server.status(line.slice(-110));
        break;
      }
      case "thinking":
        if (!this.prose) server.status("Thinking…");
        break;
      case "tool-start":
        this.calls.set(e.id, { name: e.name, json: "" });
        if (e.name !== "Write" && e.name !== "Edit") server.status(`${e.name}…`);
        break;
      case "tool-input": {
        const call = this.calls.get(e.id);
        if (!call) break;
        call.json += e.json;
        if (call.name !== "Write" && call.name !== "Edit") break;
        const { fields, done } = parsePartialInput(call.json);
        call.rel ??= done.file_path ? this.rel(fields.file_path) : undefined;
        if (!call.rel) break;
        server.status(`${call.name === "Write" ? "Writing" : "Editing"} ${call.rel}`);
        if (!this.live) break;
        server.streaming.add(call.rel);
        const content = this.preview(call, fields, done);
        if (content === undefined) break;
        files.overlay.set(call.rel, content);
        server.fileChanged(call.rel, "stream");
        break;
      }
      case "tool-input-end": {
        const call = this.calls.get(e.id);
        if (!call) break;
        if (this.live && call.rel && (call.name === "Write" || call.name === "Edit")) {
          // The whole content has arrived, a little before the tool writes it to disk.
          const { fields, done } = parsePartialInput(call.json);
          const content = this.preview(call, fields, done);
          if (content !== undefined) files.overlay.set(call.rel, content);
          server.streaming.delete(call.rel);
          server.fileChanged(call.rel, "stream");
        }
        if (call.name === "Bash") server.status(`Running: ${String((e.input as any).command ?? "").slice(0, 90)}`);
        if (call.name === "Read") server.status(`Reading ${this.rel((e.input as any).file_path) ?? ""}`);
        break;
      }
      case "tool-result": {
        const call = this.calls.get(e.id);
        if (!call) break;
        this.calls.delete(e.id);
        if ((call.name !== "Write" && call.name !== "Edit") || !call.rel) break;
        if (this.replay && !e.isError) {
          // Do what the tool did in the recorded run.
          const { fields, done } = parsePartialInput(call.json);
          const content = call.name === "Write" ? fields.content : this.preview(call, fields, done);
          if (content !== undefined) {
            const abs = path.join(files.root, call.rel);
            mkdirSync(path.dirname(abs), { recursive: true });
            writeFileSync(abs, content);
          }
        }
        files.overlay.delete(call.rel);
        server.streaming.delete(call.rel);
        server.fileChanged(call.rel, "final");
        break;
      }
      case "permission-denied":
        server.status(`Refused without asking: ${e.name}`);
        break;
      case "result":
        break;
    }
  }
}
