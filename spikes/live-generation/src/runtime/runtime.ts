// A minimal stand-in for the Upstart runtime (ADR 0003): renders a project's
// Liquid templates into pages and fragments, reads its datasources and handles
// the generated write endpoint. Throwaway spike code; the conventions below are
// the spike's own, just real enough to exercise the three requests.
//
//   theme.css                  the theme's CSS variables (--theme-*)
//   pages/index.liquid         -> /            (a full HTML document)
//   pages/about.liquid         -> /about
//   parts/header.liquid        shared part, used with {% render 'header' %}
//   fragments/x.liquid         -> GET /fragments/x (an HTML fragment)
//   data/books.json            datasource: { kind, fields, records }
//   POST /data/books           adds a record, answers fragments/books-created.liquid
//
// Files that the agent is still writing live in `overlay` and win over the disk.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Drop, Liquid } from "liquidjs";
import { injectTrace, repairTemplate } from "./template.ts";

export class ProjectFiles {
  root: string;
  /** Project-relative path -> content received so far for a file being written. */
  overlay = new Map<string, string>();
  constructor(root: string) {
    this.root = root;
  }
  rel(abs: string): string | undefined {
    const r = path.relative(this.root, abs);
    return r.startsWith("..") || path.isAbsolute(r) ? undefined : r.split(path.sep).join("/");
  }
  read(rel: string): string | undefined {
    const o = this.overlay.get(rel);
    if (o !== undefined) return o;
    const abs = path.join(this.root, rel);
    try {
      return statSync(abs).isFile() ? readFileSync(abs, "utf8") : undefined;
    } catch {
      return undefined;
    }
  }
  exists(rel: string): boolean {
    return this.overlay.has(rel) || existsSync(path.join(this.root, rel));
  }
  /** All known files under a folder (disk plus overlay), project-relative. */
  list(dir: string): string[] {
    const out = new Set<string>();
    const walk = (d: string) => {
      let entries: string[] = [];
      try {
        entries = readdirSync(path.join(this.root, d));
      } catch {
        return;
      }
      for (const e of entries) {
        const rel = `${d}/${e}`;
        if (statSync(path.join(this.root, rel)).isDirectory()) walk(rel);
        else out.add(rel);
      }
    };
    walk(dir);
    for (const rel of this.overlay.keys()) if (rel.startsWith(dir + "/")) out.add(rel);
    return [...out].sort();
  }
}

/** A stand-in record for a datasource that does not exist yet: every field renders as a placeholder. */
class GhostRecord extends Drop {
  liquidMethodMissing(key: string | number) {
    if (key === "__ref") return "";
    if (key === "__ghost") return true;
    return "░░░░░░";
  }
}

export type Datasource = {
  name: string;
  kind: "authored" | "collected";
  fields: Record<string, string>;
  records: Record<string, unknown>[];
};

/**
 * A data file that is still being written: keep the records that are complete.
 * Cuts after the last finished object of the first array and closes what is open.
 */
export function parseDatasource(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {}
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  let lastGood = -1; // offset just after the last complete element of an array one level down
  let closersAtGood = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") {
      stack.pop();
      if (c === "}" && stack.length === 2 && stack[1] === "[") {
        lastGood = i + 1;
        closersAtGood = "]}";
      }
    }
  }
  if (lastGood < 0) {
    // No complete record yet: the definition alone, if its "fields" object is closed.
    const m = /^([\s\S]*"fields"\s*:\s*\{[^{}]*\})/.exec(raw);
    if (!m) throw new Error("not parseable yet");
    const def = JSON.parse(m[1] + "}");
    def.__partial = true;
    return def;
  }
  const def = JSON.parse(raw.slice(0, lastGood) + closersAtGood);
  def.__partial = true;
  return def;
}

export type RenderNote = { file: string; note: string };

export type RenderResult = {
  status: number;
  html: string;
  /** The page file the route resolved to, if any. */
  file?: string;
  notes: RenderNote[];
  ms: number;
};

export type RuntimeOptions = {
  /** Add data-up-src / data-up-rec to elements (preview only). */
  trace?: boolean;
  /** Stand-in records for loops over datasources that do not exist yet. */
  ghosts?: boolean;
};

const PAGE_EXT = [".liquid", ".html"];

export class Runtime {
  files: ProjectFiles;
  opts: Required<RuntimeOptions>;
  private notes: RenderNote[] = [];

  constructor(root: string, opts: RuntimeOptions = {}) {
    this.files = new ProjectFiles(root);
    this.opts = { trace: true, ghosts: true, ...opts };
  }

  private engine(): Liquid {
    const files = this.files;
    const self = this;
    return new Liquid({
      root: [path.join(files.root, "pages"), path.join(files.root, "fragments")],
      partials: [path.join(files.root, "parts")],
      extname: ".liquid",
      cache: false,
      relativeReference: false,
      ownPropertyOnly: false,
      fs: {
        resolve: (dir, file, ext) => path.resolve(dir, path.extname(file) ? file : file + ext),
        // A shared part that is included before it exists renders as nothing, and says so.
        exists: async () => true,
        existsSync: () => true,
        contains: async () => true,
        containsSync: () => true,
        readFile: async (abs) => self.source(abs),
        readFileSync: (abs) => self.source(abs),
        dirname: (f) => path.dirname(f),
        sep: path.sep,
      },
    });
  }

  /** Template source ready for LiquidJS: repaired if unfinished, traced if asked. */
  private source(abs: string): string {
    const rel = this.files.rel(abs) ?? abs;
    const raw = this.files.read(rel);
    if (raw === undefined) {
      this.notes.push({ file: rel, note: "missing: rendered as nothing" });
      return "";
    }
    return this.prepare(raw, rel);
  }

  prepare(raw: string, rel: string): string {
    const r = repairTemplate(raw);
    if (r.cutAt < raw.length || r.closers.length)
      this.notes.push({
        file: rel,
        note: `repaired: ${r.cutReason ?? "unclosed blocks"}; closed ${r.closers.join(" ") || "nothing"}`,
      });
    return this.opts.trace ? injectTrace(r.src, rel) : r.src;
  }

  // ---- datasources -------------------------------------------------------

  datasources(): Record<string, Datasource> {
    const out: Record<string, Datasource> = {};
    for (const rel of this.files.list("data")) {
      if (!rel.endsWith(".json")) continue;
      const name = path.basename(rel, ".json");
      const raw = this.files.read(rel);
      if (!raw) continue;
      try {
        const def = parseDatasource(raw);
        if (def.__partial) this.notes.push({ file: rel, note: "repaired: data file still being written" });
        const records: Record<string, unknown>[] = Array.isArray(def.records) ? def.records : [];
        records.forEach((r, i) => {
          if (r && typeof r === "object") {
            if (r.id === undefined) r.id = i + 1;
            Object.defineProperty(r, "__ref", { value: `${name}/${r.id}`, enumerable: false });
          }
        });
        out[name] = { name, kind: def.kind === "collected" ? "collected" : "authored", fields: def.fields ?? {}, records };
      } catch {
        // A data file that is still being written is not valid JSON yet: skip it for now.
        this.notes.push({ file: rel, note: "not valid JSON yet: datasource skipped" });
      }
    }
    return out;
  }

  private globals(templateSources: string[], extra: Record<string, unknown> = {}) {
    const ds = this.datasources();
    const g: Record<string, unknown> = {};
    for (const d of Object.values(ds)) g[d.name] = d.records;
    if (this.opts.ghosts) {
      // {% for x in name %} over a name that is no datasource yet: three stand-in records.
      for (const src of templateSources) {
        for (const m of src.matchAll(/\{%-?\s*for\s+[\w-]+\s+in\s+([a-zA-Z_][\w-]*)[\s%-]/g)) {
          const name = m[1];
          if (name in g || name in extra) continue;
          if (new RegExp(`\\{%-?\\s*(assign|capture)\\s+${name}\\b`).test(src)) continue;
          g[name] = [new GhostRecord(), new GhostRecord(), new GhostRecord()];
          this.notes.push({ file: `data/${name}.json`, note: "no such datasource yet: three stand-in records" });
        }
      }
    }
    return { ...g, ...extra };
  }

  // ---- pages and fragments ----------------------------------------------

  routes(): { route: string; file: string }[] {
    const out: { route: string; file: string }[] = [];
    for (const rel of this.files.list("pages")) {
      const ext = PAGE_EXT.find((e) => rel.endsWith(e));
      if (!ext) continue;
      let r = rel.slice("pages/".length, -ext.length);
      if (r === "index") r = "";
      else if (r.endsWith("/index")) r = r.slice(0, -"/index".length);
      out.push({ route: "/" + r, file: rel });
    }
    return out;
  }

  resolve(route: string): string | undefined {
    const clean = "/" + route.replace(/^\/+|\/+$/g, "");
    return this.routes().find((r) => r.route === clean)?.file;
  }

  routeOf(file: string): string | undefined {
    return this.routes().find((r) => r.file === file)?.route;
  }

  private async renderFile(rel: string, scope: Record<string, unknown>): Promise<string> {
    const raw = this.files.read(rel) ?? "";
    const parts = this.files.list("parts").map((p) => this.files.read(p) ?? "");
    const src = this.prepare(raw, rel);
    return this.engine().parseAndRender(src, this.globals([raw, ...parts], scope));
  }

  async renderRoute(route: string, query: Record<string, string> = {}): Promise<RenderResult> {
    const t = performance.now();
    this.notes = [];
    const file = this.resolve(route);
    if (!file) return { status: 404, html: "", notes: [], ms: 0 };
    try {
      const html = await this.renderFile(file, { page: { url: route, path: route }, params: query });
      return { status: 200, html, file, notes: this.notes, ms: performance.now() - t };
    } catch (e) {
      this.notes.push({ file, note: `render error: ${(e as Error).message.split("\n")[0]}` });
      return { status: 500, html: "", file, notes: this.notes, ms: performance.now() - t };
    }
  }

  /** Render a shared part or any template on its own (used when no page exists yet). */
  async renderLoose(rel: string): Promise<RenderResult> {
    const t = performance.now();
    this.notes = [];
    try {
      const html = await this.renderFile(rel, { page: { url: "/", path: "/" }, params: {} });
      return { status: 200, html, file: rel, notes: this.notes, ms: performance.now() - t };
    } catch (e) {
      this.notes.push({ file: rel, note: `render error: ${(e as Error).message.split("\n")[0]}` });
      return { status: 500, html: "", file: rel, notes: this.notes, ms: performance.now() - t };
    }
  }

  async renderFragment(name: string, scope: Record<string, unknown>): Promise<RenderResult> {
    const t = performance.now();
    this.notes = [];
    const rel = `fragments/${name}.liquid`;
    if (!this.files.exists(rel)) return { status: 404, html: "", notes: [{ file: rel, note: "missing" }], ms: 0 };
    try {
      const html = await this.renderFile(rel, scope);
      return { status: 200, html, file: rel, notes: this.notes, ms: performance.now() - t };
    } catch (e) {
      return { status: 500, html: "", file: rel, notes: [{ file: rel, note: (e as Error).message }], ms: 0 };
    }
  }

  // ---- the generated write endpoint --------------------------------------

  /** POST /data/<name>: validate against the definition, add the record, answer with a fragment. */
  async createRecord(name: string, input: Record<string, string>): Promise<RenderResult> {
    const ds = this.datasources()[name];
    if (!ds) return { status: 404, html: `No datasource named ${name}`, notes: [], ms: 0 };
    const errors: Record<string, string> = {};
    const record: Record<string, unknown> = {};
    for (const [field, spec] of Object.entries(ds.fields)) {
      const optional = /\boptional\b|\?$/.test(spec);
      const type = spec.replace(/\boptional\b|\?/g, "").trim();
      const value = (input[field] ?? "").trim();
      if (!value) {
        if (!optional && type !== "boolean") errors[field] = "is required";
        if (type === "boolean") record[field] = false;
        continue;
      }
      if (type === "number") {
        const num = Number(value);
        if (Number.isNaN(num)) errors[field] = "must be a number";
        else record[field] = num;
      } else if (type === "boolean") record[field] = ["on", "true", "1", "yes"].includes(value.toLowerCase());
      else if (type === "email" && !/^\S+@\S+\.\S+$/.test(value)) errors[field] = "must be an e-mail address";
      else record[field] = value;
    }
    if (Object.keys(errors).length) {
      const r = await this.renderFragment(`${name}-invalid`, { errors, values: input });
      return r.status === 404
        ? { status: 422, html: `<p>${Object.entries(errors).map(([f, m]) => `${f} ${m}`).join(", ")}</p>`, notes: r.notes, ms: 0 }
        : { ...r, status: 422 };
    }
    // In the preview a collected datasource holds test records, kept in the project file.
    const rel = `data/${name}.json`;
    const def = JSON.parse(this.files.read(rel)!);
    const records: Record<string, unknown>[] = Array.isArray(def.records) ? def.records : [];
    record.id = records.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
    record.created_at = new Date().toISOString();
    def.records = [...records, record];
    writeFileSync(path.join(this.files.root, rel), JSON.stringify(def, null, 2) + "\n");
    Object.defineProperty(record, "__ref", { value: `${name}/${record.id}`, enumerable: false });
    const r = await this.renderFragment(`${name}-created`, { record });
    return r.status === 404 ? { status: 204, html: "", notes: r.notes, ms: 0 } : { ...r, status: 201 };
  }

  theme(): string {
    return this.files.read("theme.css") ?? "";
  }
}
