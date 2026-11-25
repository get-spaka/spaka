import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { folderId, Projects, readProjectFile, slug } from "./projects";

let root: string;
let projects: Projects;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "upstart-projects-"));
  projects = new Projects(join(root, "data"), join(root, "Upstart"));
});

describe("creating a project", () => {
  test("makes a folder project-<random id>, with its .upstart/project.json holding its name (Q410)", () => {
    const project = projects.create("Chez Margot, boulangerie");
    expect(dirname(project.path)).toBe(join(root, "Upstart"));
    expect(basename(project.path)).toMatch(/^project-[0-9a-z]{10}$/);
    expect(project.model).toBe("claude-opus-5-5");
    expect(project.effort).toBe("high");
    expect(readProjectFile(project.path)?.id).toBe(project.id);
    expect(projects.list()).toEqual([
      {
        id: project.id,
        name: "Chez Margot, boulangerie",
        path: project.path,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      },
    ]);
  });

  test("two websites of the same name get folders of their own", () => {
    const a = projects.create("Lumen");
    const b = projects.create("Lumen");
    expect(b.path).not.toBe(a.path);
    expect(b.id).not.toBe(a.id);
  });

  test("a rename changes the name in project.json, never the folder", () => {
    const project = projects.create("Je voudrais un site");
    projects.update(project.id, { name: "Chez Margot" });
    expect(readProjectFile(project.path)?.name).toBe("Chez Margot");
    expect(projects.list()[0]).toMatchObject({ name: "Chez Margot", path: project.path });
  });
});

describe("a folder's random id", () => {
  test("10 lowercase letters or digits, a new one each time", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => folderId()));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]{10}$/);
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

  test("forgets folders that are gone", () => {
    projects.create("A");
    const b = projects.create("B");
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

describe("the order of the list (Q393)", () => {
  const history = (id: string, at: number) => {
    const dir = join(root, "data", "projects", id, "history");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "snapshots.json"), "[]");
    utimesSync(join(dir, "snapshots.json"), at / 1000, at / 1000);
  };

  test("the website changed last first; opening one does not move it", () => {
    const a = projects.create("A");
    projects.create("B");
    const c = projects.create("C");
    history(a.id, Date.now() + 60_000);
    history(c.id, Date.now() - 60_000);
    // B, changed by nothing yet, counts from its creation.
    expect(projects.list().map((p) => p.name)).toEqual(["A", "B", "C"]);
    projects.open(c.id);
    expect(projects.list().map((p) => p.name)).toEqual(["A", "B", "C"]);
  });

  test("a project keeps when it was created, opened or renamed since", () => {
    const a = projects.create("A");
    const created = projects.list()[0]!.createdAt;
    projects.open(a.id);
    projects.update(a.id, { name: "A, renamed" });
    expect(projects.list()[0]).toMatchObject({ name: "A, renamed", createdAt: created });
  });

  test("a project listed before Q394 takes its folder's creation", () => {
    const a = projects.create("A");
    const registry = join(root, "data", "projects.json");
    const entries = JSON.parse(readFileSync(registry, "utf8"));
    delete entries[0].createdAt;
    writeFileSync(registry, JSON.stringify(entries));
    expect(projects.list()[0]!.createdAt).toBeGreaterThan(0);
    projects.open(a.id);
    expect(JSON.parse(readFileSync(registry, "utf8"))[0].createdAt).toBeGreaterThan(0);
  });
});
