// The runtime: renders a project's pages, shared parts and fragments with
// Liquid (ADR 0003). It reads the project through a ProjectSource and answers
// standard web requests, so the same code serves the preview, a Node app and
// a Cloudflare Worker.
//
// Rendering is asynchronous, for {% load %} to wait for a server module (ADR
// 0014): two renders may interleave, so the notes a render collects and the
// datasources it reads belong to that render, each with a Liquid of its own.
import { type Context, Hash, Liquid, Tag, type TagToken, type TopLevelToken } from "liquidjs";
import {
  addTrapFields,
  type CollectedStore,
  DATA_ROUTE,
  type FormValues,
  fingerprint,
  formValues,
  MANAGEMENT_ROUTE,
  message,
  problemsAlert,
  readSubmission,
  SHOWN_RECORDS,
  sameToken,
  sentAlert,
  submissionId,
  TRAP_FIELD,
  VISITOR_LIMIT,
  VISITOR_WINDOW_MS,
} from "./collected.ts";
import {
  type Datasource,
  Datasources,
  type Definition,
  readCollected,
  recordOf,
  type StoredRecord,
  titleOf,
} from "./data.ts";
import { registerDateFilters } from "./dates.ts";
import { escapeHtml } from "./escape.ts";
import {
  addCreditsLink,
  CREDITS_ROUTE,
  creditedMedia,
  creditsPage,
  fillAlts,
  pageLanguage,
  withSrcset,
} from "./media.ts";
import { recordTitle } from "./records.ts";
import { type SiteAssets, siteAssets } from "./scripts.ts";
import { type DataApi, MODULE_NAME, type ModuleKind, SERVER_ROUTE, type ServerHost, VisitorLimiter } from "./server.ts";
import type { ProjectSource } from "./source.ts";
import { injectTrace, repairTemplate } from "./template.ts";
import { repairCss, themeStyle } from "./theme.ts";

const PAGE_EXTENSIONS = [".liquid", ".html"] as const;
/** What an action is answered with when its module names no fragment and returns no words. */
const DEFAULT_SENT = "Thank you, it was sent.";
const TOO_MANY = "Too many messages were sent from here. Please try again in a few minutes.";

export type Note = { file: string; note: string };

export type RenderResult = {
  status: number;
  html: string;
  /** The project file the page or fragment comes from. */
  file?: string;
  /** What the runtime had to do to render: a repair, a missing part, an error. */
  notes: Note[];
  ms: number;
  /** The datasources the render read: an export tells from it which pages show what visitors sent. */
  datasources?: string[];
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
   * Mark the page's own stylesheets in its head with data-spaka-page (the
   * preview), so that they can be told apart from what the runtime or a
   * library adds to the page while it runs.
   */
  markPageStyles?: boolean;
  /** Stand-in records while a datasource is being written (the preview, Q161). Default false. */
  standIns?: boolean;
  /** The preview's test records, `<name>/<id>.md` under .spaka/test-records/ (Q172). */
  testRecords?: ProjectSource;
  /** Where what visitors send is kept: the test records' writer in the preview, SQLite once published. */
  collected?: CollectedStore;
  /** The published site's management token; without one there is no management API. */
  managementToken?: string;
  /** The widths of the WebP copies an export made of each image (Q156), given to every <img> of it as a srcset. */
  images?: Record<string, number[]>;
  /** The site's server modules (ADR 0014): a process of its own in the preview, the server or Worker once published. */
  server?: ServerHost;
  /** What a server module's error or a page's {% load %} failing is told to, beside the page's notes (the preview). */
  onServerError?: (error: { module: string; kind: ModuleKind; message: string }) => void;
  /** The current time, for tests. */
  now?: () => Date;
};

/** What one render collects: its notes, and the datasources it read, so that their notes are added once. */
type RenderState = { file: string; notes: Note[]; read: Set<string> };

/** Who sent a request, as the host knows it: the visitor's address, for the per-visitor limit. */
export type RequestInfo = { visitor?: string };

export class Runtime {
  private readonly repair: boolean;
  private readonly trace: boolean;
  readonly data: Datasources;
  private readonly images: Map<string, number[]>;
  /** The per-visitor limit of server modules' actions (Q532). */
  private readonly actions = new VisitorLimiter(VISITOR_LIMIT, VISITOR_WINDOW_MS);

  constructor(
    readonly source: ProjectSource,
    private readonly options: RuntimeOptions = {},
  ) {
    this.repair = options.repair ?? true;
    this.trace = options.trace ?? true;
    this.images = new Map(Object.entries(options.images ?? {}));
    this.data = new Datasources(source, {
      standIns: options.standIns ?? false,
      ...(options.testRecords ? { testRecords: options.testRecords } : {}),
    });
  }

  /** A Liquid for one render, its reads and notes that render's. */
  private liquidFor(state: RenderState): Liquid {
    const liquid = new Liquid({
      root: ["/pages", "/fragments"],
      partials: ["/parts"],
      extname: ".liquid",
      cache: false,
      relativeReference: false,
      ownPropertyOnly: false,
      // An empty field is false, as one expects: {% if post.cover %} shows nothing for a post without one.
      jsTruthy: true,
      fs: {
        resolve: (dir, file, ext) => `${dir.replace(/\/$/, "")}/${/\.[a-z]+$/i.test(file) ? file : file + ext}`,
        // A shared part included before it exists renders as nothing, with a note.
        exists: async () => true,
        existsSync: () => true,
        contains: async () => true,
        containsSync: () => true,
        readFile: async (abs) => this.templateSource(abs, state),
        readFileSync: (abs) => this.templateSource(abs, state),
        dirname: (file) => file.slice(0, file.lastIndexOf("/")) || "/",
        sep: "/",
      },
    });
    registerDateFilters(liquid);
    this.registerLoad(liquid, state);
    return liquid;
  }

  /**
   * {% load weather city: params.city %}: the server module's load, with the
   * tag's arguments, its result set as `weather` (Q505). A load that fails, or
   * a site with no server here, leaves it empty, with a note.
   */
  private registerLoad(liquid: Liquid, state: RenderState) {
    const runtime = this;
    liquid.registerTag(
      "load",
      class LoadTag extends Tag {
        private readonly module: string;
        private readonly hash: Hash;
        constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
          super(token, remain, liquid);
          const m = /^\s*([a-z0-9][\w-]*)\s*,?\s*([\s\S]*)$/i.exec(token.args);
          this.module = m?.[1] ?? "";
          this.hash = new Hash(m?.[2] ?? "");
        }
        *render(ctx: Context): Generator<unknown, void, unknown> {
          const args = (yield this.hash.render(ctx)) as Record<string, unknown>;
          ctx.bottom()[this.module] = yield runtime.load(this.module, args, state);
        }
      },
    );
  }

  private async load(name: string, args: Record<string, unknown>, state: RenderState): Promise<unknown> {
    const fail = (message: string) => {
      state.notes.push({ file: state.file, note: `load ${name || "(no name)"}: ${message}` });
      return undefined;
    };
    if (!MODULE_NAME.test(name)) return fail("the tag names no server module: {% load name arg: value %}");
    const server = this.options.server;
    if (!server) return fail("server modules do not run here");
    try {
      return await server.load(name, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.onServerError?.({ module: name, kind: "load", message });
      return fail(message);
    }
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
      // Addresses starting with an underscore are the runtime's own (Q188).
      if (route.split("/").some((part) => part.startsWith("_"))) continue;
      const bracket = bracketOf(route);
      if (!bracket) {
        pages.push({ route: `/${route}`, file });
        continue;
      }
      // pages/blog/[posts].liquid: a page per record, at its id (Q147).
      const ds = this.datasource(bracket.name, false);
      if (!ds || ds.standIns) continue;
      for (const record of ds.records)
        records.push({
          route: `/${route.slice(0, bracket.at)}${record.id}${route.slice(bracket.end)}`.replace(/\/+$/, "") || "/",
          file,
          record: { datasource: bracket.name, id: record.id },
          group: ds.definition?.label ?? titleOf(bracket.name),
          title: recordTitle(record, ds.definition),
        });
    }
    pages.sort((a, b) => (a.route === "/" ? -1 : b.route === "/" ? 1 : a.route.localeCompare(b.route)));
    const all = [...pages, ...records];
    if (!all.some((r) => r.route === CREDITS_ROUTE) && creditedMedia(this.source).length)
      all.push({ route: CREDITS_ROUTE, file: "media", generated: true });
    return all;
  }

  /** What the agent is told about page files that get no address (Q188). */
  pageNotes(): Note[] {
    return this.source
      .list("pages")
      .filter((file) => PAGE_EXTENSIONS.some((e) => file.endsWith(e)))
      .filter((file) =>
        file
          .slice("pages/".length)
          .split("/")
          .some((part) => part.startsWith("_")),
      )
      .map((file) => ({
        file,
        note: "gets no address: addresses starting with an underscore are Spaka's own (/_data/, /_spaka/); rename it",
      }));
  }

  /** The collected datasources' names (Q171). */
  collectedNames(): string[] {
    return this.data.names().filter((name) => this.data.definition(name).definition?.collected);
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
  async renderRoute(pathname: string, query: Record<string, string> = {}): Promise<RenderResult> {
    const route = this.route(pathname);
    if (!route) return this.notFound(pathname);
    if (route.generated) {
      const started = performance.now();
      // In the home page's language (Q325).
      const language = (this.route("/") && pageLanguage((await this.renderRoute("/")).html)) || "en";
      const html = this.decorate(
        withSrcset(fillAlts(creditsPage(creditedMedia(this.source), language), this.source), this.images),
      );
      return { status: 200, html, file: route.file, notes: [], ms: performance.now() - started };
    }
    return this.renderPage(route.file, route.route, query, route.record);
  }

  /** A page file, rendered as if it were at `pathname`; a record's page with its record. */
  async renderPage(
    file: string,
    pathname = this.routeOf(file) ?? "/",
    query: Record<string, string> = {},
    record?: { datasource: string; id: string },
  ): Promise<RenderResult> {
    const scope: Record<string, unknown> = { page: { url: pathname, path: pathname }, params: query };
    const bracket = bracketOf(file.replace(/^pages\//, ""));
    const ds = bracket ? this.datasource(bracket.name, false) : undefined;
    if (bracket) {
      const chosen = record ?? this.route(pathname)?.record;
      scope.record = ds?.records.find((r) => r.id === chosen?.id) ?? ds?.records[0];
    }
    const result = await this.render(file, scope);
    if (bracket && !result.datasources?.includes(bracket.name))
      result.datasources = [...(result.datasources ?? []), bracket.name];
    // Its datasource's notes are the page's: a record left out is said where its page is looked at.
    for (const note of ds?.notes ?? [])
      if (!result.notes.some((n) => n.file === note.file && n.note === note.note)) result.notes.push(note);
    if (result.status === 200) result.html = this.finish(this.decorate(result.html));
    return result;
  }

  /**
   * A shared part on its own, inside the runtime's head: what the preview
   * shows while the agent writes a part before any page exists.
   */
  async renderLoose(file: string): Promise<RenderResult> {
    const result = await this.render(file, { page: { url: "/", path: "/" }, params: {} });
    if (result.status === 200) result.html = this.finish(this.decorate(result.html));
    return result;
  }

  /** fragments/<name>.liquid, served at /fragments/<name>: a piece of HTML, no head. */
  async renderFragment(name: string, scope: Record<string, unknown> = {}): Promise<RenderResult> {
    const file = `fragments/${name}.liquid`;
    if (this.source.read(file) === undefined)
      return { status: 404, html: "", file, notes: [{ file, note: "no such fragment" }], ms: 0 };
    const result = await this.render(file, scope);
    if (result.status === 200) result.html = withSrcset(addTrapFields(fillAlts(result.html, this.source)), this.images);
    return result;
  }

  /** The site's scripts and stylesheets (ADR 0011). */
  assets(): SiteAssets {
    return siteAssets(this.source).assets;
  }

  /** The site's stylesheets, styles/*.css, one after the other; a file still being written is repaired. */
  styles(): string {
    return this.assets()
      .styles.map((p) => this.source.read(p) ?? "")
      .map((css) => (this.repair ? repairCss(css) : css))
      .join("\n");
  }

  /** theme.css, repaired if it is still being written. */
  theme(): string {
    const css = this.source.read("theme.css") ?? "";
    return this.repair ? repairCss(css) : css;
  }

  /** Answers a standard web request: pages, fragments, the theme, form submissions and the management API. */
  async fetch(request: Request, info: RequestInfo = {}): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith(MANAGEMENT_ROUTE)) return this.manage(request, url);
    if (url.pathname.startsWith(DATA_ROUTE)) {
      if (request.method !== "POST")
        return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
      return this.submit(request, url.pathname.slice(DATA_ROUTE.length).replace(/\/+$/, ""), info);
    }
    if (url.pathname.startsWith(SERVER_ROUTE)) {
      const unavailable = await this.loadCollected();
      if (unavailable) return unavailable;
      return this.serve(request, url.pathname.slice(SERVER_ROUTE.length).split("/")[0] ?? "", info);
    }
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    const query = Object.fromEntries(url.searchParams);
    if (url.pathname === "/theme.css")
      return new Response(themeStyle(this.theme()), { headers: { "content-type": "text/css; charset=utf-8" } });
    const unavailable = await this.loadCollected();
    if (unavailable) return unavailable;
    const fragment = /^\/fragments\/([\w-]+)\/?$/.exec(url.pathname);
    const result = fragment
      ? await this.renderFragment(fragment[1]!, { params: query })
      : await this.renderRoute(url.pathname, query);
    return new Response(request.method === "HEAD" ? null : result.html, {
      status: result.status,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  /**
   * Reads the records a published site keeps for each collected datasource,
   * before rendering, which is synchronous. The preview reads its test
   * records from files instead.
   */
  private async loadCollected(): Promise<Response | undefined> {
    const store = this.options.collected;
    if (!store || this.options.testRecords) return undefined;
    try {
      for (const name of this.collectedNames()) this.data.stored.set(name, await store.list(name, SHOWN_RECORDS));
      return undefined;
    } catch (error) {
      return new Response(escapeHtml(error instanceof Error ? error.message : String(error)), {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  }

  /** A form's submission (Q173): kept and answered with the definition's fragment, or 422 with what is wrong. */
  private async submit(request: Request, name: string, info: RequestInfo): Promise<Response> {
    const html = (body: string, status = 200) =>
      new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
    const definition = /^[a-z0-9][\w-]*$/i.test(name) ? this.data.definition(name).definition : undefined;
    if (!definition?.collected) return html(problemsAlert([`There is no form named ${name}.`]), 404);
    const values = await formValues(request);
    const read = readSubmission(definition, values);
    const trapped = (values.get(TRAP_FIELD) ?? []).some((v) => v.trim());
    const now = this.options.now?.() ?? new Date();
    const record: StoredRecord = {
      id: submissionId(now),
      submitted: now.toISOString(),
      status: definition.review ? "pending" : "published",
      fields: "fields" in read ? read.fields : {},
    };
    // What a robot filled in is answered as if it were kept, and dropped (Q180).
    if (trapped)
      return html(
        "fields" in read ? await this.answer(name, definition, record) : sentAlert(message(definition, "sent")),
      );
    if ("problems" in read) return html(problemsAlert(read.problems), 422);
    const store = this.options.collected;
    if (!store) return html(problemsAlert(["This site cannot keep what visitors send."]), 503);
    try {
      let visitor: string | undefined;
      if (info.visitor) {
        visitor = await fingerprint(info.visitor, this.options.managementToken ?? "");
        const since = new Date(now.getTime() - VISITOR_WINDOW_MS).toISOString();
        if ((await store.sentSince(name, visitor, since)) >= VISITOR_LIMIT)
          return html(problemsAlert([message(definition, "too_many")]), 429);
      }
      await store.add(name, record, visitor);
    } catch (error) {
      return html(problemsAlert([error instanceof Error ? error.message : String(error)]), 503);
    }
    return html(await this.answer(name, definition, record));
  }

  /** The definition's answer fragment with the new record, or the built-in thanks. */
  private async answer(name: string, definition: Definition, record: StoredRecord): Promise<string> {
    if (definition.answer) {
      const shown = readCollected(name, record, definition).record;
      const result = await this.renderFragment(definition.answer, { record: shown, params: {} });
      if (result.status === 200) return result.html;
    }
    return sentAlert(message(definition, "sent"));
  }

  /**
   * /_server/<name> (ADR 0014): a form htmx posts to the module's action, with
   * the trap field and the limit per visitor of /_data/ (Q532), answered with
   * its answer fragment; any other request to its route.
   */
  private async serve(request: Request, name: string, info: RequestInfo): Promise<Response> {
    const html = (body: string, status = 200) =>
      new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
    const server = this.options.server;
    const kinds = server && MODULE_NAME.test(name) ? await server.kinds(name).catch(() => undefined) : undefined;
    if (!server || !kinds) return new Response("Not found", { status: 404 });
    const isAction =
      request.method === "POST" &&
      kinds.includes("action") &&
      (request.headers.has("hx-request") || !kinds.includes("route"));
    const failed = (kind: ModuleKind, error: unknown) => {
      this.options.onServerError?.({
        module: name,
        kind,
        message: error instanceof Error ? error.message : String(error),
      });
    };
    if (!isAction) {
      if (!kinds.includes("route"))
        return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
      try {
        return await server.route(name, request);
      } catch (error) {
        failed("route", error);
        return new Response("Server error", { status: 500 });
      }
    }
    // Read from a copy: the action gets the request with its body.
    const values = await formValues(request.clone());
    const sent = (values.get(TRAP_FIELD) ?? []).some((v) => v.trim());
    // What a robot filled in is answered as if it were done, and dropped (Q180).
    if (sent) return html(sentAlert(DEFAULT_SENT));
    const now = this.options.now?.() ?? new Date();
    if (info.visitor) {
      const visitor = await fingerprint(info.visitor, this.options.managementToken ?? "");
      if (!this.actions.take(`${name}\u0000${visitor}`, now.getTime())) return html(problemsAlert([TOO_MANY]), 429);
    }
    const fields: Record<string, string | string[]> = {};
    for (const [field, value] of values) fields[field] = value.length === 1 ? value[0]! : value;
    try {
      const answer = await server.action(name, fields, request);
      if ("problems" in answer) return html(problemsAlert(answer.problems), 422);
      if (answer.answer) {
        const result = await this.renderFragment(answer.answer, { answer: answer.value, params: {} });
        if (result.status === 200) return html(result.html);
      }
      return html(sentAlert(typeof answer.value === "string" && answer.value.trim() ? answer.value : DEFAULT_SENT));
    } catch (error) {
      failed("action", error);
      return html(problemsAlert(["Something went wrong. Please try again later."]), 500);
    }
  }

  /**
   * The records as a server module reaches them (Q513): a datasource's records
   * as templates see them, and a record added to a collected datasource,
   * read against its definition as a form is.
   */
  dataApi(): DataApi {
    return {
      list: async (name) => {
        const unavailable = await this.loadCollected();
        if (unavailable) throw new Error(await unavailable.text());
        return (this.datasource(name, false)?.records ?? []) as Record<string, unknown>[];
      },
      add: async (name, given) => {
        const definition = /^[a-z0-9][\w-]*$/i.test(name) ? this.data.definition(name).definition : undefined;
        if (!definition?.collected) return { problems: [`There is no collected datasource named ${name}.`] };
        const values: FormValues = new Map();
        for (const [field, value] of Object.entries(given))
          if (value !== undefined && value !== null)
            values.set(
              field,
              (Array.isArray(value) ? value : [value]).map((v) => String(v)),
            );
        const read = readSubmission(definition, values);
        if ("problems" in read) return read;
        const store = this.options.collected;
        if (!store) return { problems: ["This site cannot keep records here."] };
        const now = this.options.now?.() ?? new Date();
        const record: StoredRecord = {
          id: submissionId(now),
          submitted: now.toISOString(),
          status: definition.review ? "pending" : "published",
          fields: read.fields,
        };
        await store.add(name, record);
        return { id: record.id };
      },
    };
  }

  /** The management API (Q177, Q183): the app reads, approves and deletes what a published site collected. */
  private async manage(request: Request, url: URL): Promise<Response> {
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const token = this.options.managementToken;
    const store = this.options.collected;
    if (!token || !store) return json({ error: "not found" }, 404);
    const sent = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!sameToken(sent, token)) return json({ error: "wrong token" }, 401);
    const [what, name, id, action] = url.pathname.slice(MANAGEMENT_ROUTE.length).split("/").filter(Boolean);
    const collected = this.collectedNames();
    try {
      if (what === "ping" && request.method === "GET") return json({ ok: true, datasources: collected });
      if (what !== "records" || !name || !collected.includes(name)) return json({ error: "not found" }, 404);
      if (!id && request.method === "GET") return json({ records: await store.list(name, 10_000) });
      if (id && action === "approve" && request.method === "POST")
        return (await store.approve(name, id)) ? json({ ok: true }) : json({ error: "not found" }, 404);
      if (id && !action && request.method === "DELETE")
        return (await store.delete(name, id)) ? json({ ok: true }) : json({ error: "not found" }, 404);
      return json({ error: "not found" }, 404);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 503);
    }
  }

  /** Puts the runtime's head into a rendered page. */
  decorate(html: string): string {
    const marked = this.options.markPageStyles ? markPageStyles(html) : html;
    const head = this.options.head?.() ?? "";
    return head ? injectHead(marked, head) : marked;
  }

  /** A datasource's records as templates see them, its notes added to the render's once. */
  private datasource(name: string, state: RenderState | false): Datasource | undefined {
    if (!/^[a-z0-9][\w-]*$/i.test(name)) return undefined;
    const ds = this.data.names().includes(name) ? this.data.get(name) : this.data.missing(name);
    if (state && !state.read.has(name)) {
      state.read.add(name);
      state.notes.push(...ds.notes);
    }
    return ds;
  }

  /** `data.posts`: each datasource read only when a template asks for it. */
  private dataScope(state: RenderState): Record<string, unknown> {
    return new Proxy(
      {},
      {
        get: (_target, key) =>
          typeof key === "string" && !LIQUID_PROBES.has(key) ? this.datasource(key, state)?.records : undefined,
        has: (_target, key) => typeof key === "string" && !LIQUID_PROBES.has(key) && /^[a-z0-9][\w-]*$/i.test(key),
      },
    );
  }

  /** What every page gets once rendered: alt texts kept beside images, and the credits' link (Q155, Q157, Q325). */
  private finish(html: string): string {
    const filled = withSrcset(addTrapFields(fillAlts(html, this.source)), this.images);
    return creditedMedia(this.source).length ? addCreditsLink(filled) : filled;
  }

  private async render(file: string, scope: Record<string, unknown>): Promise<RenderResult> {
    const started = performance.now();
    const state: RenderState = { file, notes: [], read: new Set() };
    scope.data = this.dataScope(state);
    const raw = this.source.read(file);
    if (raw === undefined) {
      return { status: 404, html: "", file, notes: [{ file, note: "no such file" }], ms: 0 };
    }
    try {
      // Shared parts see only what is passed to them, plus these globals ("page").
      const html = await this.liquidFor(state).parseAndRender(this.prepare(raw, file, state), scope, {
        globals: scope,
      });
      return {
        status: 200,
        html,
        file,
        notes: state.notes,
        ms: performance.now() - started,
        datasources: [...state.read],
      };
    } catch (error) {
      state.notes.push({ file, note: `render error: ${error instanceof Error ? error.message : String(error)}` });
      return { status: 500, html: renderError(error), file, notes: state.notes, ms: performance.now() - started };
    }
  }

  private async notFound(pathname: string): Promise<RenderResult> {
    if (this.source.read("pages/404.liquid") !== undefined) {
      const result = await this.renderPage("pages/404.liquid", pathname);
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
  private templateSource(abs: string, state: RenderState): string {
    const file = abs.replace(/^\/+/, "");
    const raw = this.source.read(file);
    if (raw === undefined) {
      state.notes.push({ file, note: "missing: rendered as nothing" });
      return "";
    }
    return this.prepare(raw, file, state);
  }

  private prepare(raw: string, file: string, state: RenderState): string {
    let src = raw;
    if (this.repair) {
      const repaired = repairTemplate(raw);
      if (repaired.cutAt < raw.length || repaired.closers.length)
        state.notes.push({
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

/** Adds data-spaka-page to the <style> and <link rel="stylesheet"> elements of the page's head. */
export function markPageStyles(html: string): string {
  const end = html.search(/<\/head\s*>/i);
  if (end < 0) return html;
  const head = html
    .slice(0, end)
    .replace(/<(style|link)\b(?![^>]*\sdata-spaka-(?:page|runtime)\b)([^>]*)>/gi, (tag, name: string, rest: string) =>
      name.toLowerCase() === "link" && !/\brel\s*=\s*["']?stylesheet/i.test(rest)
        ? tag
        : `<${name} data-spaka-page${rest}>`,
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
  // Asked of a value to tell whether it is an iterator.
  "next",
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
