// Which whole-app checks a change calls for, by the files it touches: the
// pre-push hook runs them before a push (scripts/pre-push.ts, Q446), the CI
// running them all on main, and on a pull request whose box is ticked (Q447).
//
// - a check that changed runs, and so does every check that imports a helper
//   of e2e/ that changed;
// - a file of the app runs the checks whose name shares a word with its
//   folders or its own name (the gallery runs gallery.e2e.ts, ThemeTab.tsx
//   the theme's checks); one that shares none runs the basic checks;
// - documents (the READMEs and licences among them), unit tests and the CI's
//   own files run none; the app's Markdown (its skills, the blocks' samples)
//   is the app's.

/** The checks run when a change of the app shares no word with any check's name. */
export const BASIC = ["shell.e2e.ts", "start.e2e.ts", "preview.e2e.ts"];

/** Words of a path that say nothing of what it does. */
const GENERIC = new Set(
  "apps desktop packages src main renderer preload component hook lib shared ui index type test util string en fr block data detail fragment json liquid yaml md ts tsx js mjs css html app".split(
    " ",
  ),
);

/** A path's words, lowercase, singular, split at dashes, dots, underscores and capitals. */
export function words(path: string): string[] {
  return path
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
    .map((w) => (w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .filter((w) => !GENERIC.has(w));
}

/** What in a path names its area: under the gallery, the templates or the skills, that folder alone, since what is below are blocks, templates and skills of every kind. */
function areaWords(path: string): string[] {
  const own = /^apps\/desktop\/(gallery|templates|skills)\//.exec(path);
  return own ? words(own[1]!) : words(path);
}

/**
 * The checks (file names in e2e/) that `changed` (paths from the repository's
 * root) calls for, in the order of `checks`. `imports` gives the files of e2e/
 * a file of e2e/ imports.
 */
export function checksFor(changed: string[], checks: string[], imports: (file: string) => string[]): string[] {
  const chosen = new Set<string>();
  const helpers = new Set<string>();
  let basic = false;
  for (const path of changed) {
    if (path.startsWith("e2e/")) {
      const file = path.slice(4);
      if (file.includes("/")) continue; // runs and recordings
      if (file.endsWith(".e2e.ts")) {
        if (checks.includes(file)) chosen.add(file);
      } else if (file.endsWith(".ts")) helpers.add(file);
      continue;
    }
    if (
      !/^(apps\/desktop|packages)\//.test(path) ||
      /\.test\.tsx?$/.test(path) ||
      /(^|\/)(README\.md|LICENSE[^/]*)$/.test(path)
    ) {
      if (/^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/.test(path)) basic = true;
      continue;
    }
    const area = areaWords(path);
    const named = checks.filter((c) => words(c.replace(/\.e2e\.ts$/, "")).some((w) => area.includes(w)));
    if (named.length) for (const c of named) chosen.add(c);
    else basic = true;
  }
  if (helpers.size) {
    const uses = (file: string, seen = new Set<string>()): boolean =>
      imports(file).some((i) => {
        if (helpers.has(i)) return true;
        if (seen.has(i)) return false;
        seen.add(i);
        return uses(i, seen);
      });
    for (const c of checks) if (uses(c)) chosen.add(c);
  }
  if (basic) for (const c of BASIC) if (checks.includes(c)) chosen.add(c);
  return checks.filter((c) => chosen.has(c));
}
