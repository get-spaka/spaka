// The runtime: renders a project's pages, shared parts and fragments with
// Liquid (ADR 0003). It reads the project through a ProjectSource and answers
// standard web requests, so the same code serves the preview, a Node app and
// a Cloudflare Worker.
//
// Rendering is synchronous: a render reads only the source, and the notes it
// collects belong to that render alone.
import { Liquid } from "liquidjs";
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

export type Route = { route: string; file: string };

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
};

export class Runtime {
  private readonly liquid: Liquid;
  private readonly repair: boolean;
  private readonly trace: boolean;
  /** Notes of the render in progress. Renders are synchronous, so there is one at a time. */
  private notes: Note[] = [];

  constructor(
    readonly source: ProjectSource,
    private readonly options: RuntimeOptions = {},
  ) {
    this.repair = options.repair ?? true;
    this.trace = options.trace ?? true;
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
    const routes: Route[] = [];
    for (const file of this.source.list("pages")) {
      const ext = PAGE_EXTENSIONS.find((e) => file.endsWith(e));
      if (!ext) continue;
      let route = file.slice("pages/".length, -ext.length);
      if (route === "index") route = "";
      else if (route.endsWith("/index")) route = route.slice(0, -"/index".length);
      routes.push({ route: `/${route}`, file });
    }
    return routes.sort((a, b) => (a.route === "/" ? -1 : b.route === "/" ? 1 : a.route.localeCompare(b.route)));
  }

  /** The page file serving an address, if any. */
  resolve(pathname: string): string | undefined {
    const clean = `/${pathname.replace(/^\/+|\/+$/g, "")}`;
    return this.routes().find((r) => r.route === clean)?.file;
  }

  routeOf(file: string): string | undefined {
    return this.routes().find((r) => r.file === file)?.route;
  }

  // ---- rendering -------------------------------------------------------------

  /** The page at an address, with the runtime's head. 404 when there is no such page. */
  renderRoute(pathname: string, query: Record<string, string> = {}): RenderResult {
    const file = this.resolve(pathname);
    if (!file) return this.notFound(pathname);
    return this.renderPage(file, pathname, query);
  }

  /** A page file, rendered as if it were at `pathname`. */
  renderPage(file: string, pathname = this.routeOf(file) ?? "/", query: Record<string, string> = {}): RenderResult {
    const result = this.render(file, { page: { url: pathname, path: pathname }, params: query });
    if (result.status === 200) result.html = this.decorate(result.html);
    return result;
  }

  /**
   * A shared part on its own, inside the runtime's head: what the preview
   * shows while the agent writes a part before any page exists.
   */
  renderLoose(file: string): RenderResult {
    const result = this.render(file, { page: { url: "/", path: "/" }, params: {} });
    if (result.status === 200) result.html = this.decorate(result.html);
    return result;
  }

  /** fragments/<name>.liquid, served at /fragments/<name>: a piece of HTML, no head. */
  renderFragment(name: string, scope: Record<string, unknown> = {}): RenderResult {
    const file = `fragments/${name}.liquid`;
    if (this.source.read(file) === undefined)
      return { status: 404, html: "", file, notes: [{ file, note: "no such fragment" }], ms: 0 };
    return this.render(file, scope);
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

  private render(file: string, scope: Record<string, unknown>): RenderResult {
    const started = performance.now();
    this.notes = [];
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

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
