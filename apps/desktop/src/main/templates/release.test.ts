// A release of Upstart's templates (Q247, Q250, Q265), and the app reading it:
// the catalogue and pictures shipped, the latest catalogue read, a template
// downloaded when needed, checked against its sha256, kept in the cache.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseCatalogue, TemplateLibrary } from "./library";
import { buildRelease, CATALOGUE_FILE, type Catalogue } from "./release";

const BUILT_IN = join(import.meta.dirname, "../../../templates");
const scratch = () => mkdtempSync(join(tmpdir(), "upstart-release-"));
const RELEASES = "https://releases.example/upstart-templates/releases";

/** A release of Beacon and Reel, built as the public repository's CI builds one. */
function release(tag = "v1"): { out: string; catalogue: Catalogue } {
  const root = scratch();
  for (const id of ["beacon", "reel"]) cpSync(join(BUILT_IN, id), join(root, id), { recursive: true });
  const out = scratch();
  return { out, catalogue: buildRelease(root, out, tag) };
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

describe("a release", () => {
  test("each template checked, as a .zip with its sha256 and size, its pictures beside it, in the catalogue", () => {
    const { out, catalogue } = release("v3");
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

  test("built twice from the same sources, the same files", () => {
    const a = release().catalogue;
    const b = release().catalogue;
    expect(b.templates.map((t) => t.zip.sha256)).toEqual(a.templates.map((t) => t.zip.sha256));
  });

  test("a template with an error stops the release", () => {
    const root = scratch();
    cpSync(join(BUILT_IN, "beacon"), join(root, "beacon"), { recursive: true });
    writeFileSync(join(root, "beacon/template.json"), "{}");
    expect(() => buildRelease(root, scratch(), "v1")).toThrow(/not ready/);
  });

  test("a catalogue of another format, or an entry it cannot trust, is not read", () => {
    expect(parseCatalogue(JSON.stringify({ format: 2, release: "v1", templates: [] }))).toBeUndefined();
    const { catalogue } = release();
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

describe("the templates of a packaged app", () => {
  test("listed from the catalogue shipped, their pictures with it, offline", async () => {
    const { out, catalogue } = release();
    const { fetch, asked, state } = server({ v1: out }, "v1");
    state.offline = true;
    const library = new TemplateLibrary(
      { releases: RELEASES, snapshot: snapshotOf(out, catalogue), cache: scratch(), fetch },
      scratch(),
    );
    expect(await library.refresh()).toBe(false);
    expect(library.list().map((t) => t.id)).toEqual(["reel", "beacon"]);
    expect(await library.picture("reel", "hover")).toMatch(/^data:image\/webp;base64,/);
    expect(asked.filter((u) => u.endsWith(".webp"))).toEqual([]);
    // A template is downloaded only when it is needed, and it cannot be offline.
    await expect(library.dir("reel")).rejects.toThrow(/Reel could not be downloaded: check the connection/);
  });

  test("a template downloaded once, checked, then read from the cache", async () => {
    const { out, catalogue } = release();
    const { fetch, asked } = server({ v1: out }, "v1");
    const cache = scratch();
    const library = new TemplateLibrary(
      { releases: RELEASES, snapshot: snapshotOf(out, catalogue), cache, fetch },
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
    const { out, catalogue } = release();
    const { fetch, state } = server({ v1: out }, "v1");
    state.broken = catalogue.templates[0]!.zip.file;
    const cache = scratch();
    const library = new TemplateLibrary(
      { releases: RELEASES, snapshot: snapshotOf(out, catalogue), cache, fetch },
      scratch(),
    );
    await expect(library.dir("beacon")).rejects.toThrow(/Beacon did not arrive whole/);
    expect(existsSync(join(cache, "templates/beacon"))).toBe(false);
  });

  test("the latest release read at the start replaces the shipped one, and is kept for the next start", async () => {
    const v1 = release("v1");
    // v2 adds a version of Beacon.
    const root = scratch();
    cpSync(join(BUILT_IN, "beacon"), join(root, "beacon"), { recursive: true });
    const manifest = JSON.parse(readFileSync(join(root, "beacon/template.json"), "utf8"));
    writeFileSync(join(root, "beacon/template.json"), JSON.stringify({ ...manifest, version: "9.0.0" }));
    const v2out = scratch();
    buildRelease(root, v2out, "v2");
    const { fetch, asked, state } = server({ v1: v1.out, v2: v2out }, "v2");
    const cache = scratch();
    const snapshot = snapshotOf(v1.out, v1.catalogue);
    const library = new TemplateLibrary({ releases: RELEASES, snapshot, cache, fetch }, scratch());
    expect(await library.refresh()).toBe(true);
    expect(asked[0]).toBe(`${RELEASES}/latest/download/catalogue.json`);
    expect(library.list().map((t) => `${t.id}@${t.version}`)).toEqual(["beacon@9.0.0"]);
    // Its pictures are not shipped: downloaded from its release, then kept.
    expect(await library.picture("beacon", "cover")).toMatch(/^data:image\/webp/);
    expect(asked).toContain(`${RELEASES}/download/v2/beacon-9.0.0-cover.webp`);
    expect(await library.dir("beacon")).toBe(join(cache, "templates/beacon/9.0.0"));
    // The next start, offline, has it still.
    state.offline = true;
    const next = new TemplateLibrary({ releases: RELEASES, snapshot, cache, fetch }, scratch());
    expect(await next.refresh()).toBe(false);
    expect(next.list().map((t) => t.version)).toEqual(["9.0.0"]);
    expect(await next.dir("beacon")).toBe(join(cache, "templates/beacon/9.0.0"));
    expect(await next.picture("beacon", "cover")).toMatch(/^data:image\/webp/);
  });

  test("an imported template named as one of the catalogue's is refused", () => {
    const { out, catalogue } = release();
    const { fetch } = server({ v1: out }, "v1");
    const library = new TemplateLibrary(
      { releases: RELEASES, snapshot: snapshotOf(out, catalogue), cache: scratch(), fetch },
      scratch(),
    );
    const dir = join(scratch(), "beacon");
    mkdirSync(dir);
    cpSync(join(BUILT_IN, "beacon"), dir, { recursive: true });
    expect(library.read(dir)).toEqual({ problems: [expect.stringMatching(/already has a template named "beacon"/)] });
  });
});
