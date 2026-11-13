// The agent's tools of Upstart's own: a look at the preview, to check its
// work (decisions: a capture, and the page's errors), a search in the
// gallery of blocks and their placing into a page (Q97, Q98, Q213-Q216), and
// free images found and added to the project's media (Q150, Q167).
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { BLOCK_KINDS } from "../../shared/ipc";
import { isCollected } from "../editing/data-drop";
import type { Placing } from "../editing/place-blocks";
import type { Block } from "../gallery/catalogue";

export const UPSTART_SERVER = "upstart";
export const LOOK_TOOL = `mcp__${UPSTART_SERVER}__look_at_preview`;
export const FIND_BLOCKS_TOOL = `mcp__${UPSTART_SERVER}__find_blocks`;
export const FIND_IMAGES_TOOL = `mcp__${UPSTART_SERVER}__find_images`;
export const USE_IMAGE_TOOL = `mcp__${UPSTART_SERVER}__use_image`;
export const USE_BLOCK_TOOL = `mcp__${UPSTART_SERVER}__use_block`;

export type Look = (
  route?: string,
) => Promise<{ route: string | null; png?: Buffer; errors: string[]; notes: string[] }>;
export type FindBlocks = (query: string, kind: string | undefined, limit: number) => Block[];
export type Wanted = { kind?: string; query: string };
/** Answers find_images, in text (Q167). */
export type FindImages = (query: string, count: number) => Promise<string>;
/** Adds an image found to media/ and answers with its path, or says why not. */
export type UseImage = (id: string, name: string, alt: string) => Promise<string>;
/** Puts gallery blocks into a page and answers with what was written, or says why not (Q213-Q216). */
export type UseBlocks = (input: Placing) => string;
export type UpstartTools = {
  look: Look;
  findBlocks: FindBlocks;
  findImages: FindImages;
  useImage: UseImage;
  useBlocks: UseBlocks;
};

/**
 * What find_blocks answers (Q213): for each section asked for, the blocks
 * found, described by their metadata only — what they hold and look like,
 * what a data block lists — never their templates: use_block puts the chosen
 * ones in, and the agent reads the parts it wrote. A block found twice is
 * described once.
 */
export function blocksAnswer(wanted: Wanted[], find: FindBlocks): string {
  const limit = wanted.length > 1 ? 3 : 5;
  const described = new Set<string>();
  const found = wanted.map(({ kind, query }) => ({ kind, query, blocks: find(query, kind, limit) }));
  const parts = found.map(({ kind, query, blocks }) => {
    const title = `# ${kind ? `${kind}: ` : ""}"${query}"`;
    if (!blocks.length)
      return `${title}
No block of the gallery fits: write this section yourself.`;
    return [
      title,
      ...blocks.map((b) => {
        const head = `- ${b.id}: ${b.name} (${b.kind}${b.design ? ", this site's own design" : ""})`;
        if (described.has(b.id)) return `${head}, described above.`;
        described.add(b.id);
        const about = [b.description];
        if (b.mood.length) about.push(`Mood: ${b.mood.join(", ")}.`);
        if (b.tags.length) about.push(`Tags: ${b.tags.join(", ")}.`);
        if (b.data)
          about.push(
            b.data.name === "navigation"
              ? "It reads the site's navigation."
              : b.datasource && isCollected(b.datasource.definition)
                ? `It is a form: what visitors send is collected in ${b.data.name}.`
                : b.data.family === "collection"
                  ? `It lists the collection ${b.data.name}, shared by the whole site${b.detail ? ", with a page per record" : ""}.`
                  : `It lists ${b.data.name}, a list of this section of its own.`,
          );
        return `${head}\n  ${about.join(" ")}`;
      }),
    ].join("\n");
  });
  const own = found.some(({ blocks }) => blocks.some((b) => b.design));
  return [
    "Blocks of Upstart's gallery. Choose one per section, then put them into the page with use_block, in reading order: it writes each as a shared part with its datasource and sample records, and the page's {% render %} lines.",
    ...(own
      ? [
          "Blocks marked \"this site's own design\" come from the template this site started from, in its blocks/ folder: prefer them when they fit, they keep the site's style and effects.",
        ]
      : []),
    ...parts,
  ].join("\n\n");
}

/** A new in-process server for one agent process. */
export function upstartServer({ look, findBlocks, findImages, useImage, useBlocks }: UpstartTools) {
  return createSdkMcpServer({
    name: UPSTART_SERVER,
    version: "1.0.0",
    tools: [
      tool(
        "find_blocks",
        "Searches Upstart's gallery of ready-made sections (banners, headers, heroes, about, features, services, key figures, steps, logos, team, testimonials, pictures, blog, events, menus, products, pricing, comparisons, questions, contact and hours, forms, newsletters, calls to action, footers), styled with daisyUI and the theme. Ask for every section of a page in one call: for each, a few words in any language on what it holds and how it looks. Answers with the best blocks for each, described: their id, what they hold, their mood, and what a block that lists things lists. Then put the chosen ones in with use_block.",
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
        "use_block",
        "Puts blocks of Upstart's gallery, chosen with find_blocks, into one page, as the maker's drag does: each becomes a shared part, parts/<name>.liquid, named after its role; a block that lists things brings its datasource (a collection the site has already is reused), its sample records, and its page per record; a header or footer reads the site's navigation. The page gets the {% render %} lines in the order given, a banner and header at its top and a footer at its end. A page that does not exist yet is created with the site's head, header and footer. Answers with what was written; then read each part and write this site's texts and records in place of the gallery's.",
        {
          page: z
            .string()
            .describe('The page\'s file, e.g. "pages/index.liquid" for the home page, "pages/menu.liquid"'),
          title: z
            .string()
            .optional()
            .describe("For a page that does not exist yet: its title, in the site's language"),
          description: z
            .string()
            .optional()
            .describe("For a page that does not exist yet: its description, one sentence"),
          lang: z.string().optional().describe('For the site\'s first page: its language, e.g. "fr"'),
          blocks: z
            .array(
              z.object({
                block: z.string().describe("The block's id, from find_blocks"),
                name: z.string().describe('Its role on the site, which names its part, e.g. "hero", "menu", "reviews"'),
              }),
            )
            .min(1)
            .max(20)
            .describe("In reading order"),
        },
        async (input) => ({ content: [{ type: "text" as const, text: useBlocks(input) }] }),
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
        "Shows a page in Upstart's preview, as an image, with the errors the page reported and what Upstart had to repair or skip to render it: the page the maker currently sees, or the one at `route`, which the preview goes to first. Use it to check your work when something may be wrong, and on each page after rewriting a site's texts; it is not needed after every change.",
        {
          route: z
            .string()
            .optional()
            .describe('A page\'s address, e.g. "/menu" or "/work/first-case": the preview shows it first'),
        },
        async ({ route }) => {
          const seen = await look(route);
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
