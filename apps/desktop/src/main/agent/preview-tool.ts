// The agent's tools of Upstart's own: a look at the preview, to check its
// work (decisions: a capture, and the page's errors), a search in the
// gallery of blocks (Q97, Q98), and free images found and added to the
// project's media (Q150, Q167).
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { BLOCK_KINDS } from "../../shared/ipc";
import type { Block } from "../gallery/catalogue";

export const UPSTART_SERVER = "upstart";
export const LOOK_TOOL = `mcp__${UPSTART_SERVER}__look_at_preview`;
export const FIND_BLOCKS_TOOL = `mcp__${UPSTART_SERVER}__find_blocks`;
export const FIND_IMAGES_TOOL = `mcp__${UPSTART_SERVER}__find_images`;
export const USE_IMAGE_TOOL = `mcp__${UPSTART_SERVER}__use_image`;

export type Look = () => Promise<{ route: string | null; png?: Buffer; errors: string[]; notes: string[] }>;
export type FindBlocks = (query: string, kind: string | undefined, limit: number) => Block[];
export type Wanted = { kind?: string; query: string };
/** Answers find_images, in text (Q167). */
export type FindImages = (query: string, count: number) => Promise<string>;
/** Adds an image found to media/ and answers with its path, or says why not. */
export type UseImage = (id: string, name: string, alt: string) => Promise<string>;
export type UpstartTools = { look: Look; findBlocks: FindBlocks; findImages: FindImages; useImage: UseImage };

/**
 * What find_blocks answers: for each section asked for, the blocks found,
 * described, with their templates; a block found twice is shown once.
 */
/**
 * Past about 25,000 tokens the agent's kit puts a tool's answer in a file,
 * which the agent then reads in pieces: the templates in one answer stay
 * under this many characters, beyond the best block of each section.
 */
export const ANSWER_BUDGET = 24_000;

/**
 * What a data block brings besides its template (Q194-Q206): the datasource
 * it reads and how to name it, its definition, one sample record for its
 * shape, and the section of its page per record.
 */
export function dataOf(b: Block): string {
  if (!b.data || !b.datasource) return "";
  const { name, family } = b.data;
  const how =
    name === "navigation"
      ? "It reads the site's navigation, data.navigation, which every header and footer reads. If data/navigation/ exists, reuse it as it is. Otherwise write it before this part: one record per page in the menu, home first, each with its label and address, place header, footer or both, and links for a menu that opens."
      : family === "collection"
        ? `It reads the collection data.${name}, shared by the whole site. If data/${name}/ exists, reuse it, adding to its definition only the fields this template needs; otherwise write this definition, then this site's own records.`
        : `It reads a list of this section, named after its page: on the home page data/home-${name}/, read as data["home-${name}"] in the part, on /services data/services-${name}/. Write this definition there, then this site's own records.`;
  const sample = Object.entries(b.datasource.records)[0];
  return [
    "",
    how,
    `\`\`\`yaml\n${b.datasource.definition.trim()}\n\`\`\``,
    sample
      ? `A sample record, ${sample[0]}, for its shape only: write this site's own records, never the samples.\n\`\`\`markdown\n${sample[1].trim()}\n\`\`\``
      : "",
    b.detail
      ? `Its page per record, pages/${name}/[${name}].liquid unless the site has one: the page that lists them, its head, header and footer kept, with this section in place of its own sections and the record's title in its title.\n\`\`\`liquid\n${b.detail.trim()}\n\`\`\``
      : "",
  ]
    .filter((x, i) => i === 0 || x)
    .join("\n\n");
}

export function blocksAnswer(wanted: Wanted[], find: FindBlocks, budget = ANSWER_BUDGET): string {
  const limit = wanted.length > 1 ? 2 : 4;
  const found = wanted.map(({ kind, query }) => find(query, kind, limit));
  // Which templates are shown: each section's best first, then the others while the budget lasts.
  const shown = new Set<string>();
  let used = 0;
  for (const rank of [0, 1, 2, 3])
    for (const blocks of found) {
      const b = blocks[rank];
      if (!b || shown.has(b.id)) continue;
      const size = b.source.length + dataOf(b).length;
      if (rank > 0 && used + size > budget) continue;
      shown.add(b.id);
      used += size;
    }
  const written = new Set<string>();
  const parts = wanted.map(({ kind, query }, i) => {
    const title = `# ${kind ? `${kind}: ` : ""}"${query}"`;
    const blocks = found[i]!;
    if (!blocks.length)
      return `${title}
No block of the gallery fits: write this section yourself.`;
    return [
      title,
      ...blocks.map((b) => {
        const head = `## ${b.name} (${b.kind}, id ${b.id})`;
        if (written.has(b.id))
          return `${head}
Shown above.`;
        if (!shown.has(b.id))
          return `${head}\n${b.description}\nIts template is left out to keep this answer short; ask for this section alone to see it.`;
        written.add(b.id);
        return `${head}\n${b.description}\n\n\`\`\`liquid\n${b.source.trim()}\n\`\`\`${dataOf(b)}`;
      }),
    ].join("\n\n");
  });
  return [
    "Blocks of Upstart's gallery. To use one, write it as a shared part, parts/<name>.liquid, keeping its structure and classes, with this project's texts in place of the examples, and include it in the page with {% render '<name>' %}.",
    ...parts,
  ].join("\n\n");
}

/** A new in-process server for one agent process. */
export function upstartServer({ look, findBlocks, findImages, useImage }: UpstartTools) {
  return createSdkMcpServer({
    name: UPSTART_SERVER,
    version: "1.0.0",
    tools: [
      tool(
        "find_blocks",
        "Searches Upstart's gallery of ready-made sections (banners, headers, heroes, about, features, services, key figures, steps, logos, team, testimonials, pictures, blog, events, menus, products, pricing, comparisons, questions, contact and hours, forms, newsletters, calls to action, footers), styled with daisyUI and the theme. Ask for every section you want in one call: for each, a few words in any language on what it holds and how it looks. Answers with the best blocks for each, with their templates, and for a block that lists things, the datasource it reads.",
        {
          sections: z
            .array(
              z.object({
                kind: z.enum(BLOCK_KINDS).optional().describe("Only blocks of this kind"),
                query: z
                  .string()
                  .describe('What the section holds and how it looks, e.g. "three plans, middle one highlighted"'),
              }),
            )
            .min(1)
            .max(BLOCK_KINDS.length),
        },
        async ({ sections }) => ({
          content: [{ type: "text" as const, text: blocksAnswer(sections, findBlocks) }],
        }),
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "find_images",
        "Searches Wikimedia Commons and Openverse for photos free for commercial use (CC0, public domain, CC BY, CC BY-SA). Describe in a few words, preferably in English, what the image shows. Answers with about ten images, each with its id, size, licence and author, in text.",
        {
          query: z.string().describe('What the image shows, e.g. "croissants on a bakery counter"'),
          count: z.number().int().min(1).max(20).optional().describe("How many images, 10 by default"),
        },
        async ({ query, count }) => ({
          content: [{ type: "text" as const, text: await findImages(query, count ?? 10) }],
        }),
        { annotations: { readOnlyHint: true, openWorldHint: true } },
      ),
      tool(
        "use_image",
        "Adds an image found with find_images to the project's media/ folder, at most 2400 px wide, with its alternative text and its credits kept beside it, and answers with its address.",
        {
          id: z.string().describe("The id find_images gave"),
          name: z.string().describe('A short file name for it, without extension, e.g. "croissants"'),
          alt: z
            .string()
            .describe(
              "What the image shows, for those who cannot see it, in the language of the maker's message (the site's)",
            ),
        },
        async ({ id, name, alt }) => ({
          content: [{ type: "text" as const, text: await useImage(id, name, alt) }],
        }),
        { annotations: { openWorldHint: true } },
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
