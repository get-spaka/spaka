// The agent's one tool of Upstart's own: a look at the preview, to check its
// work (decisions: a capture, and the page's errors).
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";

export const UPSTART_SERVER = "upstart";
export const LOOK_TOOL = `mcp__${UPSTART_SERVER}__look_at_preview`;

export type Look = () => Promise<{ route: string | null; png?: Buffer; errors: string[]; notes: string[] }>;

/** A new in-process server for one agent process. */
export function upstartServer(look: Look) {
  return createSdkMcpServer({
    name: UPSTART_SERVER,
    version: "1.0.0",
    tools: [
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
