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

const VERSION = /^\d+\.\d+\.\d+$/;

/** Whether version `a` comes before `b`, each read as x.y.z (a suffix such as -beta.1 is not read). */
export function olderVersion(a: string, b: string): boolean {
  const parts = (v: string) => (/^(\d+)\.(\d+)\.(\d+)/.exec(v) ?? [0, 0, 0, 0]).slice(1).map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! < y[i]!;
  return false;
}

export const Manifest = z.object({
  /** Its folder's name, and the name of its design notes' skill: `<id>-design`. */
  id: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/, "lowercase letters, digits and dashes, starting with a letter"),
  version: z.string().regex(VERSION, "a version such as 1.0.0"),
  name: z.string().min(1).max(40),
  /** One or two sentences, shown under its name. */
  description: z.string().min(20).max(280),
  category: z.enum(TEMPLATE_CATEGORIES),
  /** Words the start screen and the agent may match a description with. */
  tags: z.array(z.string().min(1)).default([]),
  author: z.object({ name: z.string().min(1), url: z.url().optional() }),
  /** The template's own licence: what a maker and another author may do with it. */
  licence: z.string().min(1),
  /**
   * The oldest version of the app that opens it (Q368), when it uses something
   * an older app reads otherwise, such as the images field kind (0.2.0).
   */
  app: z.string().regex(VERSION, "the oldest app version it needs, such as 0.2.0").optional(),
});

export type Manifest = z.infer<typeof Manifest>;

/** The manifest's problems, in words an author reads: "description: Too small…". */
export function manifestProblems(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${MANIFEST}: ${issue.path.join(".") || "the file"}: ${issue.message}`);
}
