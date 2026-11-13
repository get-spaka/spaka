// `pnpm template:check <folder or .zip>`: a template's checks, for its author
// (and for us, making the app's own); `pnpm template:image`, its images.
// Bundled and run by scripts/template.mjs.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { useFoundImage as addFoundImage, slug } from "../media/library";
import { type FoundImage, type ImageFinder, ImageSearch, imagesAnswer } from "../media/search";
import { checkTemplate } from "./check";
import { readTemplateFolder, readTemplateZip } from "./reader";

export function main(args: string[]): number {
  const finished = args.includes("--finished");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    console.error("Usage: pnpm template:check <template folder or .zip> [--finished]");
    return 2;
  }
  const path = resolve(target);
  let result: ReturnType<typeof checkTemplate>;
  try {
    const files = statSync(path).isDirectory() ? readTemplateFolder(path) : readTemplateZip(readFileSync(path));
    result = checkTemplate(files, { finished });
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : error}`);
    return 1;
  }
  const { template, errors, warnings } = result;
  const title = template ? `${template.manifest.name} (${template.manifest.id} ${template.manifest.version})` : target;
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  console.log(`${title}: ${count(errors.length, "error")}, ${count(warnings.length, "warning")}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  if (template && !errors.length)
    console.log(
      `  ${template.blocks.length} blocks, ${template.libraries.length} libraries, ${template.credits.length} credited media files`,
    );
  return errors.length ? 1 : 0;
}

/**
 * `pnpm template:image find <words>` and `pnpm template:image use <folder> <id> <name> <alt>`:
 * find_images and use_image for a template made in this repository (Q258), the
 * same searches and the same credits as the app's. What a search found is kept
 * in `dir` for the next command, with a small copy of each image to look at.
 */
export async function imageMain(args: string[], dir: string): Promise<number> {
  const [command, ...rest] = args;
  const search = new ImageSearch();
  const store = join(dir, "found.json");
  const known: Record<string, FoundImage> = existsSync(store) ? JSON.parse(readFileSync(store, "utf8")) : {};
  if (command === "find" && rest.length) {
    const query = rest.join(" ");
    const result = await search.search(query, 10);
    mkdirSync(dir, { recursive: true });
    for (const image of result.images) known[image.id] = image;
    writeFileSync(store, `${JSON.stringify(known, null, 2)}\n`);
    console.log(
      imagesAnswer(query, result).replace(
        "call use_image with its id, a short file name and an alternative text saying what it shows",
        "run pnpm template:image use <template folder> <id> <short file name> <alternative text saying what it shows>",
      ),
    );
    const looks: string[] = [];
    for (const [i, image] of result.images.entries()) {
      const bytes = await search.preview(image);
      if (!bytes) continue;
      const path = join(dir, `${slug(query)}-${i + 1}.${bytes[0] === 0x89 ? "png" : "jpg"}`);
      writeFileSync(path, bytes);
      looks.push(`${i + 1}. ${path}`);
    }
    if (looks.length) console.log(`\nSmall copies to look at:\n${looks.join("\n")}`);
    return result.images.length ? 0 : 1;
  }
  if (command === "use" && rest.length >= 4) {
    const [folder, id, name, ...alt] = rest as [string, string, string, ...string[]];
    const finder: ImageFinder = {
      search: (query, count) => search.search(query, count),
      found: (id) => known[id],
      download: (image) => search.download(image),
      preview: (image) => search.preview(image),
    };
    const answer = await addFoundImage(finder, resolve(folder), id, name, alt.join(" "));
    console.log(answer.replace("found by find_images in this session", "found by pnpm template:image find"));
    return /^(?:Added|This image is already)/.test(answer) ? 0 : 1;
  }
  console.error(
    'Usage: pnpm template:image find <words> | pnpm template:image use <template folder> <id> <name> "<alternative text>"',
  );
  return 2;
}
