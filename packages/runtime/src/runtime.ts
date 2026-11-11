// The runtime: renders a project's pages, shared parts and fragments with
// Liquid (ADR 0003). It reads the project through a ProjectSource and answers
// standard web requests, so the same code serves the preview, a Node app and
// a Cloudflare Worker.
//
// Rendering is synchronous: a render reads only the source, and the notes it
// collects belong to that render alone.
import { Liquid } from "liquidjs";
import { type Datasource, Datasources, recordOf, titleOf } from "./data.ts";
import { escapeHtml } from "./escape.ts";
import { addCreditsLink, CREDITS_ROUTE, creditedMedia, creditsPage, fillAlts } from "./media.ts";
import type { ProjectSource } from "./source.ts";
import { injectTrace, repairTemplate } from "./template.ts";
import { repairCss } from "./theme.ts";

const PAGE_EXTENSIONS = [".liquid", ".html"] as const;

export type Note = { file: string; note: string };

export type RenderResult = {
  status: number;
  html: string;
  /** The project file the page or fragment comes from. */
  file?: string;
  /** What the runtime had to do to render: a repair, a missing part, an error. */
  notes: Note[];
  ms: number;
};

export type Route = {
  route: string;
  file: string;
  /** A record's page, from a page file named after its datasource in brackets (Q147). */
  record?: { datasource: string; id: string };
  /** The label of the datasource a record's page belongs to, for grouping (Q164). */
  group?: string;
  /** A record's page's name: its first text field (Q164). */
  title?: string;
  /** A page the runtime makes, with no file of the project's: the image credits (Q157). */
  generated?: boolean;
};

export type RuntimeOptions = {
  /** Cut and close files that are still being written (the preview). Default true. */
  repair?: boolean;
  /** Mark each element with the place in the source it comes from (the preview). Default true. */
  trace?: boolean;
  /** HTML put at the top of every page's <head>: styles and scripts the runtime provides. */
  head?: () => string;
  /**
   * Mark the page's own stylesheets in its head with data-up-page (the
   * preview), so that they can be told apart from what the runtime or a
   * library adds to the page while it runs.
   */
  markPageStyles?: boolean;
  /** Stand-in records while a datasource is being written (the preview, Q161). Default false. */
  standIns?: boolean;
};

export class Runtime {
  private readonly liquid: Liquid;
  private readonly repair: boolean;
  private readonly trace: boolean;
  /** Notes of the render in progress. Renders are synchronous, so there is one at a time. */
  private notes: Note[] = [];
  /** The datasources the render in progress read, so that their notes are added once. */
  private read = new Set<string>();
  readonly data: Datasources;

  constructor(
    readonly source: ProjectSource,
    private readonly options: RuntimeOptions = {},
  ) {
    this.repair = options.repair ?? true;
    this.trace = options.trace ?? true;
    this.data = new Datasources(source, { standIns: options.standIns ?? false });
    this.liquid = new Liquid({
      root: ["/pages", "/fragments"],
      partials: ["/parts"],
      extname: ".liquid",
      cache: false,
      relativeReference: false,
      ownPropertyOnly: false,
      fs: {
        resolve: (dir, file, ext) => `${dir.replace(/\/$/, "")}/${/\.[a-z]+$/i.test(file) ? file : file + ext}`,
        // A shared part included before it exists renders as nothing, with a note.
        exists: async () => true,
        existsSync: () => true,
        contains: async () => true,
        containsSync: () => true,
        readFile: async (abs) => this.templateSource(abs),
        readFileSync: (abs) => this.templateSource(abs),
        dirname: (file) => file.slice(0, file.lastIndexOf("/")) || "/",
        sep: "/",
      },
    });
  }

  // ---- routes --------------------------------------------------------------

  routes(): Route[] {
    const pages: Route[] = [];
    const records: Route[] = [];
    for (const file of this.source.list("pages")) {
      const ext = PAGE_EXTENSIONS.find((e) => file.endsWith(e));
      if (!ext) continue;
      let route = file.slice("pages/".length, -ext.length);
      if (route === "index") route = "";
      else if (route.endsWith("/index")) route = route.slice(0, -"/index".length);
      const bracket = bracketOf(route);
      if (!bracket) {
        pages.push({ route: `/${route}`, file });
        continue;
      }
      // pages/blog/[posts].liquid: a page per record, at its id (Q147).
      const ds = this.datasource(bracket.name, false);
      if (!ds || ds.standIns) continue;
      const named = ds.definition?.fields.find((f) => f.kind === "text")?.name ?? "title";
      for (const record of ds.records)
        records.push({
          route: `/${route.slice(0, bracket.at)}${record.id}${route.slice(bracket.end)}`.replace(/\/+$/, "") || "/",
          file,
          record: { datasource: bracket.name, id: record.id },
          group: ds.definition?.label ?? titleOf(bracket.name),
          title: typeof record[named] === "string" && record[named] ? (record[named] as string) : record.id,
        });
    }
    pages.sort((a, b) => (a.route === "/" ? -1 : b.route === "/" ? 1 : a.route.localeCompare(b.route)));
    const all = [...pages, ...records];
    if (!all.some((r) => r.route === CREDITS_ROUTE) && creditedMedia(this.source).length)
      all.push({ route: CREDITS_ROUTE, file: "media", generated: true });
    return all;
  }

  /** The route serving an address, if any. */
  route(pathname: string): Route | undefined {
    const clean = `/${pathname.replace(/^\/+|\/+$/g, "")}`;
    return this.routes().find((r) => r.route === clean);
  }

  /** The page file serving an address, if any. */
  resolve(pathname: string): string | undefined {
    return this.route(pathname)?.file;
  }

  /** The address of a page file, or of a record's page from the record's file. */
  routeOf(file: string): string | undefined {
    const record = recordOf(file);
    const routes = this.routes();
    if (record)
      return routes.find((r) => r.record?.datasource === record.datasource && r.record.id === record.id)?.route;
    return routes.find((r) => r.file === file && !r.record)?.route ?? routes.find((r) => r.file === file)?.route;
  }

  // ---- rendering -------------------------------------------------------------

  /** The page at an address, with the runtime's head. 404 when there is no such page. */
  renderRoute(pathname: string, query: Record<string, string> = {}): RenderResult {
    const route = this.route(pathname);
    if (!route) return this.notFound(pathname);
    if (route.generated) {
      const started = performance.now();
      const html = this.decorate(fillAlts(creditsPage(creditedMedia(this.source)), this.source));
      return { status: 200, html, file: route.file, notes: [], ms: performance.now() - started };
    }
    return this.renderPage(route.file, route.route, query, route.record);
  }

  /** A page file, rendered as if it were at `pathname`; a record's page with its record. */
  renderPage(
    file: string,
    pathname = this.routeOf(file) ?? "/",
    query: Record<string, string> = {},
    record?: { datasource: string; id: string },
  ): RenderResult {
    const scope: Record<string, unknown> = { page: { url: pathname, path: pathname }, params: query };
    const bracket = bracketOf(file.replace(/^pages\//, ""));
    if (bracket) {
      const ds = this.datasource(bracket.name, false);
      const chosen = record ?? this.route(pathname)?.record;
      scope.record = ds?.records.find((r) => r.id === chosen?.id) ?? ds?.records[0];
    }
    const result = this.render(file, scope);
    if (result.status === 200) result.html = this.finish(this.decorate(result.html));
    return result;
  }

  /**
   * A shared part on its own, inside the runtime's head: what the preview
   * shows while the agent writes a part before any page exists.
   */
  renderLoose(file: string): RenderResult {
    const result = this.render(file, { page: { url: "/", path: "/" }, params: {} });
    if (result.status === 200) result.html = this.finish(this.decorate(result.html));
    return result;
  }

  /** fragments/<name>.liquid, served at /fragments/<name>: a piece of HTML, no head. */
  renderFragment(name: string, scope: Record<string, unknown> = {}): RenderResult {
    const file = `fragments/${name}.liquid`;
    if (this.source.read(file) === undefined)
      return { status: 404, html: "", file, notes: [{ file, note: "no such fragment" }], ms: 0 };
    const result = this.render(file, scope);
    if (result.status === 200) result.html = fillAlts(result.html, this.source);
    return result;
  }

  /** theme.css, repaired if it is still being written. */
  theme(): string {
    const css = this.source.read("theme.css") ?? "";
    return this.repair ? repairCss(css) : css;
  }

  /** Answers a standard web request: pages, fragments and the theme. */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    const query = Object.fromEntries(url.searchParams);
    if (url.pathname === "/theme.css")
      return new Response(this.theme(), { headers: { "content-type": "text/css; charset=utf-8" } });
    const fragment = /^\/fragments\/([\w-]+)\/?$/.exec(url.pathname);
    const result = fragment
      ? this.renderFragment(fragment[1]!, { params: query })
      : this.renderRoute(url.pathname, query);
    return new Response(request.method === "HEAD" ? null : result.html, {
      status: result.status,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  /** Puts the runtime's head into a rendered page. */
  decorate(html: string): string {
    const marked = this.options.markPageStyles ? markPageStyles(html) : html;
    const head = this.options.head?.() ?? "";
    return head ? injectHead(marked, head) : marked;
  }

  /** A datasource's records as templates see them, its notes added to the render's once. */
  private datasource(name: string, noted: boolean): Datasource | undefined {
    if (!/^[a-z0-9][\w-]*$/i.test(name)) return undefined;
    const ds = this.data.names().includes(name) ? this.data.get(name) : this.data.missing(name);
    if (noted && !this.read.has(name)) {
      this.read.add(name);
      this.notes.push(...ds.notes);
    }
    return ds;
  }

  /** `data.posts`: each datasource read only when a template asks for it. */
  private dataScope(): Record<string, unknown> {
    return new Proxy(
      {},
      {
        get: (_target, key) =>
          typeof key === "string" && !LIQUID_PROBES.has(key) ? this.datasource(key, true)?.records : undefined,
        has: (_target, key) => typeof key === "string" && !LIQUID_PROBES.has(key) && /^[a-z0-9][\w-]*$/i.test(key),
      },
    );
  }

  /** What every page gets once rendered: alt texts kept beside images, and the credits' link (Q155, Q157). */
  private finish(html: string): string {
    const filled = fillAlts(html, this.source);
    return creditedMedia(this.source).length ? addCreditsLink(filled) : filled;
  }

  private render(file: string, scope: Record<string, unknown>): RenderResult {
    const started = performance.now();
    this.notes = [];
    this.read = new Set();
    scope.data = this.dataScope();
    const raw = this.source.read(file);
    if (raw === undefined) {
      return { status: 404, html: "", file, notes: [{ file, note: "no such file" }], ms: 0 };
    }
    try {
      // Shared parts see only what is passed to them, plus these globals ("page").
      const html = this.liquid.parseAndRenderSync(this.prepare(raw, file), scope, { globals: scope });
      return { status: 200, html, file, notes: this.notes, ms: performance.now() - started };
    } catch (error) {
      this.notes.push({ file, note: `render error: ${error instanceof Error ? error.message : String(error)}` });
      return { status: 500, html: renderError(error), file, notes: this.notes, ms: performance.now() - started };
    }
  }

  private notFound(pathname: string): RenderResult {
    if (this.source.read("pages/404.liquid") !== undefined) {
      const result = this.renderPage("pages/404.liquid", pathname);
      return { ...result, status: result.status === 200 ? 404 : result.status };
    }
    return {
      status: 404,
      html: this.decorate(
        `<!doctype html><html><head><title>Not found</title></head><body><main style="padding:3rem;text-align:center"><h1>Not found</h1><p>There is no page at ${escapeHtml(pathname)}.</p></main></body></html>`,
      ),
      notes: [{ file: "pages", note: `no page at ${pathname}` }],
      ms: 0,
    };
  }

  /** Template source handed to Liquid, from its virtual absolute path ("/parts/header.liquid"). */
  private templateSource(abs: string): string {
    const file = abs.replace(/^\/+/, "");
    const raw = this.source.read(file);
    if (raw === undefined) {
      this.notes.push({ file, note: "missing: rendered as nothing" });
      return "";
    }
    return this.prepare(raw, file);
  }

  private prepare(raw: string, file: string): string {
    let src = raw;
    if (this.repair) {
      const repaired = repairTemplate(raw);
      if (repaired.cutAt < raw.length || repaired.closers.length)
        this.notes.push({
          file,
          note: `repaired: ${repaired.cutReason ?? "unclosed blocks"}; closed ${repaired.closers.join(" ") || "nothing"}`,
        });
      src = repaired.src;
    }
    return this.trace ? injectTrace(src, file) : src;
  }
}

/** Inserts `head` right after <head>, creating the head or the whole document if missing. */
export function injectHead(html: string, head: string): string {
  const open = /<head(\s[^>]*)?>/i.exec(html);
  if (open) return html.slice(0, open.index + open[0].length) + head + html.slice(open.index + open[0].length);
  const root = /<html(\s[^>]*)?>/i.exec(html);
  if (root)
    return `${html.slice(0, root.index + root[0].length)}<head>${head}</head>${html.slice(root.index + root[0].length)}`;
  return `<!doctype html><html><head>${head}</head><body>${html}</body></html>`;
}

/** Adds data-up-page to the <style> and <link rel="stylesheet"> elements of the page's head. */
export function markPageStyles(html: string): string {
  const end = html.search(/<\/head\s*>/i);
  if (end < 0) return html;
  const head = html
    .slice(0, end)
    .replace(/<(style|link)\b(?![^>]*\sdata-up-(?:page|runtime)\b)([^>]*)>/gi, (tag, name: string, rest: string) =>
      name.toLowerCase() === "link" && !/\brel\s*=\s*["']?stylesheet/i.test(rest)
        ? tag
        : `<${name} data-up-page${rest}>`,
    );
  return head + html.slice(end);
}

function renderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `<!doctype html><html><head><title>Render error</title></head><body><pre style="padding:2rem;white-space:pre-wrap">${escapeHtml(message)}</pre></body></html>`;
}

export { escapeHtml };

/** Names Liquid itself asks an object for, which are not datasources. */
const LIQUID_PROBES = new Set([
  "toLiquid",
  "liquidMethodMissing",
  "size",
  "first",
  "last",
  "then",
  "constructor",
  "toJSON",
  "valueOf",
  "toString",
]);

/** The datasource named in brackets in a page's path ("blog/[posts]"), and where. */
function bracketOf(path: string): { name: string; at: number; end: number } | undefined {
  const m = /\[([a-z0-9][\w-]*)\]/i.exec(path);
  return m ? { name: m[1]!, at: m.index, end: m.index + m[0].length } : undefined;
}
