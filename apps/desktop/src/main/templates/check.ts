// A template's checks (template:check, templates.test.ts): what makes it one
// Upstart can start a site from and an agent can adapt. Errors keep it out;
// warnings are for its author to read. The rules are those of Q231-Q243 and
// ADR 0011, and the gallery's for its blocks, less the rule that nothing
// floats (Q256).
import { infoFile, needsCredit, Runtime, TEST_RECORDS_DIR } from "@upstart/runtime";
import { droppedFiles, FIXED_COLOUR } from "../gallery/rules";
import { parseSkill } from "../skills/skills";
import { OPEN_LICENCES } from "./manifest";
import { shotPages } from "./pictures";
import {
  BLOCKS,
  DESIGN_SKILL,
  pageName,
  readTemplate,
  TEMPLATE_ENTRIES,
  TEXT,
  type Template,
  type TemplateFiles,
  textSource,
} from "./reader";

export type TemplateCheck = { template?: Template; errors: string[]; warnings: string[] };

/** Where libraries may be loaded from: servers that keep every published version. */
const LIBRARY_HOSTS = new Set(["cdn.jsdelivr.net", "unpkg.com"]);

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
    if (
      /\.(?:sh|command|exe|app|bat|cmd|ps1|dmg|pkg|node|dylib|so|dll)$/i.test(path) ||
      /(^|\/)package\.json$/.test(path)
    )
      errors.push(`${path}: a template holds no programs and no packages.`);
    if (path.startsWith("scripts/") && !/\.(?:m?js|json)$/.test(path))
      warnings.push(`${path}: scripts/ holds JavaScript modules, libraries and libraries.json only.`);
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
      `template.json: licence "${manifest.licence}" is not an open licence Upstart knows (${OPEN_LICENCES.join(", ")}).`,
    );

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
      errors.push(`${path}: no <script>, <style> or <link> tags; Upstart adds the site's scripts and stylesheet.`);
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

  // ---- nothing from outside but the libraries --------------------------------
  const remote =
    /<(?:img|source|video|audio|iframe)\b[^>]*\s(?:src|srcset|poster)\s*=\s*["']?https?:|\burl\(\s*["']?https?:|@import\s+(?:url\(\s*)?["']?https?:/i;
  for (const path of under("pages", "parts", "fragments", "data", "styles", BLOCKS)) {
    const found = remote.exec(text(path))?.[0];
    if (found) errors.push(`${path}: "${found}…" is taken from another site; put the file in media/ (or fonts/).`);
  }

  // ---- images and their credits (Q231) ---------------------------------------
  for (const { path, credit } of template.credits) {
    if (!/\.(?:jpe?g|png|webp|gif|avif|svg|mp4|webm)$/i.test(path)) continue;
    if (!credit?.license) {
      errors.push(`${path} has no credit: ${infoFile(path)} gives its licence, its author and where it was found.`);
      continue;
    }
    if (/\bnc\b|\bnd\b|non-?commercial|no-?deriv/i.test(credit.license))
      errors.push(
        `${path}: ${credit.license} forbids a business site or changes; take an image under CC0, CC BY or CC BY-SA.`,
      );
    if (needsCredit(credit.license) && !credit.author) errors.push(`${path}: ${credit.license} asks for its author.`);
    const info = text(infoFile(path));
    if (/\.(?:jpe?g|png|webp|gif|avif|svg)$/i.test(path) && !/"alt"\s*:\s*"[^"]/.test(info))
      warnings.push(`${path} has no alternative text in ${infoFile(path)}.`);
  }

  // ---- scripts (ADR 0011) -----------------------------------------------------
  const pinned = (url: string) => {
    try {
      const { host, pathname } = new URL(url);
      return LIBRARY_HOSTS.has(host) && /@\d+\.\d+\.\d+/.test(pathname);
    } catch {
      return false;
    }
  };
  for (const library of template.libraries) {
    if (/gsap|greensock/i.test(`${library.name} ${library.url}`))
      errors.push(
        `scripts/libraries.json: ${library.name}: never GSAP, whose licence forbids tools competing with Webflow.`,
      );
    if (!pinned(library.url))
      errors.push(
        `scripts/libraries.json: ${library.name}: from cdn.jsdelivr.net or unpkg.com, with its version (@1.2.3).`,
      );
    if (!library.licence) errors.push(`scripts/libraries.json: ${library.name} has no licence.`);
    else if (!OPEN_LICENCES.includes(library.licence as (typeof OPEN_LICENCES)[number]))
      errors.push(
        `scripts/libraries.json: ${library.name}: ${library.licence} is not an open licence (${OPEN_LICENCES.join(", ")}).`,
      );
  }
  for (const path of paths.filter((p) => /^scripts\/lib\/[^/]+\.js$/.test(p))) {
    if (/gsap|greensock/i.test(text(path).slice(0, 2000)))
      errors.push(`${path}: never GSAP, whose licence forbids tools competing with Webflow.`);
    if (!/licen[cs]e|\bMIT\b|\bBSD\b|\bISC\b|Apache|Unlicense/i.test(text(path).slice(0, 800)))
      errors.push(`${path}: write its licence's name at the top of the file.`);
  }
  const modules = paths.filter((p) => /^scripts\/[^/]+\.m?js$/.test(p));
  for (const path of modules) {
    const src = text(path);
    if (
      !/export\s+(?:async\s+)?function\s+start\b|export\s+(?:const|let|var)\s+start\b|export\s*\{[^}]*\bstart\b/.test(
        src,
      )
    )
      errors.push(`${path}: a module exports start(root), which Upstart calls.`);
    for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)["'](https?:[^"']+)["']/g))
      if (!pinned(m[1]!))
        errors.push(`${path}: ${m[1]} is imported from cdn.jsdelivr.net or unpkg.com, with its version.`);
    const elsewhere = [...src.matchAll(/["'`](https?:\/\/[^"'`\s]+)/g)]
      .map((m) => m[1]!)
      .filter((url) => !pinned(url) && !/^https?:\/\/(?:www\.)?w3\.org\//.test(url));
    for (const url of new Set(elsewhere))
      warnings.push(`${path} reaches ${url}: a site takes nothing from outside but its libraries.`);
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
    const page = "pages/upstart-block-check.liquid";
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
    for (const note of checking.renderRoute("/upstart-block-check").notes)
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
    const named = COLOR_PROPERTY.test(property) ? NAMED.exec(value)?.[0] : undefined;
    for (const color of [hex, fn, named]) if (color) found.push(`${property}: ${color}`);
  }
  return found;
}
