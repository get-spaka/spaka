// `pnpm template:check <folder or .zip>`: a template's checks, for its author
// (and for us, making the app's own); `pnpm template:image`, its images;
// `pnpm template:release` and `pnpm template:snapshot`, Spaka's releases.
// Bundled and run by scripts/template.mjs.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { IMAGE_ASPECTS, IMAGE_MODELS, type ImageAspect } from "../../shared/image-models";
import { devKey } from "../dev-keys";
import { generateImage, type ImageCredentials, splitImageModel } from "../images/generate";
import { generateIntoMedia } from "../images/into-media";
import { useFoundImage as addFoundImage, slug } from "../media/library";
import { type FoundImage, type ImageFinder, ImageSearch, imagesAnswer, USER_AGENT } from "../media/search";
import { checkTemplate } from "./check";
import { TEMPLATES_RELEASES } from "./library";
import { readTemplateFolder, readTemplateZip } from "./reader";
import { CATALOGUE_FILE, type Catalogue, parseCatalogue } from "./release";

export { releaseMain } from "./release-main";

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
  if (command === "generate") return generateMain(rest);
  console.error(
    'Usage: pnpm template:image find <words> | pnpm template:image use <template folder> <id> <name> "<alternative text>" | pnpm template:image use <template folder> <list file> | pnpm template:image generate <template folder> <name> "<prompt>" "<alternative text>" [--aspect 16:9] [--ref media/x.webp]… [--model openai/gpt-image-2]',
  );
  return 2;
}

/**
 * `pnpm template:image generate <folder> <name> "<prompt>" "<alt>"` (Q432):
 * an image generated as generate_image does in the app, into the template's
 * media/ with its model and prompt in place of credits. The key, GEMINI_API_KEY
 * or OPENAI_API_KEY, comes from the terminal or the repository's .env (Q438);
 * Gemini's model when both are set, unless `--model` names another.
 */
export async function generateMain(args: string[]): Promise<number> {
  const options = new Map<string, string[]>();
  const words: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) options.set(arg, [...(options.get(arg) ?? []), args[++i] ?? ""]);
    else words.push(arg);
  }
  const [folder, name, prompt, alt] = words;
  const aspect = (options.get("--aspect")?.[0] ?? "4:3") as ImageAspect;
  if (!folder || !name || !prompt || !alt || words.length > 4 || !IMAGE_ASPECTS.includes(aspect)) {
    console.error(
      `Usage: pnpm template:image generate <template folder> <name> "<prompt>" "<alternative text>" [--aspect ${IMAGE_ASPECTS.join("|")}] [--ref media/x.webp]… [--model ${IMAGE_MODELS.filter(
        (m) => m.account !== "vertex",
      )
        .map((m) => m.id)
        .join("|")}]`,
    );
    return 2;
  }
  const keys = { gemini: devKey("GEMINI_API_KEY"), openai: devKey("OPENAI_API_KEY") };
  const model =
    options.get("--model")?.[0] ??
    IMAGE_MODELS.find((m) => m.default && m.account !== "vertex" && keys[m.account as "gemini" | "openai"])?.id;
  const known = IMAGE_MODELS.find((m) => m.id === model && m.account !== "vertex");
  if (!known) {
    console.error(
      model
        ? `${model} is not a model this command knows: ${IMAGE_MODELS.filter((m) => m.account !== "vertex")
            .map((m) => m.id)
            .join(", ")}.`
        : "Set GEMINI_API_KEY or OPENAI_API_KEY in the terminal or in the repository's .env to generate an image.",
    );
    return 2;
  }
  const { account, model: id } = splitImageModel(known.id);
  const key = keys[account as "gemini" | "openai"];
  if (!key) {
    console.error(
      `Set ${account === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} in the terminal or in the repository's .env for ${known.name}.`,
    );
    return 2;
  }
  const credentials = { account, key } as ImageCredentials;
  const answer = await generateIntoMedia(
    resolve(folder),
    known.id,
    { prompt, aspect, name, alt, references: options.get("--ref") ?? [] },
    (request) => generateImage(credentials, id, request),
  );
  const added = answer.startsWith("Generated and added");
  console.log(added ? answer.split(". Write")[0] : answer);
  return added ? 0 : 1;
}

/**
 * `pnpm template:snapshot`: the latest release's catalogue and pictures, into
 * `dir` (apps/desktop/templates-catalogue), shipped with the packaged app
 * (Q247); the pictures of the earlier versions it keeps too, from their own
 * releases (Q368). Offline, a snapshot taken earlier stays, with a warning.
 */
export async function snapshotMain(dir: string, releases = TEMPLATES_RELEASES): Promise<number> {
  const get = async (url: string) => {
    const answer = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (!answer.ok) throw new Error(`${url}: HTTP ${answer.status}`);
    return Buffer.from(await answer.arrayBuffer());
  };
  let catalogue: Catalogue | undefined;
  const pictures = new Map<string, Buffer>();
  try {
    const text = (await get(`${releases}/latest/download/${CATALOGUE_FILE}`)).toString("utf8");
    catalogue = parseCatalogue(text);
    if (!catalogue) throw new Error("The latest catalogue is of a format this app does not read.");
    for (const t of [...catalogue.templates.map((t) => ({ ...t, release: catalogue!.release })), ...catalogue.earlier])
      for (const name of [t.cover, t.hover])
        if (name) pictures.set(name, await get(`${releases}/download/${t.release}/${name}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (existsSync(join(dir, CATALOGUE_FILE))) {
      console.warn(`! The snapshot of the templates was kept as it was: ${message}`);
      return 0;
    }
    console.error(`✗ No snapshot of the templates: ${message}`);
    return 1;
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, CATALOGUE_FILE), `${JSON.stringify(catalogue, null, 2)}\n`);
  for (const [name, bytes] of pictures) writeFileSync(join(dir, name), bytes);
  console.log(`✓ ${catalogue.templates.length} templates of release ${catalogue.release}, in ${dir}`);
  return 0;
}
