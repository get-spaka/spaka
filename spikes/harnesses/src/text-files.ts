// Upstart's own way of writing a file, for a harness whose tool calls do not
// stream: the file in the reply's text, which every provider and every
// harness's protocol streams as it is generated (Gemini sends a tool call's
// arguments whole).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { INSTRUCTIONS, type Run } from "./common.ts";

const TEXT_FILES = `

# Writing files

Do not use a tool to create or replace a file. Write the whole file in your reply instead, in a block of its own:

<file path="pages/index.liquid">
…the file's whole content…
</file>

The opening and closing lines hold nothing else, and no Markdown fence surrounds the block. Upstart writes each block into the project as it arrives, creating its folders. Write the files one after another, then say in a sentence or two what you made. Use the edit tool only for a small change to a file that already exists.`;

/** Spike 1's instructions, with files written in the reply's text. */
export const textInstructions = () =>
  INSTRUCTIONS.replace(
    "Write each new file with a single call of your file-writing tool, top to bottom in reading order. Use your editing tool for later changes.",
    "Write each new file in one block, top to bottom in reading order (see Writing files). Use your editing tool for later changes.",
  ).replace("(your file-writing tool creates folders)", "(Upstart creates folders)") + TEXT_FILES;

/**
 * Reads the file blocks from a reply's text as it grows: records each block's
 * content while it is open, and writes the file when the block closes. Call it
 * with the whole text so far after each piece.
 */
export function blockReader(run: Run) {
  const blocks = new Map<string, { last: number; written: boolean }>();
  return (text: string) => {
    for (const m of text.matchAll(/<file path="([^"]+)">\n?([\s\S]*?)(\n<\/file>|$)/g)) {
      const path = m[1]!;
      const closed = !!m[3];
      // A closing tag cut in the middle is not content.
      const body = closed ? m[2]! : m[2]!.replace(/\n<(\/(f(i(le?)?)?)?)?$/, "");
      const b = blocks.get(path) ?? { last: -1, written: false };
      blocks.set(path, b);
      if (b.written) continue;
      const abs = join(run.project, path);
      if (closed) {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, `${body}\n`);
        run.content(relative(run.project, abs), body.length, false);
        b.written = true;
      } else if (body.length > b.last) {
        run.content(relative(run.project, abs), body.length, true);
        b.last = body.length;
      }
    }
  };
}
