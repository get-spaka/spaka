// Approach B (instructions): the agent builds the page directly in the preview
// through two tools; the project's files are written afterwards.
//
//   mcp__preview__theme({ css })      the theme, applied as it streams
//   mcp__preview__section({ html })   one top-level block, appended as it streams
//
// The tools themselves do nothing: like the file tap of approach A, this reads
// their input while it streams. The files written in the second pass are not
// shown while they are written; when the turn ends the preview switches from
// the page built by instructions to the page rendered from the files.
// Throwaway spike code.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { AgentEvent } from "../agent/drive.ts";
import { parsePartialInput } from "../agent/partial-input.ts";
import type { PreviewServer } from "../preview/server.ts";
import { repairCss } from "../preview/server.ts";
import { repairTemplate } from "../runtime/template.ts";

export const PREVIEW_TOOLS = ["mcp__preview__theme", "mcp__preview__section"];

export function previewToolServer() {
  const shown = async () => ({ content: [{ type: "text" as const, text: "shown" }] });
  return createSdkMcpServer({
    name: "preview",
    version: "0.0.0",
    alwaysLoad: true,
    tools: [
      tool("theme", "Sets the theme of the page being shown: the full content of theme.css.", { css: z.string() }, shown),
      tool("section", "Appends one top-level block (header, a section, footer) to the page being shown. Plain HTML, no Liquid.", { html: z.string() }, shown),
    ],
  } as any);
}

type Call = { name: string; json: string; rel?: string };

export class InstructionTap {
  private calls = new Map<string, Call>();
  private prose = "";
  private sections: string[] = [];
  private current = "";
  private server: PreviewServer;
  private replay: boolean;
  /** What happened, for the run's measurements. */
  stats = { themeCalls: 0, sectionCalls: 0, instructionChars: 0, firstWriteMs: undefined as number | undefined, lastSectionMs: undefined as number | undefined, liquidInSections: 0 };

  constructor(server: PreviewServer, opts: { replay?: boolean } = {}) {
    this.server = server;
    this.replay = !!opts.replay;
  }

  private document(): string {
    const body = this.sections.join("\n") + (this.current ? "\n" + repairTemplate(this.current).src : "");
    return `<!doctype html><html lang="en"><head><title>Upstart preview</title></head><body class="bg-base-100 text-base-content">${body}</body></html>`;
  }

  private rel(filePath: unknown): string | undefined {
    if (typeof filePath !== "string" || !filePath) return undefined;
    const files = this.server.runtime.files;
    if (!path.isAbsolute(filePath)) return filePath.split(path.sep).join("/");
    const direct = files.rel(filePath);
    if (direct !== undefined) return direct;
    const i = filePath.lastIndexOf("/project/");
    return i >= 0 ? filePath.slice(i + "/project/".length) : undefined;
  }

  handle(e: AgentEvent) {
    const { server } = this;
    switch (e.kind) {
      case "thinking":
        if (!this.prose) server.status("Thinking…");
        break;
      case "text": {
        this.prose += e.text;
        const line = this.prose.trim().split("\n").pop() ?? "";
        if (line) server.status(line.slice(-110));
        break;
      }
      case "tool-start":
        this.calls.set(e.id, { name: e.name, json: "" });
        if (e.name === "Write" || e.name === "Edit") {
          // The first file marks the end of the first pass: the page has been shown.
          if (this.stats.firstWriteMs === undefined) {
            this.stats.firstWriteMs = e.t;
            server.instructionsShown();
          }
        }
        break;
      case "tool-input": {
        const call = this.calls.get(e.id);
        if (!call) break;
        call.json += e.json;
        const { fields, done } = parsePartialInput(call.json);
        if (call.name === "mcp__preview__theme") {
          if (fields.css !== undefined) {
            server.status("Instruction: theme");
            server.push("theme", { css: repairCss(fields.css), final: false });
          }
        } else if (call.name === "mcp__preview__section") {
          if (fields.html !== undefined) {
            server.status(`Instruction: section ${this.sections.length + 1}`);
            this.current = fields.html;
            server.showInstructions(this.document());
          }
        } else if (call.name === "Write" || call.name === "Edit") {
          call.rel ??= done.file_path ? this.rel(fields.file_path) : undefined;
          if (call.rel) server.status(`Writing ${call.rel} (not shown: the page is already built)`);
        }
        break;
      }
      case "tool-input-end": {
        const call = this.calls.get(e.id);
        if (!call) break;
        const input = e.input as any;
        if (call.name === "mcp__preview__theme") {
          this.stats.themeCalls++;
          this.stats.instructionChars += String(input.css ?? "").length;
          server.push("theme", { css: String(input.css ?? ""), final: true });
        } else if (call.name === "mcp__preview__section") {
          const html = String(input.html ?? "");
          this.stats.sectionCalls++;
          this.stats.instructionChars += html.length;
          this.stats.lastSectionMs = e.t;
          if (/\{%|\{\{/.test(html)) this.stats.liquidInSections++;
          this.sections.push(repairTemplate(html).src);
          this.current = "";
          server.showInstructions(this.document());
        }
        break;
      }
      case "tool-result": {
        const call = this.calls.get(e.id);
        if (!call) break;
        this.calls.delete(e.id);
        if (this.replay && call.name === "Write" && call.rel && !e.isError) {
          const { fields } = parsePartialInput(call.json);
          if (fields.content !== undefined) {
            const abs = path.join(server.runtime.files.root, call.rel);
            mkdirSync(path.dirname(abs), { recursive: true });
            writeFileSync(abs, fields.content);
          }
        }
        break;
      }
      case "permission-denied":
        server.status(`Refused without asking: ${e.name}`);
        break;
      case "result":
        if (this.stats.firstWriteMs === undefined) server.instructionsShown();
        // The turn is over: switch from the page built by instructions to the page the files render.
        server.filesReady();
        break;
    }
  }
}
