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
 * `use <folder> <list file>` adds several, one a line, each tried again while
 * the source is busy.
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
  const finder: ImageFinder = {
    search: (query, count) => search.search(query, count),
    found: (id) => known[id],
    download: (image) => search.download(image),
    preview: (image) => search.preview(image),
  };
  const add = async (folder: string, id: string, name: string, alt: string) =>
    (await addFoundImage(finder, resolve(folder), id, name, alt)).replace(
      "found by find_images in this session",
      "found by pnpm template:image find",
    );
  const added = (answer: string) => /^(?:Added|This image is already)/.test(answer);
  if (command === "use" && rest.length === 2 && existsSync(rest[1]!)) {
    // A list: one image a line, "<id> <name> <alternative text>"; blank lines and # comments left out.
    const [folder, list] = rest as [string, string];
    const lines = readFileSync(list, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    let failed = 0;
    for (const line of lines) {
      const [id, name, ...alt] = line.split(/\s+/);
      const answer = alt.length
        ? await add(folder, id!, name!, alt.join(" "))
        : `Not "<id> <name> <alternative text>": ${line}`;
      if (!added(answer)) failed++;
      console.log(`${added(answer) ? "ok  " : "FAIL"} ${name ?? line}: ${answer.split("\n")[0]}`);
    }
    console.log(`\n${lines.length - failed} of ${lines.length} added.`);
    return failed ? 1 : 0;
  }
  if (command === "use" && rest.length >= 4) {
    const [folder, id, name, ...alt] = rest as [string, string, string, ...string[]];
    const answer = await add(folder, id, name, alt.join(" "));
    console.log(answer);
    return added(answer) ? 0 : 1;
  }
  console.error(
    'Usage: pnpm template:image find <words> | pnpm template:image use <template folder> <id> <name> "<alternative text>" | pnpm template:image use <template folder> <list file>',
  );
  return 2;
}
