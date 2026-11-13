// The start screen's templates (Q249, Q264): Upstart's own and the maker's
// imported ones, listed originals first; an import read, shown, then added.
import { cpSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Runtime } from "@upstart/runtime";
import { describe, expect, test } from "vitest";
import { TemplateLibrary } from "./library";
import { textSource } from "./reader";
import { pagesOf } from "./viewer";

const BUILT_IN = join(import.meta.dirname, "../../../templates");
const scratch = () => mkdtempSync(join(tmpdir(), "upstart-templates-"));

/** Beacon, copied under another id, as an outside author's template. */
function outsideTemplate(id: string): string {
  const dir = join(scratch(), id);
  cpSync(join(BUILT_IN, "beacon"), dir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(dir, "template.json"), "utf8"));
  writeFileSync(join(dir, "template.json"), JSON.stringify({ ...manifest, id, name: "Lighthouse" }));
  const skills = join(dir, ".upstart/skills");
  renameSync(join(skills, "beacon-design"), join(skills, `${id}-design`));
  const skill = join(skills, `${id}-design/SKILL.md`);
  writeFileSync(skill, readFileSync(skill, "utf8").replace("name: beacon-design", `name: ${id}-design`));
  return dir;
}

describe("the templates to start from", () => {
  test("originals first, then the standard ones, each by name", () => {
    const list = new TemplateLibrary(BUILT_IN, scratch()).list();
    const originals = list.filter((t) => t.original);
    expect(originals.length).toBeGreaterThanOrEqual(4);
    expect(list.slice(0, originals.length).every((t) => t.original)).toBe(true);
    const names = (ts: typeof list) => ts.map((t) => t.name);
    expect(names(originals)).toEqual([...names(originals)].sort((a, b) => a.localeCompare(b)));
    expect(list.every((t) => !t.imported)).toBe(true);
    expect(list.map((t) => t.id)).toContain("reel");
  });

  test("a picture as a data URL; a template or picture it does not have, none", () => {
    const library = new TemplateLibrary(BUILT_IN, scratch());
    expect(library.picture("reel", "cover")).toMatch(/^data:image\/webp;base64,/);
    expect(library.picture("reel", "hover")).toMatch(/^data:image\/webp;base64,/);
    expect(library.picture("nothing", "cover")).toBeNull();
    expect(library.dir("../reel")).toBeUndefined();
  });

  test("an import is read and shown first, then added, listed as imported", () => {
    const imported = scratch();
    const library = new TemplateLibrary(BUILT_IN, imported);
    const answer = library.read(outsideTemplate("lighthouse"));
    if (!("token" in answer)) throw new Error(answer.problems.join("\n"));
    expect(answer.template).toMatchObject({ id: "lighthouse", name: "Lighthouse", imported: true });
    expect(answer.cover).toMatch(/^data:image\/webp/);
    expect(answer.pages.length).toBeGreaterThan(0);
    // Not added until the maker says so.
    expect(library.get("lighthouse")).toBeUndefined();
    expect(library.accept(answer.token).id).toBe("lighthouse");
    expect(library.get("lighthouse")).toMatchObject({ imported: true });
    expect(library.dir("lighthouse")).toBe(join(imported, "lighthouse"));
    expect(() => library.accept(answer.token)).toThrow(/import it again/);
  });

  test("an import refused: not a template, or named as one of Upstart's", () => {
    const library = new TemplateLibrary(BUILT_IN, scratch());
    const empty = scratch();
    expect(library.read(empty)).toEqual({ problems: [expect.stringMatching(/template\.json/)] });
    expect(library.read(join(BUILT_IN, "beacon"))).toEqual({
      problems: [expect.stringMatching(/already has a template named "beacon"/)],
    });
  });
});

describe("a template shown large", () => {
  test("its pages to go to: each page, and one record's page of each page per record", () => {
    const runtime = new Runtime(
      textSource(
        new Map(
          Object.entries({
            "pages/index.liquid": "<html><body>Home</body></html>",
            "pages/work.liquid": "<html><body>Work</body></html>",
            "pages/work/[cases].liquid": "<html><body>{{ record.title }}</body></html>",
            "data/cases/_datasource.yaml": "label: Cases\nfields:\n  title: { type: text }\n",
            "data/cases/first.md": "---\ntitle: First case\n---\n",
            "data/cases/second.md": "---\ntitle: Second case\n---\n",
          }).map(([p, s]) => [p, Buffer.from(s)]),
        ),
      ),
    );
    const pages = pagesOf(runtime);
    expect(pages[0]).toEqual({ route: "/", name: "Home" });
    expect(pages).toContainEqual({ route: "/work", name: "Work" });
    expect(pages.filter((p) => p.route.startsWith("/work/"))).toHaveLength(1);
  });
});
