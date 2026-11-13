// `pnpm template:check <folder or .zip>`: a template's checks, for its author
// (and for us, making the app's own). Bundled and run by scripts/template.mjs.
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
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
