// What Spaka puts right in a project before its pnpm runs there (ADR 0013,
// the packages plan's probe, docs/spikes/packages.md):
// - the project's .npmrc is removed, since pnpm would still send the tokens it holds;
// - package.json loses `devEngines`, through which pnpm still resolves a Node;
// - package.json gains `"type": "module"`, without which Node parses each server module twice;
// - an .ignore file keeps node_modules out of the agents' searches.
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** What the agent is told of the changes made, one sentence each. */
export function prepareProject(projectDir: string): string[] {
  const notes: string[] = [];
  const npmrc = join(projectDir, ".npmrc");
  if (existsSync(npmrc)) {
    rmSync(npmrc, { force: true });
    notes.push(
      "Removed the project's .npmrc: Spaka installs packages from npm's registry with settings of its own, and pnpm would still send the tokens such a file holds.",
    );
  }
  const file = join(projectDir, "package.json");
  const existed = existsSync(file);
  let manifest: Record<string, unknown> = { private: true };
  if (existed) {
    const text = readFileSync(file, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`package.json is not valid JSON (${(error as Error).message}): correct it first.`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("package.json does not hold a JSON object: correct it first.");
    manifest = parsed as Record<string, unknown>;
  }
  let changed = !existed;
  if ("devEngines" in manifest) {
    delete manifest.devEngines;
    changed = true;
    notes.push(
      'Removed "devEngines" from package.json: pnpm would resolve the Node it names, and the website runs on Spaka\'s own.',
    );
  }
  if (manifest.type === undefined) {
    manifest.type = "module";
    changed = true;
    if (existed) notes.push('Set "type": "module" in package.json: the website\'s code is made of ES modules.');
  }
  if (changed) writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  ignorePackages(projectDir);
  return notes;
}

/**
 * Lists node_modules in the project's .ignore, which ripgrep reads in any
 * folder, git repository or not: Claude's Grep, and its Glob with ignore
 * files read, then skip the installed packages.
 */
export function ignorePackages(projectDir: string): void {
  const file = join(projectDir, ".ignore");
  if (!existsSync(file)) {
    writeFileSync(file, "# The packages Spaka installs, left out of the agents' searches.\nnode_modules/\n");
    return;
  }
  const text = readFileSync(file, "utf8");
  if (text.split(/\r?\n/).some((line) => /^\/?node_modules\/?$/.test(line.trim()))) return;
  appendFileSync(file, `${text && !text.endsWith("\n") ? "\n" : ""}node_modules/\n`);
}
