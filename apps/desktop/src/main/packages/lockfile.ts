// What pnpm installed in a project, read from its lockfile (pnpm-lock.yaml,
// format 9): the project's own packages with the range each was asked with,
// and every package installed, with the project's packages that bring it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"] as const;
export type DependencyField = (typeof DEPENDENCY_FIELDS)[number];

type Tree = { [key: string]: Tree | string };

const unquote = (text: string) => {
  const t = text.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"')))
    return t.slice(1, -1).replace(/''/g, "'");
  return t;
};

/**
 * The maps of pnpm's lockfile: keys, nested maps and plain values. Lists,
 * and maps written on one line such as `{integrity: …}`, are kept as text,
 * since nothing here reads them.
 */
export function readYamlMaps(text: string): Tree {
  const root: Tree = {};
  const stack: { indent: number; tree: Tree }[] = [{ indent: -1, tree: root }];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith("#") || raw.trimStart().startsWith("- ")) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    // A key, quoted or not, then ":" and its value, if on the same line.
    const match = /^('(?:[^']|'')*'|"[^"]*"|[^:]+?):(?:\s+(.*))?$/.exec(line);
    if (!match) continue;
    while (stack.length > 1 && stack.at(-1)!.indent >= indent) stack.pop();
    const parent = stack.at(-1)!.tree;
    const key = unquote(match[1] ?? "");
    const value = match[2]?.trim();
    if (value === undefined || value === "") {
      const tree: Tree = {};
      parent[key] = tree;
      stack.push({ indent, tree });
    } else parent[key] = value === "{}" ? {} : unquote(value);
  }
  return root;
}

/** A version as the lockfile writes it, without the peers in brackets: `1.2.0(react@19.0.0)` is 1.2.0. */
const bare = (version: string) => version.replace(/\(.*$/, "");

/** A snapshot's key split into name and version: `@scope/name@1.0.0(peer@2.0.0)`. */
function splitKey(key: string): { name: string; version: string } | undefined {
  const plain = bare(key);
  const at = plain.lastIndexOf("@");
  if (at <= 0) return undefined;
  return { name: plain.slice(0, at), version: plain.slice(at + 1) };
}

export type Direct = { name: string; specifier: string; version: string; field: DependencyField };
export type Locked = {
  /** The project's own packages, as package.json asked for them and as installed. */
  direct: Direct[];
  /** Every package installed from the registry, the project's own included, with which of the project's own bring it. */
  installed: { name: string; version: string; via: string[] }[];
};

const isTree = (value: Tree | string | undefined): value is Tree => typeof value === "object";

/** What pnpm installed in a project, or nothing before its first package. */
export function readLockfile(projectDir: string): Locked {
  const file = join(projectDir, "pnpm-lock.yaml");
  if (!existsSync(file)) return { direct: [], installed: [] };
  return lockfileOf(readFileSync(file, "utf8"));
}

/** What a lockfile says pnpm installs: the project's own packages, and every package with what brings it. */
export function lockfileOf(text: string): Locked {
  const tree = readYamlMaps(text);
  const importers = tree.importers;
  const project = isTree(importers) ? importers["."] : undefined;
  const direct: Direct[] = [];
  for (const field of DEPENDENCY_FIELDS) {
    const deps = isTree(project) ? project[field] : undefined;
    if (!isTree(deps)) continue;
    for (const [name, entry] of Object.entries(deps))
      if (isTree(entry) && typeof entry.specifier === "string" && typeof entry.version === "string")
        direct.push({ name, specifier: entry.specifier, version: entry.version, field });
  }
  // Each snapshot's dependencies, then what each of the project's packages reaches through them.
  const snapshots = isTree(tree.snapshots) ? tree.snapshots : {};
  const children = new Map<string, string[]>();
  for (const [key, snapshot] of Object.entries(snapshots)) {
    const of = splitKey(key);
    if (!of || !isTree(snapshot)) continue;
    const id = `${of.name}@${bare(of.version)}`;
    const list = children.get(id) ?? [];
    for (const field of ["dependencies", "optionalDependencies"] as const) {
      const deps = snapshot[field];
      if (isTree(deps))
        for (const [name, version] of Object.entries(deps))
          if (typeof version === "string") list.push(`${name}@${bare(version)}`);
    }
    children.set(id, list);
  }
  const via = new Map<string, Set<string>>();
  for (const dep of direct) {
    const seen = new Set<string>();
    const queue = [`${dep.name}@${bare(dep.version)}`];
    while (queue.length) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const brought = via.get(id) ?? new Set<string>();
      brought.add(dep.name);
      via.set(id, brought);
      queue.push(...(children.get(id) ?? []));
    }
  }
  const installed = [...via].flatMap(([id, names]) => {
    const of = splitKey(id);
    // A package from elsewhere than the registry (a link, a file) has no version OSV knows.
    if (!of || !/^\d/.test(of.version)) return [];
    return [{ name: of.name, version: of.version, via: [...names].sort() }];
  });
  return { direct, installed };
}

/** Whether node_modules holds what the lockfile says: pnpm keeps a copy of the lockfile it installed. */
export function installedAsLocked(projectDir: string): boolean {
  const lock = join(projectDir, "pnpm-lock.yaml");
  const copy = join(projectDir, "node_modules", ".pnpm", "lock.yaml");
  if (!existsSync(lock)) return true;
  return existsSync(copy) && readFileSync(copy, "utf8") === readFileSync(lock, "utf8");
}
