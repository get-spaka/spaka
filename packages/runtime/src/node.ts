// Reading a project from disk, for Node and Electron.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { ProjectSource } from "./source.ts";

/** Folders of a project that are never part of its site. */
const SKIPPED = new Set(["node_modules", ".git", ".upstart"]);

export function diskSource(root: string): ProjectSource {
  const toProject = (abs: string) => relative(root, abs).split(sep).join("/");
  return {
    read(path) {
      if (path.split("/").some((part) => part === ".." || part === "")) return undefined;
      try {
        return readFileSync(join(root, path), "utf8");
      } catch {
        return undefined;
      }
    },
    list(dir) {
      const out: string[] = [];
      const walk = (abs: string) => {
        let entries: import("node:fs").Dirent[];
        try {
          entries = readdirSync(abs, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (entry.name.startsWith(".") || SKIPPED.has(entry.name)) continue;
          const child = join(abs, entry.name);
          if (entry.isDirectory()) walk(child);
          else if (entry.isFile()) out.push(toProject(child));
        }
      };
      walk(join(root, dir));
      return out.sort();
    },
  };
}
