// `node scripts/release.mjs <templates folder> <out folder> <tag> [previous
// catalogue]`: the release of Spaka's templates, as the public repository's
// CI builds it (Q250, Q265). The previous catalogue, a path or an address (the
// CI gives the latest release's), holds the earlier versions older apps still
// need (Q368). Bundled, with all it needs, into that repository by `pnpm
// template:release-script`, where it runs with Node alone; `pnpm
// template:release` runs it here.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildRelease, type Catalogue, parseCatalogue } from "./release";

export async function releaseMain(args: string[]): Promise<number> {
  const [root, out, tag, from] = args;
  if (!root || !out || !tag) {
    console.error("Usage: release <templates folder> <out folder> <tag> [previous catalogue.json: path or address]");
    return 2;
  }
  try {
    const previous = from ? await readPrevious(from) : undefined;
    if (!from) console.warn("! No previous catalogue: no earlier version is kept for older apps.");
    const catalogue = buildRelease(resolve(root), resolve(out), tag, previous);
    for (const t of catalogue.templates)
      console.log(`✓ ${t.name} (${t.id} ${t.version}): ${t.zip.file}, ${(t.zip.size / 1e6).toFixed(1)} MB`);
    for (const t of catalogue.earlier)
      console.log(
        `  kept for apps before ${laterApp(catalogue, t.id, t.version)}: ${t.name} ${t.version}, from ${t.release}`,
      );
    // The release's notes, on GitHub.
    const notes = catalogue.templates.map((t) => `- **${t.name}** ${t.version}: ${t.description}`).join("\n");
    const kept = catalogue.earlier.map((t) => `- ${t.name} ${t.version} (${t.release})`).join("\n");
    writeFileSync(
      join(resolve(out), "notes.md"),
      `${catalogue.templates.length} templates.\n\n${notes}\n${kept ? `\nKept for older versions of the app:\n\n${kept}\n` : ""}`,
    );
    console.log(`${catalogue.templates.length} templates in release ${tag}, in ${resolve(out)}`);
    return 0;
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

/** The previous release's catalogue; a release without it would lose the earlier versions, so none is built. */
async function readPrevious(from: string): Promise<Catalogue> {
  let text: string;
  if (/^https?:/.test(from)) {
    const answer = await fetch(from);
    if (!answer.ok) throw new Error(`The previous catalogue could not be read: ${from}: HTTP ${answer.status}`);
    text = await answer.text();
  } else text = readFileSync(from, "utf8");
  const catalogue = parseCatalogue(text);
  if (!catalogue) throw new Error(`The previous catalogue is of a format this script does not read: ${from}`);
  return catalogue;
}

/** The app version the version after an earlier one needs. */
function laterApp(catalogue: Catalogue, id: string, version: string): string {
  const all = [...catalogue.templates, ...catalogue.earlier].filter((t) => t.id === id);
  const index = all.findIndex((t) => t.version === version);
  return all[index - 1]?.app ?? "?";
}
