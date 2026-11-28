// The agent's tools of Spaka's own, described once for both agent layers
// (ADR 0012): a look at a page, to check its work, in a view of its own on the
// screen it names, after steps done as a visitor would (Q314–Q324), a search
// in the gallery of blocks and their placing into a page (Q97, Q98,
// Q213-Q216), and free images found and added to the
// project's media (Q150, Q167). Claude gets them through the Agent SDK's
// in-process server (preview-tool.ts), the Pi harness as its own tools.
import { z } from "zod";
import { IMAGE_ASPECTS } from "../../shared/image-models";
import { BLOCK_KINDS } from "../../shared/ipc";
import { isCollected } from "../editing/data-drop";
import type { Placing } from "../editing/place-blocks";
import type { Block } from "../gallery/catalogue";
import { GENERATIONS_A_TURN, MAX_REFERENCES } from "../images/generate";
import type { GenerateInput } from "../images/into-media";
import { MINIMUM_AGE_DAYS } from "../packages/rules";
import { type LookOptions, lookText, MAX_STEPS, readSteps, type Seen, STEP_ACTIONS } from "../preview/look-steps";
import { PAGES_DESCRIPTION, PAGES_SHAPE, PAGES_TOOL_NAME } from "../templates/pages-card";

export const SPAKA_SERVER = "spaka";
/** The names the app knows these tools by, whichever agent calls them: the Agent SDK's. */
export const spakaToolName = (name: string) => `mcp__${SPAKA_SERVER}__${name}`;
export const LOOK_TOOL = spakaToolName("look_at_preview");
export const FIND_BLOCKS_TOOL = spakaToolName("find_blocks");
export const FIND_IMAGES_TOOL = spakaToolName("find_images");
export const USE_IMAGE_TOOL = spakaToolName("use_image");
export const USE_BLOCK_TOOL = spakaToolName("use_block");
export const PAGES_TOOL = spakaToolName(PAGES_TOOL_NAME);
export const GENERATE_IMAGE_TOOL = spakaToolName("generate_image");
export const ADD_PACKAGE_TOOL = spakaToolName("add_package");
export const REMOVE_PACKAGE_TOOL = spakaToolName("remove_package");

export type Look = (route?: string, options?: LookOptions) => Promise<Seen>;
export type FindBlocks = (query: string, kind: string | undefined, limit: number) => Block[];
export type Wanted = { kind?: string; query: string };
/** Answers find_images, in text (Q167). */
export type FindImages = (query: string, count: number) => Promise<string>;
type ImageWanted = { id: string; name: string; alt: string };
/** Adds the images found to media/, in order, and answers with their paths, or says why not (Q357). */
export type UseImage = (images: ImageWanted[]) => Promise<string>;
/** Puts gallery blocks into a page and answers with what was written, or says why not (Q213-Q216). */
export type UseBlocks = (input: Placing) => string;
/** Shows the card of pages of a template's adaptation, waits for the maker and answers with their choice (Q302). */
export type ChoosePages = (input: unknown, signal?: AbortSignal) => Promise<string>;
/** Generates an image with the maker's account and adds it to media/ (Q423); answers with its address or why not. */
export type GenerateImage = (input: GenerateInput, signal?: AbortSignal) => Promise<string>;
/** Adds a package of npm's registry to the website, by Spaka's rules (Q491, Q493); answers with what was installed, or why not. */
export type AddPackage = (name: string, version: string | undefined, signal?: AbortSignal) => Promise<string>;
/** Takes a package out of the website (Q491). */
export type RemovePackage = (name: string, signal?: AbortSignal) => Promise<string>;
export type SpakaTools = {
  look: Look;
  findBlocks: FindBlocks;
  findImages: FindImages;
  useImage: UseImage;
  useBlocks: UseBlocks;
  choosePages: ChoosePages;
  /** Only when an account that generates images is connected (Q423). */
  generateImage?: GenerateImage;
  addPackage: AddPackage;
  removePackage: RemovePackage;
};

/** What a tool answers: text, and images the model looks at. */
export type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

/** One of Spaka's tools, as either agent layer declares it. */
export type SpakaToolDef = {
  /** Its short name; the Agent SDK prefixes it (spakaToolName). */
  name: string;
  description: string;
  /** Its input, field by field. */
  shape: z.ZodRawShape;
  readOnly?: boolean;
  openWorld?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: each tool's input is checked against its shape before it runs
  run(input: any, signal?: AbortSignal): Promise<ToolContent[]>;
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
    "Blocks of Spaka's gallery. Choose one per section, then put them into the page with use_block, in reading order: it writes each as a shared part with its datasource and sample records, and the page's {% render %} lines.",
    ...(own
      ? [
          "Blocks marked \"this site's own design\" come from the template this site started from, in its blocks/ folder: prefer them when they fit, they keep the site's style and effects.",
        ]
      : []),
    ...parts,
  ].join("\n\n");
}

const text = (t: string): ToolContent[] => [{ type: "text", text: t }];

/** look_at_preview, as the agent reads it (Q314–Q324); nothing says when to look on a phone (Q319). */
const LOOK_DESCRIPTION = `Looks at a page of the website as a visitor sees it, in a browser of your own that the maker does not see, and answers with a picture of one screen and, in text: the page, which screen of it this is ("screen 2 of 5") and the files of what is on it; the steps done; the problems Spaka measured on that screen, each with its file and line (the page wider than the screen, text cut off, elements still hidden once the page settled, images that did not load, links to an address no page has); the page's errors, and what Spaka had to repair or skip to render it.

Name the screen: desktop, tablet or phone. Before the picture, \`steps\` are done in order, as a visitor would: hover, click, scroll, press a key, type into a field. A link within the website is followed; a form is never sent. One look shows one screen: \`at\` ends it on a part further down, so a long page is seen part by part, down to its footer. What the steps changed (a menu opened, a field filled) stays from one look to the next until the end of your turn, through the files you write; \`fresh\` starts again from the page as it loads.

Use it to check your work when something may be wrong, and on each page after rewriting a website's texts; it is not needed after every change.`;

/** Spaka's tools for one project's agent. */
export function spakaTools({
  look,
  findBlocks,
  findImages,
  useImage: addImages,
  useBlocks,
  choosePages,
  generateImage,
  addPackage,
  removePackage,
}: SpakaTools): SpakaToolDef[] {
  return [
    {
      name: "find_blocks",
      description:
        "Searches Spaka's gallery of ready-made sections (banners, headers, heroes, about, features, services, key figures, steps, logos, team, testimonials, pictures, blog, events, menus, products, pricing, comparisons, questions, contact and hours, forms, newsletters, calls to action, footers), styled with daisyUI and the theme. Ask for every section of a page in one call: for each, a few words in any language on what it holds and how it looks. Answers with the best blocks for each, described: their id, what they hold, their mood, and what a block that lists things lists. Then put the chosen ones in with use_block.",
      shape: {
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
      readOnly: true,
      run: async ({ sections }: { sections: Wanted[] }) => text(blocksAnswer(sections, findBlocks)),
    },
    {
      name: "use_block",
      description:
        "Puts blocks of Spaka's gallery, chosen with find_blocks, into one page, as the maker's drag does: each becomes a shared part, parts/<name>.liquid, named after its role; a block that lists things brings its datasource (a collection the site has already is reused), its sample records, and its page per record; a header or footer reads the site's navigation. The page gets the {% render %} lines in the order given, a banner and header at its top and a footer at its end. A page that does not exist yet is created with the site's head, header and footer. Answers with what was written; then read each part and write this site's texts and records in place of the gallery's.",
      shape: {
        page: z.string().describe('The page\'s file, e.g. "pages/index.liquid" for the home page, "pages/menu.liquid"'),
        title: z.string().optional().describe("For a page that does not exist yet: its title, in the site's language"),
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
      run: async (input: Placing) => text(useBlocks(input)),
    },
    {
      name: "find_images",
      description:
        "Searches Wikimedia Commons and Openverse for photos free for commercial use (CC0, public domain, CC BY, CC BY-SA). Describe in a few words, preferably in English, what the image shows. Answers with about ten images, each with its id, size, licence and author, in text.",
      shape: {
        query: z.string().describe('What the image shows, e.g. "croissants on a bakery counter"'),
        count: z.number().int().min(1).max(20).optional().describe("How many images, 10 by default"),
      },
      readOnly: true,
      openWorld: true,
      run: async ({ query, count }: { query: string; count?: number }) => text(await findImages(query, count ?? 10)),
    },
    {
      name: "use_image",
      description:
        "Adds an image found with find_images to the project's media/ folder, at most 2400 px wide, with its alternative text and its credits kept beside it, and answers with its address. For several at once (the photos of a list of images), give `images` instead: they are added in turn and their addresses answered in that order.",
      shape: {
        id: z.string().optional().describe("The id find_images gave"),
        name: z.string().optional().describe('A short file name for it, without extension, e.g. "croissants"'),
        alt: z
          .string()
          .optional()
          .describe(
            "What the image shows, for those who cannot see it, in the language of the maker's message (the site's)",
          ),
        images: z
          .array(z.object({ id: z.string(), name: z.string(), alt: z.string() }))
          .max(24)
          .optional()
          .describe("Several images, each with its id, name and alt as above, in the order they will show"),
      },
      openWorld: true,
      run: async (input: { id?: string; name?: string; alt?: string; images?: ImageWanted[] }) => {
        const wanted = input.images?.length
          ? input.images
          : input.id
            ? [{ id: input.id, name: input.name || "image", alt: input.alt ?? "" }]
            : [];
        if (!wanted.length) return text("Give the id, name and alt of an image, or `images` for several.");
        return text(await addImages(wanted));
      },
    },
    ...(generateImage
      ? [
          {
            name: "generate_image",
            description: `Generates an image with the maker's own account (Gemini or OpenAI, which charges them a few cents an image) and adds it to the project's media/ folder with its alternative text, answering with its address. Use it, rather than a free photo from find_images, when the site's style calls for it: an illustration, a texture or pattern, a background, a scene of mood, or a subject no free photo shows well. Never the business's own team or any real person, a logo, a testimonial, or text inside the image (write text in the page). Describe it as a photographer or illustrator would: the subject, the setting, the light, the framing, the style and palette of the site, the same words from one image to the next so they belong together. To keep one style across images, or to retouch an image of the maker's at their request, give up to ${MAX_REFERENCES} images of media/ as references: the result is a new image, the original stays. At most ${GENERATIONS_A_TURN} images a turn: beyond, ask the maker.`,
            shape: {
              prompt: z.string().describe("What the image shows and how, in English, in a few sentences"),
              aspect: z
                .enum(IMAGE_ASPECTS)
                .describe(
                  "Its shape for the place it goes: 16:9 or 21:9 for a banner, 4:3 for a card, 3:4 for a portrait, 1:1 square, 9:16 tall",
                ),
              name: z.string().describe('A short file name for it, without extension, e.g. "linen-texture"'),
              alt: z
                .string()
                .describe(
                  "What the image shows, for those who cannot see it, in the language of the maker's message (the site's)",
                ),
              references: z
                .array(z.string())
                .max(MAX_REFERENCES)
                .optional()
                .describe('Images of the project to start from, by their address, e.g. ["/media/shop-front.jpg"]'),
            },
            openWorld: true,
            run: async (input: GenerateInput, signal?: AbortSignal) => text(await generateImage(input, signal)),
          } satisfies SpakaToolDef,
        ]
      : []),
    {
      name: "add_package",
      description: `Adds a package of npm's registry to the website: Spaka picks the newest version its rules allow (at least ${MINIMUM_AGE_DAYS} days old; none with a known flaw, nor one that compiles native code when installed), asks the maker first about a young, little-downloaded or unlinked package, or one named like a well-known package, then installs it into the website's node_modules and writes it into package.json. Answers with the version and licence, or why it was not installed. Use it, or remove_package, rather than writing package.json's dependencies or running npm or pnpm, which Spaka undoes.`,
      shape: {
        name: z.string().describe('The package\'s name on npm, e.g. "embla-carousel" or "@floating-ui/dom"'),
        version: z
          .string()
          .optional()
          .describe('A version, a range or a tag, e.g. "8.6.0", "^8" or "latest"; without it, the newest Spaka allows'),
      },
      openWorld: true,
      run: async ({ name, version }: { name: string; version?: string }, signal?: AbortSignal) =>
        text(await addPackage(name.trim(), version, signal)),
    },
    {
      name: "remove_package",
      description: "Takes a package out of the website: out of package.json and its node_modules.",
      shape: { name: z.string().describe("The package's name, as package.json lists it") },
      run: async ({ name }: { name: string }, signal?: AbortSignal) => text(await removePackage(name.trim(), signal)),
    },
    {
      name: PAGES_TOOL_NAME,
      description: PAGES_DESCRIPTION,
      shape: PAGES_SHAPE,
      run: async (input: unknown, signal?: AbortSignal) => text(await choosePages(input, signal)),
    },
    {
      name: "look_at_preview",
      description: LOOK_DESCRIPTION,
      shape: {
        route: z
          .string()
          .optional()
          .describe(
            'A page\'s address, e.g. "/menu" or "/work/first-case". Without it, the page your last look in this turn ended on, or else the one the maker sees.',
          ),
        screen: z
          .enum(["desktop", "tablet", "phone"])
          .optional()
          .describe(
            "desktop (1440×900, the default), tablet (820×1180) or phone (393×852). Without it and without a route, the screen of your last look in this turn.",
          ),
        steps: z
          .array(
            z.object({
              action: z.enum(STEP_ACTIONS).describe("hover, click, scroll, press (a key) or type (into a field)"),
              target: z
                .string()
                .optional()
                .describe(
                  'What the step acts on: a file of the website ("parts/header.liquid"), a line of it ("parts/header.liquid:14", the first element written on that line) or a CSS selector ("header nav button"). A scroll also takes "down" or "up" (a screen), "top" or "bottom". A key pressed goes to the element with the focus.',
                ),
              key: z
                .string()
                .optional()
                .describe(
                  'For press: "Tab", "Shift+Tab", "Escape", "Enter", "Space", "ArrowDown" and the other arrows, "Home", "End", "PageUp", "PageDown"',
                ),
              text: z.string().optional().describe("For type: the text typed into the field"),
            }),
          )
          .max(MAX_STEPS)
          .optional()
          .describe("What to do on the page before the picture, in order, as a visitor would"),
        at: z
          .string()
          .optional()
          .describe(
            'Where the look ends: a part further down or a CSS selector ("pages/index.liquid:40", "#faq", "footer"), scrolled to as a visitor scrolls, after the steps',
          ),
        fresh: z
          .boolean()
          .optional()
          .describe("Start from the page as it loads, leaving what your earlier looks in this turn opened or filled"),
      },
      readOnly: true,
      run: async ({ route, screen, steps, at, fresh }: { route?: string } & LookOptions) => {
        const read = readSteps(steps);
        if ("problem" in read) return text(read.problem);
        const seen = await look(route, { screen, steps: read.steps, at, fresh });
        return [
          ...(seen.png ? [{ type: "image" as const, data: seen.png.toString("base64"), mimeType: "image/png" }] : []),
          { type: "text" as const, text: lookText(seen) },
        ];
      },
    },
  ];
}
