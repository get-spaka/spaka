// A template's manifest, template.json (Q240): what the start screen shows of
// it and what the catalogue lists. What the project's own files already say
// is not repeated here: its libraries' licences are in scripts/libraries.json
// and at the top of scripts/lib/ files, its images' credits beside each image
// in media/, its pictures in pictures/ (made by template:shoot); the reader
// gathers them.
import { z } from "zod";
import { TEMPLATE_CATEGORIES } from "../../shared/ipc";

export { TEMPLATE_CATEGORIES };

/** Licences a library or a template may come under: open, and allowing a website builder. */
export const OPEN_LICENCES = [
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "Unlicense",
  "0BSD",
  "CC0-1.0",
] as const;

export const MANIFEST = "template.json";

export const Manifest = z.object({
  /** Its folder's name, and the name of its design notes' skill: `<id>-design`. */
  id: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/, "lowercase letters, digits and dashes, starting with a letter"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "a version such as 1.0.0"),
  name: z.string().min(1).max(40),
  /** One or two sentences, shown under its name. */
  description: z.string().min(20).max(280),
  category: z.enum(TEMPLATE_CATEGORIES),
  /** One of the original, animated designs (Q230), shown first. */
  original: z.boolean().default(false),
  /** Words the start screen and the agent may match a description with. */
  tags: z.array(z.string().min(1)).default([]),
  author: z.object({ name: z.string().min(1), url: z.url().optional() }),
  /** The template's own licence: what a maker and another author may do with it. */
  licence: z.string().min(1),
});

export type Manifest = z.infer<typeof Manifest>;

/** The manifest's problems, in words an author reads: "description: Too small…". */
export function manifestProblems(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${MANIFEST}: ${issue.path.join(".") || "the file"}: ${issue.message}`);
}
