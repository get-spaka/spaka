// The start screen's templates (Q249, Q264): Spaka's own and the maker's
// imported ones, listed originals first; an import read, shown, then added.
// Of a released template's versions, the newest the app's version opens (Q368).
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { pagePicture, shownPages } from "./large";
import { TemplateLibrary } from "./library";
import { MANIFEST } from "./manifest";
import { readTemplateFolder } from "./reader";
import { CATALOGUE_FILE, type Catalogue, type CatalogueEntry } from "./release";
import { writeZip } from "./zip";

const BUILT_IN = join(import.meta.dirname, "../../../templates");
const scratch = () => mkdtempSync(join(tmpdir(), "spaka-templates-"));

/** Beacon, copied under another id, as an outside author's template. */
function outsideTemplate(id: string): string {
  const dir = join(scratch(), id);
  cpSync(join(BUILT_IN, "beacon"), dir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(dir, "template.json"), "utf8"));
  writeFileSync(join(dir, "template.json"), JSON.stringify({ ...manifest, id, name: "Lighthouse" }));
  const skills = join(dir, ".spaka/skills");
  renameSync(join(skills, "beacon-design"), join(skills, `${id}-design`));
  const skill = join(skills, `${id}-design/SKILL.md`);
  writeFileSync(skill, readFileSync(skill, "utf8").replace("name: beacon-design", `name: ${id}-design`));
  return dir;
}

describe("the templates to start from", () => {
  test("every template, by name (Q396)", async () => {
    const list = new TemplateLibrary({ folder: BUILT_IN }, scratch()).list();
    const names = list.map((t) => t.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(list.every((t) => !t.imported)).toBe(true);
    expect(list.map((t) => t.id)).toContain("reel");
  });

  test("a picture as a data URL; a template or picture it does not have, none", async () => {
    const library = new TemplateLibrary({ folder: BUILT_IN }, scratch());
    expect(await library.picture("reel", "cover")).toMatch(/^data:image\/webp;base64,/);
    expect(await library.picture("reel", "hover")).toMatch(/^data:image\/webp;base64,/);
    expect(await library.picture("nothing", "cover")).toBeNull();
    await expect(library.dir("../reel")).rejects.toThrow(/no such template/);
  });

  test("an import is read and shown first, then added, listed as imported", async () => {
    const imported = scratch();
    const library = new TemplateLibrary({ folder: BUILT_IN }, imported);
    const answer = await library.read(outsideTemplate("lighthouse"));
    if (!("token" in answer)) throw new Error(answer.problems.join("\n"));
    expect(answer.template).toMatchObject({ id: "lighthouse", name: "Lighthouse", imported: true });
    expect(answer.cover).toMatch(/^data:image\/webp/);
    expect(answer.pages.length).toBeGreaterThan(0);
    // Not added until the maker says so.
    expect(library.get("lighthouse")).toBeUndefined();
    expect(library.accept(answer.token).id).toBe("lighthouse");
    expect(library.get("lighthouse")).toMatchObject({ imported: true });
    expect(await library.dir("lighthouse")).toBe(join(imported, "lighthouse"));
    expect(() => library.accept(answer.token)).toThrow(/import it again/);
  });

  test("an import refused: not a template, or named as one of Spaka's", async () => {
    const library = new TemplateLibrary({ folder: BUILT_IN }, scratch());
    const empty = scratch();
    expect(await library.read(empty)).toEqual({ problems: [expect.stringMatching(/template\.json/)] });
    expect(await library.read(join(BUILT_IN, "beacon"))).toEqual({
      problems: [expect.stringMatching(/already has a template named "beacon"/)],
    });
  });
});

describe("the version of a template an app takes (Q368)", () => {
  const RELEASES = "https://releases.example/spaka-templates/releases";

  /**
   * Aspect as released: 1.0.0 in v8, which any app opens, kept in v10 beside
   * 1.1.0, which needs app 0.2.0; and Tomorrow, which no app of today opens.
   * The app ships v10's catalogue alone, its pictures downloaded when shown.
   */
  function releases() {
    const files = readTemplateFolder(join(BUILT_IN, "aspect"));
    const { app: _, ...manifest } = JSON.parse(files.get(MANIFEST)!.toString("utf8"));
    const dirs: Record<string, string> = { v8: scratch(), v10: scratch() };
    const publish = (tag: string, version: string, app?: string): CatalogueEntry => {
      const m = { ...manifest, version, ...(app ? { app } : {}) };
      const zip = writeZip(
        new Map(
          [...files, [MANIFEST, Buffer.from(JSON.stringify(m))] as const].filter(([p]) => !p.startsWith("pictures/")),
        ),
      );
      const file = `aspect-${version}.zip`;
      writeFileSync(join(dirs[tag]!, file), zip);
      const cover = `aspect-${version}-cover.webp`;
      writeFileSync(join(dirs[tag]!, cover), files.get("pictures/cover.webp")!);
      return { ...m, zip: { file, sha256: createHash("sha256").update(zip).digest("hex"), size: zip.length }, cover };
    };
    const tomorrow = { ...publish("v10", "3.0.0", "9.0.0"), id: "tomorrow", name: "Tomorrow" };
    const catalogue: Catalogue = {
      format: 1,
      release: "v10",
      templates: [publish("v10", "1.1.0", "0.2.0"), tomorrow],
      earlier: [{ ...publish("v8", "1.0.0"), release: "v8" }],
    };
    const snapshot = scratch();
    writeFileSync(join(snapshot, CATALOGUE_FILE), JSON.stringify(catalogue));
    writeFileSync(join(dirs.v10!, CATALOGUE_FILE), JSON.stringify(catalogue));
    const asked: string[] = [];
    const fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      asked.push(url);
      const [, tag, file] = /\/(?:latest\/download|download\/([^/]+))\/([^/]+)$/.exec(url) ?? [];
      const dir = dirs[tag ?? "v10"];
      if (!dir || !file || !existsSync(join(dir, file))) return new Response("Not Found", { status: 404 });
      return new Response(readFileSync(join(dir, file)));
    }) as typeof globalThis.fetch;
    const library = (app: string) =>
      new TemplateLibrary({ releases: RELEASES, snapshot, cache: scratch(), app, fetch }, scratch());
    return { library, asked };
  }

  test("an app before 0.2.0 takes Aspect 1.0.0, from v8", async () => {
    const { library, asked } = releases();
    const app = library("0.1.0");
    expect(app.list().map((t) => `${t.id}@${t.version}`)).toEqual(["aspect@1.0.0"]);
    const dir = await app.dir("aspect");
    expect(JSON.parse(readFileSync(join(dir, MANIFEST), "utf8")).version).toBe("1.0.0");
    expect(await app.picture("aspect", "cover")).toMatch(/^data:image\/webp/);
    expect(asked).toEqual([
      `${RELEASES}/download/v8/aspect-1.0.0.zip`,
      `${RELEASES}/download/v8/aspect-1.0.0-cover.webp`,
    ]);
  });

  test("an app of 0.2.0 or later takes Aspect 1.1.0, from v10, the latest catalogue read or not", async () => {
    const { library, asked } = releases();
    for (const version of ["0.2.0", "0.2.1-beta.1", "1.0.0"]) {
      const app = library(version);
      if (version === "1.0.0") await app.refresh();
      expect(app.list().map((t) => `${t.id}@${t.version}`)).toEqual(["aspect@1.1.0"]);
    }
    const app = library("0.2.0");
    expect(JSON.parse(readFileSync(join(await app.dir("aspect"), MANIFEST), "utf8"))).toMatchObject({
      version: "1.1.0",
      app: "0.2.0",
    });
    expect(asked).toContain(`${RELEASES}/download/v10/aspect-1.1.0.zip`);
  });

  test("a template with no version the app opens is not shown", async () => {
    const { library } = releases();
    const app = library("0.2.0");
    expect(app.get("tomorrow")).toBeUndefined();
    await expect(app.dir("tomorrow")).rejects.toThrow(/no such template/);
    expect(await app.picture("tomorrow", "cover")).toBeNull();
  });
});

describe("a template shown large (Q541, Q544)", () => {
  test("its pages with their pictures: each page, one record's page of each page per record, none without a picture", async () => {
    const dir = scratch();
    const files: Record<string, string> = {
      "pages/index.liquid": "<html><body>Home</body></html>",
      "pages/work.liquid": "<html><body>Work</body></html>",
      "pages/about-us.liquid": "<html><body>About</body></html>",
      "pages/work/[cases].liquid": "<html><body>{{ record.title }}</body></html>",
      "data/cases/_datasource.yaml": "label: Cases\nfields:\n  title: { type: text }\n",
      "data/cases/first.md": "---\ntitle: First case\n---\n",
      "data/cases/second.md": "---\ntitle: Second case\n---\n",
      "pictures/pages/home-desktop.webp": "RIFF",
      "pictures/pages/home-phone.webp": "RIFF",
      "pictures/pages/work-desktop.webp": "RIFF",
      "pictures/pages/work-first-desktop.webp": "RIFF",
      "pictures/pages/work-first-phone.webp": "RIFF",
    };
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    expect(shownPages(dir)).toEqual([
      { route: "/", name: "Home", page: "home", desktop: true, phone: true },
      { route: "/work", name: "Work", page: "work", desktop: true, phone: false },
      { route: "/work/first", name: "First case", page: "work-first", desktop: true, phone: true },
    ]);
    expect(pagePicture(dir, "home", "phone")).toBe(`data:image/webp;base64,${Buffer.from("RIFF").toString("base64")}`);
    expect(pagePicture(dir, "work", "phone")).toBeNull();
    expect(pagePicture(dir, "../home", "phone")).toBeNull();
  });
});
