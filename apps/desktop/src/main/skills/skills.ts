// Skills extend the agent (ADR 0010): those Upstart ships, those the maker
// adds for the whole app, and those of a project, kept in its .upstart/skills
// folder. Each is a folder in the Agent Skills format: a SKILL.md whose
// front matter gives its name and description, and the files it refers to.
//
// The agent's kit loads skills only through a plugin folder. The app
// assembles that folder itself, one plugin per origin, copying in nothing but
// skill folders (regular files, no links): a received project cannot bring
// anything else in that way.
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { SkillInfo, SkillOrigin } from "../../shared/ipc";

/** Where a project keeps its skills. */
export const PROJECT_SKILLS = ".upstart/skills";
/** A skill's name, as the Agent Skills format allows it. */
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** More than this in one skill is not copied for the agent. */
const MAX_BYTES = 20 * 1024 * 1024;

export type AssembledSkills = {
  /** The folder holding the plugins, which the agent may read. */
  dir: string;
  plugins: { type: "local"; path: string; skipMcpDiscovery: true }[];
  /** The skills enabled for the agent, as `origin:name`. */
  enabled: string[];
};

/** A skill's name and description, from its SKILL.md front matter. */
export function readSkill(folder: string): { name: string; description: string } | { problem: string } {
  let text: string;
  try {
    text = readFileSync(join(folder, "SKILL.md"), "utf8");
  } catch {
    return { problem: "This folder has no SKILL.md file." };
  }
  return parseSkill(text);
}

/** A skill's name and description, from the text of its SKILL.md. */
export function parseSkill(text: string): { name: string; description: string } | { problem: string } {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (!front) return { problem: "SKILL.md does not start with a front matter block (--- … ---)." };
  const field = (key: string) => {
    const match = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(front);
    if (!match) return "";
    let value = match[1]!.trim();
    // A folded or literal block: the indented lines that follow.
    if (/^[>|][-+]?$/.test(value)) {
      const rest = front.slice(match.index + match[0].length).split(/\r?\n/);
      const lines: string[] = [];
      for (const line of rest.slice(1)) {
        if (!/^\s+\S/.test(line)) break;
        lines.push(line.trim());
      }
      value = lines.join(" ");
    }
    return value.replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
  };
  const name = field("name");
  const description = field("description");
  if (!NAME.test(name) || name.length > 64)
    return { problem: "Its name must be lowercase letters, digits and hyphens, at most 64 characters." };
  if (!description) return { problem: "SKILL.md has no description." };
  return { name, description };
}

export class Skills {
  constructor(
    /** The skills shipped with Upstart. */
    private readonly bundledDir: string,
    /** The maker's skills for all their projects. */
    private readonly appDir: string,
  ) {}

  list(projectDir?: string): SkillInfo[] {
    return this.origins(projectDir).flatMap(([origin, dir]) => listIn(dir).map((s) => ({ ...s, origin })));
  }

  /** Copies a skill folder in, for the app or for a project. Returns the skill. */
  add(origin: "app" | "project", source: string, projectDir?: string): SkillInfo {
    const skill = readSkill(source);
    if ("problem" in skill) throw new Error(skill.problem);
    const dir = this.dirFor(origin, projectDir);
    const target = join(dir, skill.name);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    copySkill(source, target);
    return { ...skill, origin, path: target };
  }

  remove(origin: "app" | "project", name: string, projectDir?: string) {
    if (!NAME.test(name)) throw new Error("Unknown skill.");
    rmSync(join(this.dirFor(origin, projectDir), name), { recursive: true, force: true });
  }

  /** Changes whenever a skill the agent would get is added, removed or edited. */
  fingerprint(projectDir: string): string {
    const hash = createHash("sha256");
    for (const [origin, dir] of this.origins(projectDir)) {
      hash.update(`\0${origin}`);
      walk(dir, (path, size, mtime) => hash.update(`${path}:${size}:${mtime}\n`));
    }
    return hash.digest("hex");
  }

  /** Builds the agent's plugin folders in `outDir`, from scratch. */
  assemble(projectDir: string, outDir: string): AssembledSkills {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    const plugins: AssembledSkills["plugins"] = [];
    const enabled: string[] = [];
    for (const [origin, dir] of this.origins(projectDir)) {
      const skills = listIn(dir);
      if (!skills.length) continue;
      const plugin = join(outDir, origin);
      mkdirSync(join(plugin, ".claude-plugin"), { recursive: true });
      writeFileSync(
        join(plugin, ".claude-plugin", "plugin.json"),
        JSON.stringify({ name: origin, description: `Skills: ${origin}` }),
      );
      for (const skill of skills) {
        try {
          copySkill(skill.path, join(plugin, "skills", skill.name));
          enabled.push(`${origin}:${skill.name}`);
        } catch {
          // A skill too large or unreadable is left out; the others still load.
        }
      }
      plugins.push({ type: "local", path: plugin, skipMcpDiscovery: true });
    }
    return { dir: outDir, plugins, enabled };
  }

  private origins(projectDir?: string): [SkillOrigin, string][] {
    return [
      ["upstart", this.bundledDir],
      ["app", this.appDir],
      ...(projectDir ? [["project", join(projectDir, PROJECT_SKILLS)] as [SkillOrigin, string]] : []),
    ];
  }

  private dirFor(origin: "app" | "project", projectDir?: string) {
    if (origin === "app") return this.appDir;
    if (!projectDir) throw new Error("No project is open.");
    return join(projectDir, PROJECT_SKILLS);
  }
}

function listIn(dir: string): Omit<SkillInfo, "origin">[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: Omit<SkillInfo, "origin">[] = [];
  for (const entry of entries.sort()) {
    const folder = join(dir, entry);
    if (!lstatSync(folder).isDirectory()) continue;
    const skill = readSkill(folder);
    // A skill is known by its folder: the two must agree.
    if ("problem" in skill || skill.name !== entry) continue;
    out.push({ ...skill, path: folder });
  }
  return out;
}

/** Copies regular files and folders only; links are left behind. */
function copySkill(source: string, target: string) {
  let total = 0;
  walk(source, (_path, size) => {
    total += size;
  });
  if (total > MAX_BYTES) throw new Error("This skill is larger than 20 MB.");
  mkdirSync(target, { recursive: true });
  walk(source, (path) => {
    const to = join(target, path);
    mkdirSync(join(to, ".."), { recursive: true });
    copyFileSync(join(source, path), to);
  });
}

/** Every regular file under `root`, without following links; hidden files are skipped. */
function walk(root: string, visit: (path: string, size: number, mtime: number) => void, rel = "") {
  let entries: string[];
  try {
    entries = readdirSync(join(root, rel));
  } catch {
    return;
  }
  for (const entry of entries.sort()) {
    if (entry.startsWith(".")) continue;
    const path = rel ? `${rel}/${entry}` : entry;
    const stat = lstatSync(join(root, path));
    if (stat.isDirectory()) walk(root, visit, path);
    else if (stat.isFile()) visit(path, stat.size, stat.mtimeMs);
  }
}
