// The agent's tools of Upstart's own: a look at the preview, to check its
// work (decisions: a capture, and the page's errors), and a search in the
// gallery of blocks (Q97, Q98).
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { BLOCK_KINDS } from "../../shared/ipc";
import type { Block } from "../gallery/catalogue";

export const UPSTART_SERVER = "upstart";
export const LOOK_TOOL = `mcp__${UPSTART_SERVER}__look_at_preview`;
export const FIND_BLOCKS_TOOL = `mcp__${UPSTART_SERVER}__find_blocks`;

export type Look = () => Promise<{ route: string | null; png?: Buffer; errors: string[]; notes: string[] }>;
export type FindBlocks = (query: string, kind?: string) => Block[];

/** What find_blocks answers: each block found, described, with its template. */
export function blocksAnswer(found: Block[], query: string, kind?: string): string {
  if (!found.length)
    return `No block of the gallery matches "${query}"${kind ? ` among the ${kind} blocks` : ""}. Write the section yourself.`;
  return [
    `${found.length} block${found.length > 1 ? "s" : ""} of the gallery. To use one, write it as a shared part, parts/<name>.liquid, with this project's texts in place of the examples, and include it in the page with {% render '<name>' %}.`,
    ...found.map(
      (b) => `## ${b.name} (${b.kind}, id ${b.id})\n${b.description}\n\n\`\`\`liquid\n${b.source.trim()}\n\`\`\``,
    ),
  ].join("\n\n");
}

/** A new in-process server for one agent process. */
export function upstartServer(look: Look, findBlocks: FindBlocks) {
  return createSdkMcpServer({
    name: UPSTART_SERVER,
    version: "1.0.0",
    tools: [
      tool(
        "find_blocks",
        "Searches Upstart's gallery of ready-made sections (headers, heroes, features, testimonials, pricing, questions, calls to action, footers), styled with daisyUI and the theme. Give a few words in any language: what the section holds and how it looks. Answers with up to four blocks and their templates.",
        {
          query: z.string().describe('What you look for, e.g. "three pricing plans, middle one highlighted"'),
          kind: z.enum(BLOCK_KINDS).optional().describe("Only blocks of this kind"),
        },
        async ({ query, kind }) => ({
          content: [{ type: "text" as const, text: blocksAnswer(findBlocks(query, kind), query, kind) }],
        }),
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "look_at_preview",
        "Shows the page the maker currently sees in Upstart's preview, as an image, with the errors the page reported and what Upstart had to repair or skip to render it. Use it to check your work when something may be wrong; it is not needed after every change.",
        {},
        async () => {
          const seen = await look();
          const lines = [
            seen.route === null ? "No page is shown." : `Page shown: ${seen.route}`,
            seen.errors.length ? `Errors in the page:\n${seen.errors.join("\n")}` : "No errors in the page.",
            seen.notes.length ? `Rendering notes:\n${seen.notes.join("\n")}` : "",
          ].filter(Boolean);
          return {
            content: [
              ...(seen.png
                ? [{ type: "image" as const, data: seen.png.toString("base64"), mimeType: "image/png" }]
                : []),
              { type: "text" as const, text: lines.join("\n\n") },
            ],
          };
        },
        { annotations: { readOnlyHint: true } },
      ),
    ],
  });
}
