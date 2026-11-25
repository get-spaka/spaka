import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import { PROJECT_SKILLS, readSkill, Skills } from "./skills";

let root: string;
let bundled: string;
let app: string;
let project: string;

const skill = (dir: string, name: string, description = `What ${name} does.`, extra: Record<string, string> = {}) => {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`);
  for (const [file, content] of Object.entries(extra)) {
    mkdirSync(join(dir, name, file, ".."), { recursive: true });
    writeFileSync(join(dir, name, file), content);
  }
  return join(dir, name);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "skills-"));
  bundled = join(root, "bundled");
  app = join(root, "app");
  project = join(root, "project");
  mkdirSync(project, { recursive: true });
  skill(bundled, "spaka-help");
});

test("a skill's name and description come from its front matter", () => {
  const folded = join(root, "folded");
  mkdirSync(folded);
  writeFileSync(
    join(folded, "SKILL.md"),
    `---\nname: "folded"\ndescription: >\n  Two lines\n  of description.\n---\nBody`,
  );
  expect(readSkill(folded)).toEqual({ name: "folded", description: "Two lines of description." });
  expect(readSkill(join(root, "nothing"))).toEqual({ problem: expect.stringContaining("SKILL.md") });
  const bad = skill(root, "x", "d");
  writeFileSync(join(bad, "SKILL.md"), "---\nname: Not Valid\ndescription: d\n---\n");
  expect(readSkill(bad)).toEqual({ problem: expect.stringContaining("lowercase") });
});

test("the three origins are listed; a skill whose folder and name differ is left out", () => {
  skill(app, "brand-voice");
  skill(join(project, PROJECT_SKILLS), "menu-format");
  const wrong = skill(app, "other");
  writeFileSync(join(wrong, "SKILL.md"), "---\nname: renamed\ndescription: d\n---\n");
  const skills = new Skills(bundled, app);
  expect(skills.list(project).map((s) => `${s.origin}:${s.name}`)).toEqual([
    "spaka:spaka-help",
    "app:brand-voice",
    "project:menu-format",
  ]);
  expect(skills.list().map((s) => s.origin)).not.toContain("project");
});

test("adding copies the folder in, replacing a skill of the same name; removing deletes it", () => {
  const skills = new Skills(bundled, app);
  const source = skill(join(root, "elsewhere"), "brand-voice", "Old", { "reference.md": "ref" });
  skills.add("project", source, project);
  expect(readFileSync(join(project, PROJECT_SKILLS, "brand-voice", "reference.md"), "utf8")).toBe("ref");
  writeFileSync(join(source, "SKILL.md"), "---\nname: brand-voice\ndescription: New\n---\n");
  expect(skills.add("project", source, project).description).toBe("New");
  expect(() => skills.add("app", join(root, "nothing"))).toThrow(/SKILL.md/);
  skills.remove("project", "brand-voice", project);
  expect(existsSync(join(project, PROJECT_SKILLS, "brand-voice"))).toBe(false);
  expect(() => skills.remove("app", "../x")).toThrow();
});

test("the assembled plugins hold skill folders only: no links, no hidden files", () => {
  const secret = join(root, "secret.txt");
  writeFileSync(secret, "secret");
  const theirs = skill(join(project, PROJECT_SKILLS), "received", "From someone else.", { "scripts/run.sh": "echo" });
  symlinkSync(secret, join(theirs, "link.txt"));
  writeFileSync(join(theirs, ".mcp.json"), "{}");
  mkdirSync(join(project, PROJECT_SKILLS, "received", "hooks"));
  const out = join(root, "assembled");
  const result = new Skills(bundled, app).assemble(project, out);
  expect(result.enabled).toEqual(["spaka:spaka-help", "project:received"]);
  expect(result.plugins.map((p) => p.path)).toEqual([join(out, "spaka"), join(out, "project")]);
  const copied = join(out, "project", "skills", "received");
  expect(readFileSync(join(copied, "scripts/run.sh"), "utf8")).toBe("echo");
  expect(existsSync(join(copied, "link.txt"))).toBe(false);
  expect(existsSync(join(copied, ".mcp.json"))).toBe(false);
  expect(JSON.parse(readFileSync(join(out, "project", ".claude-plugin", "plugin.json"), "utf8")).name).toBe("project");
});

test("the fingerprint changes when a project skill is written or edited", () => {
  const skills = new Skills(bundled, app);
  const before = skills.fingerprint(project);
  const dir = skill(join(project, PROJECT_SKILLS), "new-one");
  const added = skills.fingerprint(project);
  expect(added).not.toBe(before);
  writeFileSync(join(dir, "SKILL.md"), "---\nname: new-one\ndescription: Changed, and longer.\n---\n");
  expect(skills.fingerprint(project)).not.toBe(added);
});
