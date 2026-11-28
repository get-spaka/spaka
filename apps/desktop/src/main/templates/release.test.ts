// A release of Spaka's templates (Q247, Q250, Q265), and the app reading it:
// the catalogue and pictures shipped, the latest catalogue read, a template
// downloaded when needed, checked against its sha256, kept in the cache.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { checkTemplate } from "./check";
import { TemplateLibrary } from "./library";
import { MANIFEST } from "./manifest";
import { readTemplateFolder } from "./reader";
import {
  buildRelease,
  CATALOGUE_FILE,
  type Catalogue,
  type CatalogueEntry,
  earlierOf,
  parseCatalogue,
} from "./release";
import { readZip } from "./zip";

const BUILT_IN = join(import.meta.dirname, "../../../templates");
const scratch = () => mkdtempSync(join(tmpdir(), "spaka-release-"));
const RELEASES = "https://releases.example/spaka-templates/releases";
const APP = "0.2.0";

/** Its packages' online check (check-packages.ts), as if npm and OSV found nothing to say. */
const OFFLINE = { packages: async () => [] };

/** A release of Beacon and Reel, built as the public repository's CI builds one. */
async function release(tag = "v1"): Promise<{ out: string; catalogue: Catalogue }> {
  const root = scratch();
  for (const id of ["beacon", "reel"]) cpSync(join(BUILT_IN, id), join(root, id), { recursive: true });
  const out = scratch();
  return { out, catalogue: await buildRelease(root, out, tag, undefined, OFFLINE) };
}

/** The releases' server: `latest` answers with `latest`'s catalogue; offline, it throws. */
function server(releases: Record<string, string>, latest: string) {
  const asked: string[] = [];
  const state = { offline: false, broken: undefined as string | undefined };
  const fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    if (state.offline) throw new TypeError("fetch failed");
    const path = url.slice(RELEASES.length + 1);
    const [, tag, file] = /^(?:latest\/download|download\/([^/]+))\/(.+)$/.exec(path) ?? [];
    const dir = releases[tag ?? latest];
    if (!dir || !file || !existsSync(join(dir, file))) return new Response("Not Found", { status: 404 });
    let bytes = readFileSync(join(dir, file));
    if (file === state.broken) {
      bytes = Buffer.from(bytes);
      const middle = bytes.length >> 1;
      bytes[middle] = (bytes[middle] ?? 0) ^ 0xff;
    }
    return new Response(bytes);
  }) as typeof globalThis.fetch;
  return { fetch, asked, state };
}

/** The catalogue and the pictures shipped with the app, from a release. */
function snapshotOf(out: string, catalogue: Catalogue): string {
  const dir = scratch();
  writeFileSync(join(dir, CATALOGUE_FILE), readFileSync(join(out, CATALOGUE_FILE)));
  for (const t of catalogue.templates)
    for (const name of [t.cover, t.hover]) if (name) writeFileSync(join(dir, name), readFileSync(join(out, name)));
  return dir;
}

// A release checks and zips whole templates: longer than a test's usual time on a slow runner.
describe("a release", { timeout: 60_000 }, () => {
  test("each template checked, as a .zip with its sha256 and size, its pictures beside it, in the catalogue", async () => {
    const { out, catalogue } = await release("v3");
    expect(catalogue.release).toBe("v3");
    expect(catalogue.templates.map((t) => t.id)).toEqual(["beacon", "reel"]);
    const reel = catalogue.templates.find((t) => t.id === "reel")!;
    const zip = readFileSync(join(out, reel.zip.file));
    expect(reel.zip).toEqual({
      file: `reel-${reel.version}.zip`,
      sha256: createHash("sha256").update(zip).digest("hex"),
      size: zip.length,
    });
    expect(reel.cover).toBe(`reel-${reel.version}-cover.webp`);
    expect(existsSync(join(out, reel.hover!))).toBe(true);
    expect(parseCatalogue(readFileSync(join(out, CATALOGUE_FILE), "utf8"))).toEqual(catalogue);
  });

  test("the pictures of its pages are in its .zip, its cover and hover beside it (Q545)", async () => {
    const { out, catalogue } = await release();
    const reel = catalogue.templates.find((t) => t.id === "reel")!;
    const inZip = [...readZip(readFileSync(join(out, reel.zip.file))).keys()];
    expect(inZip).toContain("pictures/pages/home-desktop.webp");
    expect(inZip).toContain("pictures/pages/home-phone.webp");
    expect(inZip).not.toContain("pictures/cover.webp");
    expect(inZip).not.toContain("pictures/hover.webp");
  });

  test("a template whose packages npm or OSV refuse stops the release (Q546)", async () => {
    const root = scratch();
    cpSync(join(BUILT_IN, "beacon"), join(root, "beacon"), { recursive: true });
    const refused = { packages: async () => ["package.json: motion 14.9.0 is refused: a known flaw."] };
    await expect(buildRelease(root, scratch(), "v1", undefined, refused)).rejects.toThrow(/motion 14\.9\.0 is refused/);
  });

  test("built twice from the same sources, the same files", async () => {
    const a = (await release()).catalogue;
    const b = (await release()).catalogue;
    expect(b.templates.map((t) => t.zip.sha256)).toEqual(a.templates.map((t) => t.zip.sha256));
  });

  test("a template with an error stops the release", async () => {
    const root = scratch();
    cpSync(join(BUILT_IN, "beacon"), join(root, "beacon"), { recursive: true });
    writeFileSync(join(root, "beacon/template.json"), "{}");
    await expect(buildRelease(root, scratch(), "v1", undefined, OFFLINE)).rejects.toThrow(/not ready/);
  });

  test("a catalogue of another format, or an entry it cannot trust, is not read", async () => {
    expect(parseCatalogue(JSON.stringify({ format: 2, release: "v1", templates: [] }))).toBeUndefined();
    const { catalogue } = await release();
    const [beacon, reel] = catalogue.templates;
    const read = parseCatalogue(
      JSON.stringify({
        ...catalogue,
        templates: [
          { ...beacon, zip: { ...beacon!.zip, file: "../../beacon.zip" } },
          { ...reel, cover: "/etc/x" },
        ],
      }),
    );
    expect(read?.templates.map((t) => t.id)).toEqual(["reel"]);
    expect(read?.templates[0]?.cover).toBeUndefined();
  });
});

describe("the templates of a packaged app", { timeout: 60_000 }, () => {
  test("listed from the catalogue shipped, their pictures with it, offline", async () => {
    const { out, catalogue } = await release();
    const { fetch, asked, state } = server({ v1: out }, "v1");
    state.offline = true;
    const library = new TemplateLibrary(
      { releases: RELEASES, snapshot: snapshotOf(out, catalogue), cache: scratch(), fetch, app: APP },
      scratch(),
    );
    expect(await library.refresh()).toBe(false);
    expect(library.list().map((t) => t.id)).toEqual(["beacon", "reel"]);
    expect(await library.picture("reel", "hover")).toMatch(/^data:image\/webp;base64,/);
    expect(asked.filter((u) => u.endsWith(".webp"))).toEqual([]);
    // A template is downloaded only when it is needed, and it cannot be offline.
    await expect(library.dir("reel")).rejects.toThrow(/Reel could not be downloaded: check the connection/);
  });

  test("a template downloaded once, checked, then read from the cache", async () => {
    const { out, catalogue } = await release();
    const { fetch, asked } = server({ v1: out }, "v1");
    const cache = scratch();
    const library = new TemplateLibrary(
      { releases: RELEASES, snapshot: snapshotOf(out, catalogue), cache, fetch, app: APP },
      scratch(),
    );
    const [first, again] = await Promise.all([library.dir("reel"), library.dir("reel")]);
    expect(first).toBe(again);
    expect(first.startsWith(cache)).toBe(true);
    expect(JSON.parse(readFileSync(join(first, "template.json"), "utf8")).id).toBe("reel");
    expect(existsSync(join(first, "pages/index.liquid"))).toBe(true);
    expect(await library.dir("reel")).toBe(first);
    expect(asked.filter((u) => u.endsWith(".zip"))).toEqual([
      `${RELEASES}/download/v1/reel-${catalogue.templates[1]!.version}.zip`,
    ]);
  });

  test("a download that did not arrive whole is refused", async () => {
    const { out, catalogue } = await release();
    const { fetch, state } = server({ v1: out }, "v1");
    state.broken = catalogue.templates[0]!.zip.file;
    const cache = scratch();
    const library = new TemplateLibrary(
      { releases: RELEASES, snapshot: snapshotOf(out, catalogue), cache, fetch, app: APP },
      scratch(),
    );
    await expect(library.dir("beacon")).rejects.toThrow(/Beacon did not arrive whole/);
    expect(existsSync(join(cache, "templates/beacon"))).toBe(false);
  });

  test("the latest release read at the start replaces the shipped one, and is kept for the next start", async () => {
    const v1 = await release("v1");
    // v2 adds a version of Beacon.
    const root = scratch();
    cpSync(join(BUILT_IN, "beacon"), join(root, "beacon"), { recursive: true });
    const manifest = JSON.parse(readFileSync(join(root, "beacon/template.json"), "utf8"));
    writeFileSync(join(root, "beacon/template.json"), JSON.stringify({ ...manifest, version: "9.0.0" }));
    const v2out = scratch();
    await buildRelease(root, v2out, "v2", undefined, OFFLINE);
    const { fetch, asked, state } = server({ v1: v1.out, v2: v2out }, "v2");
    const cache = scratch();
    const snapshot = snapshotOf(v1.out, v1.catalogue);
    const library = new TemplateLibrary({ releases: RELEASES, snapshot, cache, fetch, app: APP }, scratch());
    expect(await library.refresh()).toBe(true);
    expect(asked[0]).toBe(`${RELEASES}/latest/download/catalogue.json`);
    expect(library.list().map((t) => `${t.id}@${t.version}`)).toEqual(["beacon@9.0.0"]);
    // Its pictures are not shipped: downloaded from its release, then kept.
    expect(await library.picture("beacon", "cover")).toMatch(/^data:image\/webp/);
    expect(asked).toContain(`${RELEASES}/download/v2/beacon-9.0.0-cover.webp`);
    expect(await library.dir("beacon")).toBe(join(cache, "templates/beacon/9.0.0"));
    // The next start, offline, has it still.
    state.offline = true;
    const next = new TemplateLibrary({ releases: RELEASES, snapshot, cache, fetch, app: APP }, scratch());
    expect(await next.refresh()).toBe(false);
    expect(next.list().map((t) => t.version)).toEqual(["9.0.0"]);
    expect(await next.dir("beacon")).toBe(join(cache, "templates/beacon/9.0.0"));
    expect(await next.picture("beacon", "cover")).toMatch(/^data:image\/webp/);
  });

  test("an imported template named as one of the catalogue's is refused", async () => {
    const { out, catalogue } = await release();
    const { fetch } = server({ v1: out }, "v1");
    const library = new TemplateLibrary(
      { releases: RELEASES, snapshot: snapshotOf(out, catalogue), cache: scratch(), fetch, app: APP },
      scratch(),
    );
    const dir = join(scratch(), "beacon");
    mkdirSync(dir);
    cpSync(join(BUILT_IN, "beacon"), dir, { recursive: true });
    expect(await library.read(dir)).toEqual({
      problems: [expect.stringMatching(/already has a template named "beacon"/)],
    });
  });
});

describe("earlier versions for older apps (Q368)", () => {
  const aspect = () => JSON.parse(readFileSync(join(BUILT_IN, "aspect", MANIFEST), "utf8"));
  /** An entry of a catalogue, its .zip and pictures named as a release names them. */
  const entry = (id: string, version: string, app?: string): CatalogueEntry => {
    const { app: _, ...manifest } = aspect();
    return {
      ...manifest,
      id,
      version,
      ...(app ? { app } : {}),
      zip: { file: `${id}-${version}.zip`, sha256: "a".repeat(64), size: 1 },
      cover: `${id}-${version}-cover.webp`,
    };
  };

  test("a template that uses the images field kind says it needs app 0.2.0", async () => {
    const files = readTemplateFolder(join(BUILT_IN, "aspect"));
    const { app: _, ...manifest } = aspect();
    files.set(MANIFEST, Buffer.from(JSON.stringify(manifest)));
    expect((await checkTemplate(files)).errors).toContainEqual(
      expect.stringMatching(
        /^data\/listings\/_datasource\.yaml: the images field kind needs Spaka 0\.2\.0 or later: add "app": "0\.2\.0"/,
      ),
    );
    files.set(MANIFEST, Buffer.from(JSON.stringify({ ...manifest, app: "0.2.0" })));
    expect((await checkTemplate(files)).errors.filter((e) => /field kind/.test(e))).toEqual([]);
  });

  test("Aspect 1.1.0, which needs app 0.2.0, keeps Aspect 1.0.0 of v8, release after release", async () => {
    const root = scratch();
    cpSync(join(BUILT_IN, "aspect"), join(root, "aspect"), { recursive: true });
    writeFileSync(join(root, "aspect", MANIFEST), JSON.stringify({ ...aspect(), version: "1.1.0", app: "0.2.0" }));
    const v8: Catalogue = { format: 1, release: "v8", templates: [entry("aspect", "1.0.0")], earlier: [] };
    const v10out = scratch();
    const v10 = await buildRelease(root, v10out, "v10", v8, OFFLINE);
    expect(v10.templates.map((t) => `${t.id}@${t.version} app ${t.app}`)).toEqual(["aspect@1.1.0 app 0.2.0"]);
    expect(v10.earlier).toEqual([{ ...entry("aspect", "1.0.0"), release: "v8" }]);
    expect(parseCatalogue(readFileSync(join(v10out, CATALOGUE_FILE), "utf8"))).toEqual(v10);
    // The release after, from v10's catalogue, has it still, from v8.
    expect((await buildRelease(root, scratch(), "v11", v10, OFFLINE)).earlier).toEqual(v10.earlier);
  });

  test("an earlier version is kept only while an app takes it", async () => {
    const v1 = (t: CatalogueEntry[], earlier: Catalogue["earlier"] = []): Catalogue => ({
      format: 1,
      release: "v1",
      templates: t,
      earlier,
    });
    const versions = (e: Catalogue["earlier"]) => e.map((t) => `${t.version} ${t.release}`);
    // A version any app opens needs none before it.
    expect(earlierOf([entry("aspect", "1.2.0")], v1([entry("aspect", "1.1.0", "0.2.0")]))).toEqual([]);
    // Each app version takes the newest it opens: 1.1.5 for 0.2.x, 1.0.0 before; 1.1.0 for none.
    const before = v1(
      [entry("aspect", "1.1.5", "0.2.0")],
      [
        { ...entry("aspect", "1.1.0", "0.2.0"), release: "v0" },
        { ...entry("aspect", "1.0.0"), release: "v0" },
      ],
    );
    expect(versions(earlierOf([entry("aspect", "1.2.0", "0.3.0")], before))).toEqual(["1.1.5 v1", "1.0.0 v0"]);
    // A template no longer released keeps none, and no other template's are taken.
    expect(earlierOf([entry("reel", "2.0.0", "0.3.0")], before)).toEqual([]);
    expect(earlierOf([entry("aspect", "1.2.0", "0.3.0")], undefined)).toEqual([]);
  });

  test("a catalogue before Q368 is read with no earlier versions; one with an unsafe release is not trusted", async () => {
    const { catalogue } = await release();
    const { earlier: _, ...old } = catalogue;
    expect(parseCatalogue(JSON.stringify(old))?.earlier).toEqual([]);
    const read = parseCatalogue(
      JSON.stringify({
        ...catalogue,
        earlier: [
          { ...entry("aspect", "1.0.0"), release: "../v8" },
          { ...entry("aspect", "0.9.0"), release: "v7" },
        ],
      }),
    );
    expect(read?.earlier.map((t) => t.version)).toEqual(["0.9.0"]);
  });
});
