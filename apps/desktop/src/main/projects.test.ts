import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { Projects, readProjectFile, slug } from "./projects";

let root: string;
let projects: Projects;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "upstart-projects-"));
  projects = new Projects(join(root, "data"), join(root, "Upstart"));
});

describe("creating a project", () => {
  test("makes a folder named after it, with its .upstart/project.json", () => {
    const project = projects.create("Chez Margot, boulangerie");
    expect(project.path).toBe(join(root, "Upstart", "chez-margot-boulangerie"));
    expect(project.model).toBe("claude-sonnet-5-5");
    expect(project.effort).toBe("medium");
    expect(readProjectFile(project.path)?.id).toBe(project.id);
    expect(projects.list()).toEqual([{ id: project.id, name: "Chez Margot, boulangerie", path: project.path }]);
  });

  test("never reuses an existing folder", () => {
    const a = projects.create("Lumen");
    const b = projects.create("Lumen");
    expect(b.path).toBe(`${a.path}-2`);
    expect(b.id).not.toBe(a.id);
  });
});

describe("opening a folder", () => {
  test("turns a plain folder into a project", () => {
    const folder = join(root, "my-site");
    mkdirSync(join(folder, "pages"), { recursive: true });
    const project = projects.openFolder(folder);
    expect(project.name).toBe("my-site");
    expect(existsSync(join(folder, ".upstart", "project.json"))).toBe(true);
  });

  test("a moved project keeps its identifier, a copied one gets its own", () => {
    const original = projects.create("Book club");
    const copy = join(root, "copy");
    cpSync(original.path, copy, { recursive: true });
    const opened = projects.openFolder(copy);
    expect(opened.id).not.toBe(original.id);

    const moved = join(root, "moved");
    renameSync(original.path, moved);
    expect(projects.openFolder(moved).id).toBe(original.id);
  });

  test("lists the most recently opened first and forgets folders that are gone", () => {
    const a = projects.create("A");
    const b = projects.create("B");
    projects.open(a.id);
    expect(projects.list().map((p) => p.name)).toEqual(["A", "B"]);
    renameSync(b.path, join(root, "elsewhere"));
    expect(projects.list().map((p) => p.name)).toEqual(["A"]);
  });
});

test("changing the effort is written into the project", () => {
  const project = projects.create("Effort");
  projects.update(project.id, { effort: "high" });
  expect(JSON.parse(readFileSync(join(project.path, ".upstart/project.json"), "utf8")).effort).toBe("high");
});

test("a broken project.json is replaced", () => {
  const folder = join(root, "broken");
  mkdirSync(join(folder, ".upstart"), { recursive: true });
  writeFileSync(join(folder, ".upstart/project.json"), "{ nope");
  expect(projects.openFolder(folder).id).toMatch(/^[0-9a-f-]{36}$/);
});

test("slug", () => {
  expect(slug("  Café Ça Va!  ")).toBe("cafe-ca-va");
  expect(slug("🙂")).toBe("");
});
