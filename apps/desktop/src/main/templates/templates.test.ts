// A template's format and checks (Q240, ADR 0011): read from a folder or a
// .zip alike, copied into a project without its manifest and pictures, and
// checked rule by rule; then every template of the app's own folder, as a
// finished one.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { checkTemplate, fixedColors } from "./check";
import { projectFiles, readTemplate, readTemplateFolder, readTemplateZip, type TemplateFiles } from "./reader";
import { readZip, writeZip } from "./zip";

const MANIFEST = {
  id: "atelier",
  version: "1.0.0",
  name: "Atelier",
  description: "A calm studio site whose sections rise into view, with a large type hero and a grid of work.",
  category: "portfolio",
  original: true,
  tags: ["studio", "ceramics"],
  author: { name: "Upstart", url: "https://upstart.gg" },
  licence: "MIT",
};

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><title>${title}</title></head><body>
{% render 'header' %}
<main>
${body}
</main>
</body></html>`;

/** A small, good template, every file of it. */
function good(): Record<string, string | Buffer> {
  return {
    "template.json": JSON.stringify(MANIFEST, null, 2),
    "theme.css":
      ":root {\n  --theme-color-primary: oklch(0.55 0.12 40);\n  --theme-color-surface: oklch(0.98 0.01 80);\n}\n",
    "pages/index.liquid": page(
      "Home — Atelier",
      `<section class="bg-base-100 text-base-content" data-reveal><h1 class="font-heading">Clay, slowly</h1>
<img src="/media/studio.jpg" alt="The studio"></section>`,
    ),
    "pages/about.liquid": page("About — Atelier", `<section class="bg-base-200"><h2>Since 2009</h2></section>`),
    "parts/header.liquid": `<header class="navbar bg-base-100"><a href="/">Atelier</a> <a href="/about">About</a></header>`,
    "media/studio.jpg": Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
    "media/studio.json": JSON.stringify({
      alt: "A ceramic studio",
      credit: {
        license: "CC BY 4.0",
        author: "Sam",
        source: "Wikimedia Commons",
        sourceUrl: "https://commons.wikimedia.org/",
      },
    }),
    "scripts/libraries.json": JSON.stringify([
      { name: "motion", url: "https://cdn.jsdelivr.net/npm/motion@14.9.0/dist/motion.min.js", licence: "MIT" },
    ]),
    "scripts/reveal.js": `const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let stops = [];
export function start(root) {
  if (reduced()) return;
  for (const el of document.querySelectorAll("[data-reveal]")) stops.push(Motion.inView(el, () => Motion.animate(el, { opacity: [0, 1] })));
}
export function stop() { for (const s of stops) s(); stops = []; }
`,
    "styles/site.css": `@media (prefers-reduced-motion: no-preference) {
  [data-rise] { animation: rise 1s both; }
  @keyframes rise { from { opacity: 0; } }
}
.glow { box-shadow: 0 0 2rem oklch(from var(--color-primary) l c h / 0.4); border-color: color-mix(in oklch, var(--color-primary), transparent); }
`,
    ".upstart/skills/atelier-design/SKILL.md": `---
name: atelier-design
description: The Atelier template's design notes — read before adapting it.
---

# Atelier

Calm, generous spacing; sections rise into view (scripts/reveal.js).
`,
    "blocks/hero/hero-atelier/block.json": JSON.stringify({
      name: "Atelier hero",
      kind: "hero",
      description: "A large serif headline over the studio's picture.",
      tags: ["hero"],
      mood: ["elegant"],
      synonyms: ["hero", "headline", "banner", "en-tête", "accroche"],
    }),
    "blocks/hero/hero-atelier/block.liquid": `<section class="hero bg-base-200"><h1 class="text-5xl">Clay, slowly</h1></section>`,
    "pictures/cover.webp": Buffer.from("cover"),
    "pictures/hover.webp": Buffer.from("hover"),
    "pictures/pages/home-desktop.webp": Buffer.from("1"),
    "pictures/pages/home-phone.webp": Buffer.from("2"),
    "pictures/pages/about-desktop.webp": Buffer.from("3"),
    "pictures/pages/about-phone.webp": Buffer.from("4"),
    "README.md": "# Atelier\n",
    "TEMPLATE.md": `# Atelier

A calm studio site, for a ceramicist or a small workshop.

## How it is made

- \`/\`: the hero, then the studio's work.

## Pages

### Home (\`/\`)

The hero, then the studio's work.

### About (\`/about\`)

The studio's story.

When removed: the header's link to it goes.
`,
  };
}

function files(change: Record<string, string | Buffer | null> = {}): TemplateFiles {
  const all = { ...good(), ...change };
  return new Map(
    Object.entries(all)
      .filter((e): e is [string, string | Buffer] => e[1] !== null)
      .map(([path, value]) => [path, Buffer.isBuffer(value) ? value : Buffer.from(value)]),
  );
}

const check = (change: Record<string, string | Buffer | null> = {}, finished = true) =>
  checkTemplate(files(change), { finished });

const errorsOf = (change: Record<string, string | Buffer | null>) => check(change).errors.join("\n");
const warningsOf = (change: Record<string, string | Buffer | null>) => check(change).warnings.join("\n");

describe("a good template", () => {
  test("passes every check, with nothing to warn of", () => {
    const result = check();
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("is read with its blocks, libraries, credits and pictures", () => {
    const read = readTemplate(files());
    if (!("template" in read)) throw new Error(read.problems.join("; "));
    const { template } = read;
    expect(template.manifest.name).toBe("Atelier");
    expect(template.blocks.map((b) => b.id)).toEqual(["hero-atelier"]);
    expect(template.libraries.map((l) => `${l.name} ${l.licence}`)).toEqual(["motion MIT"]);
    expect(template.credits).toEqual([
      { path: "media/studio.jpg", credit: expect.objectContaining({ license: "CC BY 4.0", author: "Sam" }) },
    ]);
    expect(template.pictures).toEqual({
      cover: "pictures/cover.webp",
      hover: "pictures/hover.webp",
      pages: [
        { page: "home", desktop: "pictures/pages/home-desktop.webp", phone: "pictures/pages/home-phone.webp" },
        { page: "about", desktop: "pictures/pages/about-desktop.webp", phone: "pictures/pages/about-phone.webp" },
      ],
    });
  });

  test("a new project copies its site's files, not its manifest, pictures or readme (Q240)", () => {
    const copied = [...projectFiles(files({ "notes.txt": "mine" })).keys()];
    expect(copied).toContain("pages/index.liquid");
    expect(copied).toContain("blocks/hero/hero-atelier/block.liquid");
    expect(copied).toContain(".upstart/skills/atelier-design/SKILL.md");
    expect(copied).toContain("media/studio.json");
    for (const left of ["template.json", "TEMPLATE.md", "pictures/cover.webp", "README.md", "notes.txt"])
      expect(copied).not.toContain(left);
  });
});

describe("read from a .zip or a folder alike", () => {
  test("a .zip gives back the same files, byte for byte, the same files making the same .zip", () => {
    const zip = writeZip(files());
    expect(readTemplateZip(zip)).toEqual(files());
    expect(writeZip(files()).equals(zip)).toBe(true);
  });

  test("a .zip of the template's folder, as the Finder makes it, is read at that folder", () => {
    const wrapped = new Map([...files()].map(([p, b]) => [`atelier/${p}`, b]));
    wrapped.set("__MACOSX/atelier/._template.json", Buffer.from("x"));
    expect(readTemplateZip(writeZip(wrapped))).toEqual(files());
  });

  test("a .zip with a file outside the template, damaged or too large is refused", () => {
    const zip = writeZip(new Map([["pages/a.liquid", Buffer.from("aaaaaaaaaa")]]));
    // The path rewritten in place, in the local and central headers alike.
    const climbing = Buffer.from(zip.toString("latin1").replaceAll("pages/a.liquid", "../../a.liquid"), "latin1");
    expect(() => readZip(climbing)).toThrow(/outside the template/);
    const damaged = Buffer.from(zip);
    const at = 30 + "pages/a.liquid".length;
    damaged[at] = damaged[at]! ^ 0xff;
    expect(() => readZip(damaged)).toThrow(/damaged/);
    expect(() => readZip(zip, { files: 10, bytes: 5 })).toThrow(/more than/);
    expect(() => readZip(Buffer.from("not a zip at all, not even close to one"))).toThrow(/not a \.zip/);
  });

  test("a folder leaves out a project's own .upstart files and what is no template's", () => {
    const dir = mkdtempSync(join(tmpdir(), "template-"));
    const extra = {
      ".upstart/project.json": '{"id":"x"}',
      ".upstart/history/1.json": "{}",
      ".git/HEAD": "ref",
      "node_modules/x/index.js": "",
      "pages/.DS_Store": "",
    };
    for (const [path, value] of [...files(), ...Object.entries(extra)]) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), value);
    }
    expect(readTemplateFolder(dir)).toEqual(files());
  });
});

describe("its checks", () => {
  test("its manifest", () => {
    expect(errorsOf({ "template.json": null })).toMatch(/no template\.json/);
    expect(errorsOf({ "template.json": "{" })).toMatch(/not JSON/);
    expect(errorsOf({ "template.json": JSON.stringify({ ...MANIFEST, id: "Atelier", category: "shop" }) })).toMatch(
      /id:[\s\S]*category:/,
    );
    expect(warningsOf({ "template.json": JSON.stringify({ ...MANIFEST, licence: "All rights reserved" }) })).toMatch(
      /not an open licence/,
    );
  });

  test("its guide (Q299, Q304, Q306): there, with a section per page type, the home page first", () => {
    expect(warningsOf({ "TEMPLATE.md": null })).toMatch(/TEMPLATE\.md is missing/);
    expect(warningsOf({ "TEMPLATE.md": "# Atelier\n\nA calm studio site.\n" })).toMatch(
      /TEMPLATE\.md has no "## Pages" section/,
    );
    const pages = (...sections: string[]) => `# Atelier\n\n## Pages\n\n${sections.join("\n\n")}\n`;
    expect(
      warningsOf({ "TEMPLATE.md": pages("### Home (`/`)\n\nThe hero.", "### About (`/about`)\n\nThe story.") }),
    ).toBe("");
    expect(warningsOf({ "TEMPLATE.md": pages("### Home (`/`)\n\nThe hero.") })).toMatch(
      /TEMPLATE\.md has no section for \/about under "## Pages" \(pages\/about\.liquid\)/,
    );
    expect(
      warningsOf({ "TEMPLATE.md": pages("### About (`/about`)\n\nThe story.", "### Home (`/`)\n\nThe hero.") }),
    ).toMatch(/the home page's section \(`\/`\) comes first/);
    expect(
      warningsOf({
        "TEMPLATE.md": pages(
          "### Home (`/`)\n\nThe hero.",
          "### About (`/about`)\n\nThe story.",
          "### Shop (`/shop`)\n\nGone.",
        ),
      }),
    ).toMatch(/"Shop" \(\/shop\) is no page type of the template/);
    expect(
      warningsOf({ "TEMPLATE.md": pages("### Home (`/`)\n\nThe hero.", "### About (`/about`)\n\nx", "### The shop") }),
    ).toMatch(/"### The shop" under "## Pages" does not name its page type/);
    // An older template.json with questions is read without them.
    const old = { ...MANIFEST, questions: [{ question: "How?", options: [{ label: "A" }, { label: "B" }] }] };
    expect(errorsOf({ "template.json": JSON.stringify(old) })).toBe("");
  });

  test("a home page and a theme", () => {
    expect(errorsOf({ "pages/index.liquid": null })).toMatch(/pages\/index\.liquid is missing/);
    expect(errorsOf({ "theme.css": null })).toMatch(/theme\.css is missing/);
  });

  test("every page renders with no note", () => {
    expect(errorsOf({ "pages/about.liquid": page("About", "{% render 'nowhere' %}") })).toMatch(
      /pages\/about\.liquid|nowhere/,
    );
    expect(errorsOf({ "pages/_drafts.liquid": page("Draft", "<p>x</p>") })).toMatch(/gets no address/);
    expect(errorsOf({ "data/team/_datasource.yaml": "label: Team\nfields: [" })).toMatch(/data\/team/);
  });

  test("no script, style or link tag in its templates, and no data-theme", () => {
    expect(errorsOf({ "parts/header.liquid": "<header><script>alert(1)</script></header>" })).toMatch(/no <script>/);
    expect(errorsOf({ "pages/about.liquid": page("About", '<link rel="stylesheet" href="/x.css">') })).toMatch(
      /no <script>/,
    );
    expect(errorsOf({ "parts/header.liquid": '<header data-theme="dark"></header>' })).toMatch(/data-theme/);
  });

  test("the theme's colors only (Q234), a color made from them being the theme's", () => {
    expect(errorsOf({ "parts/header.liquid": '<header class="bg-blue-600 text-white"></header>' })).toMatch(
      /bg-blue-600/,
    );
    expect(errorsOf({ "parts/header.liquid": '<header style="color: #333"></header>' })).toMatch(/color: #333/);
    expect(errorsOf({ "styles/site.css": ".a { background: rgb(255 0 0); }" })).toMatch(/rgb\(255 0 0\)/);
    expect(errorsOf({ "styles/site.css": ".a { --glow: #ffcc00; }" })).toMatch(/#ffcc00/);
    expect(errorsOf({ "styles/site.css": ".a { color: white; }" })).toMatch(/color: white/);
    expect(
      fixedColors(`.a { color: var(--color-primary); background: linear-gradient(to bottom, var(--color-base-100), transparent);
  box-shadow: 0 0 1rem oklch(from var(--color-primary) l c h / 0.3); mask: linear-gradient(black, transparent);
  border-color: color-mix(in oklch, var(--color-base-content) 20%, transparent); filter: url(#grain); }`),
    ).toEqual([]);
    // A font's name is not a color, even when it holds one.
    expect(
      fixedColors(`:root { --font-mono: "Red Hat Mono", ui-monospace; --font-body: 'Pink Sans', sans-serif; }`),
    ).toEqual([]);
    expect(fixedColors(`:root { --edge: red; }`)).toEqual(["--edge: red"]);
  });

  test("nothing taken from another site but the libraries", () => {
    expect(errorsOf({ "pages/about.liquid": page("About", '<img src="https://example.com/a.jpg" alt="">') })).toMatch(
      /taken from another site/,
    );
    expect(errorsOf({ "styles/site.css": '@import url("https://fonts.example.com/a.css");' })).toMatch(/another site/);
    expect(errorsOf({ "styles/site.css": ".a { background-image: url(https://example.com/a.png); }" })).toMatch(
      /another site/,
    );
    // A link to another site is a link, not something taken from it.
    expect(
      errorsOf({ "parts/header.liquid": '<header><a href="https://instagram.com/atelier">Instagram</a></header>' }),
    ).toBe("");
  });

  test("each image credited, under a licence a business site may use (Q231)", () => {
    expect(errorsOf({ "media/studio.json": null })).toMatch(/media\/studio\.jpg has no credit/);
    expect(
      errorsOf({
        "media/studio.json": JSON.stringify({ alt: "x", credit: { license: "CC BY-NC 4.0", author: "Sam" } }),
      }),
    ).toMatch(/forbids a business site/);
    expect(errorsOf({ "media/studio.json": JSON.stringify({ alt: "x", credit: { license: "CC BY 4.0" } }) })).toMatch(
      /asks for its author/,
    );
    expect(warningsOf({ "media/studio.json": JSON.stringify({ credit: { license: "CC0" } }) })).toMatch(
      /alternative text/,
    );
  });

  test("its libraries pinned, from a server that keeps them, under an open licence, never GSAP", () => {
    const libraries = (entry: object) => ({ "scripts/libraries.json": JSON.stringify([entry]) });
    expect(
      errorsOf(
        libraries({ name: "motion", url: "https://cdn.jsdelivr.net/npm/motion/dist/motion.min.js", licence: "MIT" }),
      ),
    ).toMatch(/with its version/);
    expect(errorsOf(libraries({ name: "x", url: "https://example.com/x@1.0.0/x.js", licence: "MIT" }))).toMatch(
      /cdn\.jsdelivr\.net or unpkg\.com/,
    );
    expect(errorsOf(libraries({ name: "x", url: "https://unpkg.com/x@1.0.0/x.js" }))).toMatch(/has no licence/);
    expect(errorsOf(libraries({ name: "x", url: "https://unpkg.com/x@1.0.0/x.js", licence: "GPL-3.0" }))).toMatch(
      /not an open licence/,
    );
    expect(
      errorsOf(
        libraries({ name: "gsap", url: "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js", licence: "MIT" }),
      ),
    ).toMatch(/never GSAP/);
    expect(errorsOf({ "scripts/lib/tilt.js": "window.tilt = () => {};" })).toMatch(/licence's name at the top/);
    expect(errorsOf({ "scripts/lib/tilt.js": "/* tilt.js, MIT licence */ window.tilt = () => {};" })).toBe("");
  });

  test("each module exports start, imports pinned libraries, and leaves movement out under reduced motion", () => {
    expect(errorsOf({ "scripts/reveal.js": "export function begin() {}" })).toMatch(/exports start\(root\)/);
    expect(errorsOf({ "scripts/split.js": "export const start = () => {};" })).toBe("");
    expect(
      errorsOf({ "scripts/gl.js": 'import { Renderer } from "https://esm.sh/ogl";\nexport function start() {}' }),
    ).toMatch(/imported from cdn\.jsdelivr\.net/);
    expect(warningsOf({ "scripts/move.js": "export function start() { requestAnimationFrame(() => {}); }" })).toMatch(
      /prefers-reduced-motion/,
    );
    expect(
      warningsOf({
        "scripts/rise.js": 'export function start() { Motion.animate(el, { opacity: 1, transform: "none" }); }',
      }),
    ).toMatch(/shrinks the element/);
    expect(
      warningsOf({ "scripts/track.js": 'export function start() { fetch("https://tracker.example.com/hit"); }' }),
    ).toMatch(/reaches https:\/\/tracker/);
  });

  test("its stylesheet animates under no-preference, and hides nothing a script must show", () => {
    expect(warningsOf({ "styles/site.css": ".a { animation: spin 2s infinite; }" })).toMatch(/prefers-reduced-motion/);
    expect(warningsOf({ "styles/site.css": "[data-reveal] { opacity: 0; }" })).toMatch(/hides something/);
  });

  test("its design notes, named after it (Q239)", () => {
    expect(errorsOf({ ".upstart/skills/atelier-design/SKILL.md": null })).toMatch(/design notes/);
    expect(
      errorsOf({ ".upstart/skills/atelier-design/SKILL.md": "---\nname: other-design\ndescription: x\n---\n" }),
    ).toMatch(/its name is atelier-design/);
  });

  test("its blocks describe themselves and render once dropped into its pages (Q235)", () => {
    expect(errorsOf({ "blocks/hero/hero-atelier/block.json": "{" })).toMatch(
      /blocks\/hero\/hero-atelier: block\.json is not JSON/,
    );
    expect(errorsOf({ "blocks/hero/hero-atelier/block.liquid": "<section>{% render 'nowhere' %}</section>" })).toMatch(
      /hero-atelier, dropped into a page/,
    );
    expect(errorsOf({ "blocks/hero/hero-atelier/block.liquid": '<section class="text-white">x</section>' })).toMatch(
      /text-white/,
    );
  });

  test("its pictures: required once finished, a warning while it is made", () => {
    const none = { "pictures/cover.webp": null, "pictures/pages/about-phone.webp": null };
    expect(errorsOf(none)).toMatch(
      /pictures\/cover\.webp, pictures\/pages\/about-\{desktop,phone\}\.webp[\s\S]*template:shoot/,
    );
    const making = check(none, false);
    expect(making.errors).toEqual([]);
    expect(making.warnings.join("\n")).toMatch(/template:shoot/);
  });

  test("its pictures: the first record's page of each page per record, not the others'", () => {
    const projects = {
      "data/projects/_datasource.yaml":
        "label: Projects\nfields:\n  - name: title\n    kind: text\norder: [kiln, vases]\n",
      "data/projects/kiln.md": '---\ntitle: "The kiln"\n---\n',
      "data/projects/vases.md": '---\ntitle: "Vases"\n---\n',
      "pages/work/[projects].liquid": page(
        "{{ record.title }} — Atelier",
        "<section><h1>{{ record.title }}</h1></section>",
      ),
    };
    expect(errorsOf(projects)).toMatch(/pictures\/pages\/work-kiln-\{desktop,phone\}\.webp/);
    expect(errorsOf(projects)).not.toMatch(/work-vases/);
    expect(
      errorsOf({
        ...projects,
        "pictures/pages/work-kiln-desktop.webp": Buffer.from("5"),
        "pictures/pages/work-kiln-phone.webp": Buffer.from("6"),
      }),
    ).toBe("");
  });

  test("what is no template's is named, programs refused", () => {
    expect(warningsOf({ "notes.txt": "x" })).toMatch(/notes\.txt is not part of a template/);
    expect(errorsOf({ "scripts/install.sh": "rm -rf /" })).toMatch(/no programs/);
    expect(errorsOf({ "package.json": "{}" })).toMatch(/no programs and no packages/);
  });
});

test("the checks' own template, a folder on disk with its pictures, passes as a finished one", () => {
  const result = checkTemplate(readTemplateFolder(join(__dirname, "../../../../../e2e/fixtures/templates/atelier")), {
    finished: true,
  });
  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
  expect(result.template?.pictures.pages.map((p) => p.page)).toEqual(["home", "about"]);
});

// The app's own templates, each a finished one, its folder named after its id.
const TEMPLATES = join(__dirname, "../../../templates");
const shipped = existsSync(TEMPLATES)
  ? readdirSync(TEMPLATES, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(TEMPLATES, e.name, "template.json")))
      .map((e) => e.name)
  : [];

describe.runIf(shipped.length > 0).each(shipped)("the app's template %s", (id) => {
  test("passes every check as a finished template", () => {
    const result = checkTemplate(readTemplateFolder(join(TEMPLATES, id)), { finished: true });
    expect(result.errors).toEqual([]);
    expect(result.template?.manifest.id).toBe(id);
  });
});
