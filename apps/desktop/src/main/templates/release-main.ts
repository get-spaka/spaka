// `node scripts/release.mjs <templates folder> <out folder> <tag>`: the release
// of Upstart's templates, as the public repository's CI builds it (Q250, Q265).
// Bundled, with all it needs, into that repository by `pnpm
// template:release-script`, where it runs with Node alone; `pnpm
// template:release` runs it here.
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildRelease } from "./release";

export function releaseMain(args: string[]): number {
  const [root, out, tag] = args;
  if (!root || !out || !tag) {
    console.error("Usage: release <templates folder> <out folder> <tag>");
    return 2;
  }
  try {
    const catalogue = buildRelease(resolve(root), resolve(out), tag);
    for (const t of catalogue.templates)
      console.log(`✓ ${t.name} (${t.id} ${t.version}): ${t.zip.file}, ${(t.zip.size / 1e6).toFixed(1)} MB`);
    // The release's notes, on GitHub.
    const notes = catalogue.templates.map((t) => `- **${t.name}** ${t.version}: ${t.description}`).join("\n");
    writeFileSync(join(resolve(out), "notes.md"), `${catalogue.templates.length} templates.\n\n${notes}\n`);
    console.log(`${catalogue.templates.length} templates in release ${tag}, in ${resolve(out)}`);
    return 0;
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}
