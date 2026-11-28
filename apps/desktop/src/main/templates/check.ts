// A template's checks (template:check, templates.test.ts): what makes it one
// Spaka can start a site from and an agent can adapt. Errors keep it out;
// warnings are for its author to read. The rules are those of Q231-Q243,
// ADR 0011 and ADR 0013, and the gallery's for its blocks, less the rule that
// nothing floats (Q256). What its packages are, as npm, OSV and deps.dev say,
// is checked online by check-packages.ts (Q542, Q546).
import {
  Datasources,
  DEFINITION_FILE,
  type FieldKind,
  importedSpecifiers,
  infoFile,
  memorySource,
  moduleSpecifiers,
  needsCredit,
  Runtime,
  specifierPackage,
  TEST_RECORDS_DIR,
} from "@spaka/runtime";
import { droppedFiles, FIXED_COLOUR } from "../gallery/rules";
import { lockfileOf } from "../packages/lockfile";
import { parseSkill } from "../skills/skills";
import { OPEN_LICENCES, olderVersion } from "./manifest";
import { guideSections, HOME, PAGES_SECTION, pageTypes, strayPageHeadings } from "./pages";
import { shotPages } from "./pictures";
import {
  BLOCKS,
  DESIGN_SKILL,
  GUIDE,
  pageName,
  readTemplate,
  TEMPLATE_ENTRIES,
  TEXT,
  type Template,
  type TemplateFiles,
  textSource,
} from "./reader";

export type TemplateCheck = { template?: Template; errors: string[]; warnings: string[] };

/** The app version that knows a site's packages (ADR 0013, Q543). */
export const PACKAGES_APP = "0.2.0";

/** What a template's package.json holds: its dependencies, and maybe these. */
const PACKAGE_FIELDS = new Set(["name", "private", "type", "dependencies"]);

/** A version written as it is installed: never a range, a tag or a pre-release (Q546). */
export const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/** GSAP, whose licence forbids tools competing with Webflow. */
export const GSAP = /^(?:gsap|@gsap\/.+|greensock|@greensock\/.+)$/i;

/** Field kinds an older app reads as text, and the app version that knows them (Q368). */
export const FIELD_KIND_APP: Partial<Record<FieldKind, string>> = { images: "0.2.0" };

/** The app version that keeps a generated image's model and prompt in place of its credits (Q428, Q432). */
export const GENERATED_APP = "0.2.0";

const MEDIA_LIMIT = 3 * 1024 * 1024;
const TOTAL_LIMIT = 50 * 1024 * 1024;

/**
 * Checks a template's files. `finished`: a template shipped or published,
 * which must also have its pictures.
 */
export function checkTemplate(files: TemplateFiles, { finished = false } = {}): TemplateCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const read = readTemplate(files);
  if ("problems" in read) return { errors: read.problems, warnings };
  const { template } = read;
  const { manifest } = template;
  const paths = [...files.keys()];
  const text = (path: string) => files.get(path)?.toString("utf8") ?? "";
  const under = (...dirs: string[]) => paths.filter((p) => dirs.some((d) => p.startsWith(`${d}/`)) && TEXT.test(p));

  // ---- what it holds ----------------------------------------------------------
  for (const top of new Set(paths.map((p) => p.split("/")[0]!)))
    if (!TEMPLATE_ENTRIES.has(top)) warnings.push(`${top} is not part of a template: it is not copied into a site.`);
  for (const path of paths) {
    if (/\.(?:sh|command|exe|app|bat|cmd|ps1|dmg|pkg|node|dylib|so|dll|wasm)$/i.test(path))
      errors.push(`${path}: a template holds no programs.`);
    if (/\/(?:package\.json|pnpm-lock\.yaml)$/.test(path))
      errors.push(`${path}: a template's package.json and pnpm-lock.yaml are at its root.`);
    if (path === "scripts/libraries.json")
      errors.push(
        `${path} is no longer read: list its libraries in package.json, at their exact versions, and import them by their names (ADR 0013).`,
      );
    else if (path.startsWith("scripts/") && !/\.m?js$/.test(path))
      warnings.push(`${path}: scripts/ holds JavaScript modules only.`);
    if (path.startsWith("media/") && files.get(path)!.length > MEDIA_LIMIT)
      warnings.push(`${path} weighs more than 3 MB: make it lighter.`);
  }
  const total = [...files.values()].reduce((n, b) => n + b.length, 0);
  if (total > TOTAL_LIMIT)
    warnings.push(`The template weighs ${Math.round(total / 1024 / 1024)} MB: keep it under 50.`);
  for (const required of ["pages/index.liquid", "theme.css"])
    if (!files.has(required)) errors.push(`${required} is missing.`);
  if (!OPEN_LICENCES.includes(manifest.licence as (typeof OPEN_LICENCES)[number]) && !/^CC/i.test(manifest.licence))
    warnings.push(
      `template.json: licence "${manifest.licence}" is not an open licence Spaka knows (${OPEN_LICENCES.join(", ")}).`,
    );

  // ---- the app it needs (Q368) ------------------------------------------------
  for (const path of paths.filter((p) => p.endsWith(`/${DEFINITION_FILE}`))) {
    const definition = new Datasources(memorySource({ [`data/d/${DEFINITION_FILE}`]: text(path) })).get("d").definition;
    for (const kind of new Set(definition?.fields.map((f) => f.kind))) {
      const needed = FIELD_KIND_APP[kind];
      if (needed && olderVersion(manifest.app ?? "0.0.0", needed))
        errors.push(
          `${path}: the ${kind} field kind needs Spaka ${needed} or later: add "app": "${needed}" to template.json.`,
        );
    }
  }

  // ---- its packages (ADR 0013, Q542, Q546) -----------------------------------
  const declared = packagesProblems(files, errors);
  if (declared.size && olderVersion(manifest.app ?? "0.0.0", PACKAGES_APP))
    errors.push(
      `package.json: packages need Spaka ${PACKAGES_APP} or later: add "app": "${PACKAGES_APP}" to template.json.`,
    );
  const imported = new Set<string>();
  for (const path of paths.filter((p) => /^scripts\/.+\.m?js$/.test(p))) {
    const src = text(path);
    for (const specifier of importedSpecifiers(src)) {
      const named = specifierPackage(specifier);
      if (!named) errors.push(`${path}: "${specifier}" is not the name of a package, nor a path inside one.`);
      else if (!declared.has(named.name))
        errors.push(`${path} imports ${named.name}, which package.json does not list.`);
      else imported.add(named.name);
    }
    for (const address of moduleSpecifiers(src).filter((s) => /^[a-z][a-z0-9+.-]*:/i.test(s)))
      errors.push(
        `${path}: ${address} is imported from an address: list the package in package.json and import it by its name.`,
      );
  }
  for (const name of declared.keys())
    if (!imported.has(name)) warnings.push(`package.json lists ${name}, which no script imports: remove it.`);

  // ---- it renders -------------------------------------------------------------
  const source = textSource(files);
  const tests = textSource(files, `${TEST_RECORDS_DIR}/`);
  const runtime = new Runtime(source, { repair: false, trace: false, testRecords: tests });
  const routes = runtime.routes();
  for (const { route, file } of routes) {
    const result = runtime.renderRoute(route);
    if (result.status !== 200) errors.push(`${file} (${route}) does not render: status ${result.status}.`);
    for (const note of result.notes) errors.push(`${note.file} (${route}): ${note.note}`);
  }
  for (const note of runtime.pageNotes()) errors.push(`${note.file}: ${note.note}`);
  for (const name of runtime.data.names()) {
    const ds = runtime.data.get(name);
    for (const note of ds.notes) errors.push(`${note.file}: ${note.note}`);
    for (const problem of ds.problems) errors.push(`${problem.file}: ${problem.problems.join("; ")}`);
  }
  for (const path of paths) {
    const name = /^fragments\/([\w-]+)\.liquid$/.exec(path)?.[1];
    if (!name) continue;
    for (const note of runtime.renderFragment(name, { params: {} }).notes)
      warnings.push(`${note.file} (rendered with no record): ${note.note}`);
  }

  // ---- its templates and texts ------------------------------------------------
  const templates = under("pages", "parts", "fragments", BLOCKS).filter((p) => p.endsWith(".liquid"));
  for (const path of templates) {
    const src = text(path);
    if (/<script\b|<style\b|<link\b/i.test(src))
      errors.push(`${path}: no <script>, <style> or <link> tags; Spaka adds the site's scripts and stylesheet.`);
    if (/\sdata-theme\s*=/.test(src)) errors.push(`${path}: no data-theme attribute; the theme is theme.css.`);
    if (/lorem ipsum/i.test(src)) warnings.push(`${path}: lorem ipsum; a template's texts read as a real site's.`);
  }

  // ---- colors from the theme (Q234) ------------------------------------------
  for (const path of [...templates, ...under("data", BLOCKS).filter((p) => p.endsWith(".md"))]) {
    const fixed = FIXED_COLOUR.exec(text(path))?.[0];
    if (fixed)
      errors.push(`${path}: "${fixed.trim()}" is a color of its own; use the theme's (primary, base-content…).`);
    for (const m of text(path).matchAll(/\sstyle\s*=\s*"([^"]*)"/g))
      for (const found of fixedColors(m[1]!)) errors.push(`${path}: style="…${found}…" is a color of its own.`);
  }
  for (const path of under("styles").filter((p) => p.endsWith(".css")))
    for (const found of fixedColors(text(path)))
      errors.push(`${path}: ${found} is a color of its own; use the theme's variables (var(--color-primary)…).`);

  // ---- nothing from outside ---------------------------------------------------
  const remote =
    /<(?:img|source|video|audio|iframe)\b[^>]*\s(?:src|srcset|poster)\s*=\s*["']?https?:|\burl\(\s*["']?https?:|@import\s+(?:url\(\s*)?["']?https?:/i;
  for (const path of under("pages", "parts", "fragments", "data", "styles", BLOCKS)) {
    const found = remote.exec(text(path))?.[0];
    if (found) errors.push(`${path}: "${found}…" is taken from another site; put the file in media/ (or fonts/).`);
  }

  // ---- images and their credits (Q231) ---------------------------------------
  for (const { path, credit, generated } of template.credits) {
    if (!/\.(?:jpe?g|png|webp|gif|avif|svg|mp4|webm)$/i.test(path)) continue;
    if (generated && !credit) {
      // A generated image has no licence to credit: its model and prompt say how it was made.
      if (
        typeof generated.model !== "string" ||
        !generated.model ||
        typeof generated.prompt !== "string" ||
        !generated.prompt.trim()
      )
        errors.push(`${path} is generated: ${infoFile(path)} gives the model and the prompt it was generated with.`);
      if (olderVersion(manifest.app ?? "0.0.0", GENERATED_APP))
        errors.push(
          `${path} is generated: it needs Spaka ${GENERATED_APP} or later: add "app": "${GENERATED_APP}" to template.json.`,
        );
    } else if (!credit?.license) {
      errors.push(`${path} has no credit: ${infoFile(path)} gives its licence, its author and where it was found.`);
      continue;
    } else {
      if (/\bnc\b|\bnd\b|non-?commercial|no-?deriv/i.test(credit.license))
        errors.push(
          `${path}: ${credit.license} forbids a business site or changes; take an image under CC0, CC BY or CC BY-SA.`,
        );
      if (needsCredit(credit.license) && !credit.author) errors.push(`${path}: ${credit.license} asks for its author.`);
    }
    const info = text(infoFile(path));
    if (/\.(?:jpe?g|png|webp|gif|avif|svg)$/i.test(path) && !/"alt"\s*:\s*"[^"]/.test(info))
      warnings.push(`${path} has no alternative text in ${infoFile(path)}.`);
  }

  // ---- scripts (ADR 0011) -----------------------------------------------------
  const modules = paths.filter((p) => /^scripts\/[^/]+\.m?js$/.test(p));
  for (const path of modules) {
    const src = text(path);
    if (
      !/export\s+(?:async\s+)?function\s+start\b|export\s+(?:const|let|var)\s+start\b|export\s*\{[^}]*\bstart\b/.test(
        src,
      )
    )
      errors.push(`${path}: a module exports start(root), which Spaka calls.`);
    const elsewhere = [...src.matchAll(/["'`](https?:\/\/[^"'`\s]+)/g)]
      .map((m) => m[1]!)
      .filter((url) => !/^https?:\/\/(?:www\.)?w3\.org\//.test(url));
    for (const url of new Set(elsewhere)) warnings.push(`${path} reaches ${url}: a site takes nothing from outside.`);
    if (/\banimate\s*\([^)]*\btransform\s*:\s*["']none["']/.test(src))
      warnings.push(
        `${path}: Motion turns transform "none" into a transform that shrinks the element to nothing: animate y: [24, 0].`,
      );
    if (/\banimate\b|inView|scroll\(|requestAnimationFrame|new Lenis/.test(src) && !/prefers-reduced-motion/.test(src))
      warnings.push(`${path} moves the page: leave the movement out under prefers-reduced-motion.`);
  }
  for (const path of under("styles").filter((p) => p.endsWith(".css"))) {
    const css = text(path).replace(/\/\*[\s\S]*?\*\//g, "");
    if (/\b(?:animation|transition)\s*:/.test(css) && !/prefers-reduced-motion/.test(css))
      warnings.push(`${path} animates: wrap its animations in @media (prefers-reduced-motion: no-preference).`);
    if (/(?:^|[;{\s])(?:opacity\s*:\s*0(?:\.0+)?\s*[;}]|visibility\s*:\s*hidden)/.test(stripKeyframes(css)))
      warnings.push(
        `${path} hides something: if a script shows it, set the hidden state from the script, or edit mode shows it hidden.`,
      );
  }

  // ---- design notes (Q239) ----------------------------------------------------
  const notes = `${DESIGN_SKILL(manifest.id)}/SKILL.md`;
  if (!files.has(notes)) errors.push(`${notes} is missing: the design notes the agent reads before adapting it.`);
  else {
    const skill = parseSkill(text(notes));
    if ("problem" in skill) errors.push(`${notes}: ${skill.problem}`);
    else if (skill.name !== `${manifest.id}-design`) errors.push(`${notes}: its name is ${manifest.id}-design.`);
  }

  // ---- its guide (Q299, Q304, Q306) -----------------------------------------
  if (!files.has(GUIDE))
    warnings.push(
      `${GUIDE} is missing: the guide the agent reads to adapt it (what it is, how it is made, how to adapt it, and under "${PAGES_SECTION}" a section per page type).`,
    );
  else if (!new RegExp(`^${PAGES_SECTION}\\s*$`, "m").test(text(GUIDE)))
    warnings.push(
      `${GUIDE} has no "${PAGES_SECTION}" section: a "### Name (\`/route\`)" section per page type, the home page first, each saying what the page shows, its choices and what to change when it is removed.`,
    );
  else {
    const sections = guideSections(text(GUIDE));
    const types = pageTypes(paths);
    for (const type of types)
      if (!sections.pages.some((p) => p.route === type.route))
        warnings.push(
          `${GUIDE} has no section for ${type.route} under "${PAGES_SECTION}" (${type.files.join(", ")}): add "### Name (\`${type.route}\`)".`,
        );
    for (const page of sections.pages)
      if (!types.some((t) => t.route === page.route))
        warnings.push(
          `${GUIDE}: "${page.name}" (${page.route}) is no page type of the template: its pages are pages/${page.route.slice(1)}… .`,
        );
    for (const heading of strayPageHeadings(text(GUIDE)))
      warnings.push(
        `${GUIDE}: "${heading.trim()}" under "${PAGES_SECTION}" does not name its page type: "### Name (\`/route\`)".`,
      );
    if (sections.pages.length && sections.pages[0]!.route !== HOME)
      warnings.push(
        `${GUIDE}: the home page's section (\`/\`) comes first under "${PAGES_SECTION}": it is adapted first.`,
      );
  }

  // ---- its blocks (Q235) ------------------------------------------------------
  const blockFolders = new Set(
    paths.filter((p) => p.startsWith(`${BLOCKS}/`)).map((p) => p.split("/").slice(1, 3).join("/")),
  );
  const readFolders = template.blocks.map((b) => `${b.kind}/${b.id}`);
  for (const folder of blockFolders)
    if (!readFolders.includes(folder)) {
      const id = folder.split("/")[1];
      errors.push(`${BLOCKS}/${folder}: ${skippedProblem(files, folder) ?? `not a block (${id})`}`);
    }
  for (const b of template.blocks) {
    if (!new RegExp(`^${b.kind}-[a-z0-9-]+$`).test(b.id))
      errors.push(`${BLOCKS}/${b.kind}/${b.id}: its id starts with ${b.kind}-.`);
    if (b.synonyms.length < 4)
      warnings.push(`${BLOCKS}/${b.kind}/${b.id}: give it four synonyms or more, English and French.`);
    const page = "pages/spaka-block-check.liquid";
    const dropped = droppedFiles(b);
    const overlay: Record<string, string> = {};
    for (const [path, value] of Object.entries(dropped)) {
      if (path === "pages/index.liquid") overlay[page] = value;
      else if (!path.startsWith("data/") || !files.has(`data/${b.data?.name}/_datasource.yaml`)) overlay[path] = value;
    }
    const checking = new Runtime(
      {
        read: (path) => overlay[path] ?? source.read(path),
        list: (dir) =>
          [...new Set([...source.list(dir), ...Object.keys(overlay).filter((p) => p.startsWith(`${dir}/`))])].sort(),
      },
      { repair: false, trace: false, testRecords: tests },
    );
    for (const note of checking.renderRoute("/spaka-block-check").notes)
      errors.push(`${BLOCKS}/${b.kind}/${b.id}, dropped into a page: ${note.note}`);
  }

  // ---- its pictures -----------------------------------------------------------
  const missing: string[] = [];
  if (!template.pictures.cover) missing.push("pictures/cover.webp");
  if (!template.pictures.hover) missing.push("pictures/hover.webp");
  for (const { route } of shotPages(files)) {
    const shot = template.pictures.pages.find((p) => p.page === pageName(route));
    if (!shot?.desktop || !shot.phone) missing.push(`pictures/pages/${pageName(route)}-{desktop,phone}.webp`);
  }
  if (missing.length)
    (finished ? errors : warnings).push(`Its pictures are missing (${missing.join(", ")}): run pnpm template:shoot.`);

  return { template, errors, warnings };
}

/**
 * Its package.json and lockfile, as Spaka installs them (Q546): the
 * dependencies only, each at its exact version, never GSAP, and the lockfile
 * pnpm wrote for them. The packages it lists, by name and version; the
 * problems go into `errors`.
 */
function packagesProblems(files: TemplateFiles, errors: string[]): Map<string, string> {
  const declared = new Map<string, string>();
  const manifest = files.get("package.json")?.toString("utf8");
  const lock = files.get("pnpm-lock.yaml")?.toString("utf8");
  if (manifest === undefined) {
    if (lock !== undefined) errors.push("pnpm-lock.yaml without a package.json: remove it.");
    return declared;
  }
  let json: unknown;
  try {
    json = JSON.parse(manifest);
  } catch (error) {
    errors.push(`package.json is not JSON: ${error instanceof Error ? error.message : error}`);
    return declared;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    errors.push("package.json: an object, with its dependencies, is expected.");
    return declared;
  }
  for (const key of Object.keys(json))
    if (!PACKAGE_FIELDS.has(key))
      errors.push(
        `package.json: "${key}": a template's package.json holds its dependencies only, with name, private and type.`,
      );
  const dependencies = (json as { dependencies?: unknown }).dependencies ?? {};
  if (typeof dependencies !== "object" || Array.isArray(dependencies) || dependencies === null) {
    errors.push("package.json: dependencies is an object, each package's name with its version.");
    return declared;
  }
  for (const [name, version] of Object.entries(dependencies)) {
    if (!specifierPackage(name) || name.includes("/") !== name.startsWith("@"))
      errors.push(`package.json: "${name}" is not a package's name.`);
    else if (GSAP.test(name))
      errors.push(`package.json: ${name}: never GSAP, whose licence forbids tools competing with Webflow.`);
    else if (typeof version !== "string" || !EXACT_VERSION.test(version))
      errors.push(`package.json: ${name}: its exact version, such as 1.2.3, not ${JSON.stringify(version)}.`);
    else declared.set(name, version);
  }
  if (!Object.keys(dependencies).length) return declared;
  if (lock === undefined) {
    errors.push("pnpm-lock.yaml is missing: install the packages with pnpm template:install, which writes it.");
    return declared;
  }
  if (!/^lockfileVersion:\s*'?9\./m.test(lock))
    errors.push("pnpm-lock.yaml: lockfile format 9 is expected, as Spaka's pnpm writes it.");
  const { direct } = lockfileOf(lock);
  const locked = new Map(direct.filter((d) => d.field === "dependencies").map((d) => [d.name, d]));
  const differs = [
    ...[...declared]
      .filter(
        ([name, version]) =>
          locked.get(name)?.specifier !== version || locked.get(name)?.version.replace(/\(.*$/, "") !== version,
      )
      .map(([name]) => name),
    ...[...locked.keys()].filter((name) => !(name in dependencies)),
    ...direct.filter((d) => d.field !== "dependencies").map((d) => d.name),
  ];
  if (differs.length)
    errors.push(
      `pnpm-lock.yaml does not say what package.json does (${[...new Set(differs)].join(", ")}): install the packages again with pnpm template:install.`,
    );
  return declared;
}

/** Why a block folder was not read, as readBlocks says. */
function skippedProblem(files: TemplateFiles, folder: string): string | undefined {
  if (!files.has(`${BLOCKS}/${folder}/block.json`)) return "block.json is missing";
  if (!files.has(`${BLOCKS}/${folder}/block.liquid`)) return "block.liquid is missing";
  try {
    JSON.parse(files.get(`${BLOCKS}/${folder}/block.json`)!.toString("utf8"));
  } catch (error) {
    return `block.json is not JSON: ${error instanceof Error ? error.message : error}`;
  }
  return undefined;
}

function stripKeyframes(css: string): string {
  let out = css;
  for (;;) {
    const at = out.search(/@keyframes\b/);
    if (at < 0) return out;
    let depth = 0;
    let end = out.indexOf("{", at);
    if (end < 0) return out.slice(0, at);
    for (; end < out.length; end++) {
      if (out[end] === "{") depth++;
      else if (out[end] === "}" && --depth === 0) break;
    }
    out = out.slice(0, at) + out.slice(end + 1);
  }
}

/** Color properties, where a named color is a color. */
const COLOR_PROPERTY =
  /^(?:--[\w-]+|color|background(?:-color|-image)?|border(?:-[\w-]+)?|outline(?:-color)?|fill|stroke|(?:box|text)-shadow|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?|filter|stop-color|flood-color|lighting-color)$/;
const NAMED =
  /\b(?:white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|gold|navy|teal|maroon|olive|lime|aqua|fuchsia|cyan|magenta|brown|beige|ivory|coral|salmon|tomato|crimson|indigo|violet|khaki|lavender|turquoise)\b/i;

/**
 * The colors of their own in CSS declarations: #hex, rgb(), oklch()… and named
 * colors. A color made from the theme's (`oklch(from var(--color-primary) l c h / 0.5)`,
 * `color-mix(in oklch, var(--color-primary), transparent)`) is the theme's.
 */
export function fixedColors(css: string): string[] {
  const found: string[] = [];
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of plain.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)) {
    const property = m[1]!.toLowerCase();
    const value = m[2]!.replace(/url\([^)]*\)/gi, "").replace(/var\(\s*--[\w-]+/g, "var(");
    const hex = /#[0-9a-f]{3,8}\b/i.exec(value)?.[0];
    const fn = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*(?!from\b)[^)]*\)/i.exec(value)?.[0];
    // A quoted name ("Red Hat Mono") is a font's, not a color.
    const named = COLOR_PROPERTY.test(property) ? NAMED.exec(value.replace(/"[^"]*"|'[^']*'/g, '""'))?.[0] : undefined;
    for (const color of [hex, fn, named]) if (color) found.push(`${property}: ${color}`);
  }
  return found;
}
