// A site's server modules (ADR 0014, Q497, Q505, Q519): files of its own code
// in server/, each of which may export
//   load(args, context)    the data a page asks for with {% load name … %};
//   action(fields, context) what answers a form posted to /_server/<name>;
//   route(request, context) what answers another service's call there;
//   cache = "10m"          how long its load's results are kept, by arguments;
//   answer = "fragment"    the fragment an action's result is shown with.
// The runtime reaches them through a ServerHost: in the preview a process of
// its own (Spaka's Node under its permissions), once published the server or
// the Worker itself, both through moduleHost below.

/** The route prefix of server modules' actions and routes (Q188). */
export const SERVER_ROUTE = "/_server/";

/** A server module's name: its file's, server/<name>.ts or .js. */
export const MODULE_NAME = /^[a-z0-9][\w-]*$/i;

/** What one kind of export a module has. */
export type ModuleKind = "load" | "action" | "route";

/** The records of the site, read and added as a form adds them (Q513). */
export type DataApi = {
  /** A datasource's records, as templates see them. */
  list(datasource: string): Promise<Record<string, unknown>[]>;
  /** A record added to a collected datasource, read against its definition as a form is. */
  add(datasource: string, fields: Record<string, unknown>): Promise<{ id: string } | { problems: string[] }>;
};

/** SQL on the site's own database (Q514, Q518): SQLite, D1 on Cloudflare. */
export type SqlApi = {
  all(query: string, ...params: unknown[]): Promise<Record<string, unknown>[]>;
  get(query: string, ...params: unknown[]): Promise<Record<string, unknown> | undefined>;
  run(query: string, ...params: unknown[]): Promise<{ changes: number }>;
};

/** What a server module's functions are given. */
export type ServerContext = {
  /** The site's secrets (Q501), and nothing else of the machine's environment. */
  env: Record<string, string | undefined>;
  data: DataApi;
  sql: SqlApi;
  /** The one folder the module may write in, outside the project (Q524); none on Cloudflare. */
  files?: string;
  /** The request an action or a route answers. */
  request?: Request;
};

/** A server module, as imported. */
export type ServerModule = {
  load?: (args: Record<string, unknown>, context: ServerContext) => unknown;
  action?: (fields: Record<string, string | string[]>, context: ServerContext) => unknown;
  route?: (request: Request, context: ServerContext) => Response | Promise<Response>;
  cache?: string;
  answer?: string;
};

/** What an action answered: its result and the fragment to show it with, or the problems found. */
export type ActionAnswer = { value: unknown; answer?: string } | { problems: string[] };

/** How the runtime reaches a site's server modules. */
export interface ServerHost {
  /** The kinds of export a module has; undefined when there is no such module. */
  kinds(name: string): Promise<ModuleKind[] | undefined>;
  /** A module's load, with the tag's arguments: its result, or an error thrown. */
  load(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** A module's action, with what the form sent. */
  action(name: string, fields: Record<string, string | string[]>, request: Request): Promise<ActionAnswer>;
  /** A module's route. */
  route(name: string, request: Request): Promise<Response>;
}

/** A duration as a module writes it ("30s", "10m", "2h", "1d"), in milliseconds; undefined if unreadable. */
export function durationMs(text: unknown): number | undefined {
  if (typeof text !== "string") return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(s|m|h|d)\s*$/i.exec(text);
  if (!m) return undefined;
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]!.toLowerCase() as "s" | "m" | "h" | "d"];
  return Number(m[1]) * unit;
}

/** A value as it crosses to a page: plain data, the same in the preview's process and once published. */
export function plain(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? Number(v) : v)) ?? "null");
}

const CACHE_LIMIT = 500;

export type ModuleHostOptions = {
  /** The site's modules by name, imported when first asked for. */
  modules: Record<string, () => Promise<ServerModule>>;
  /** What each function is given; `request` is added for actions and routes. */
  context: () => ServerContext;
  now?: () => number;
};

/**
 * Calls a site's modules, keeping a load's results for as long as its module
 * says (Q519), by arguments. The same in the preview's process, the Node
 * server and the Worker.
 */
export function moduleHost({ modules, context, now = Date.now }: ModuleHostOptions): ServerHost {
  const imported = new Map<string, Promise<ServerModule>>();
  const cache = new Map<string, { value: unknown; until: number }>();
  const module = (name: string): Promise<ServerModule> | undefined => {
    if (!MODULE_NAME.test(name) || !Object.hasOwn(modules, name)) return undefined;
    let found = imported.get(name);
    if (!found) {
      found = modules[name]!();
      // A module that failed to load is imported again next time, once fixed.
      found.catch(() => imported.delete(name));
      imported.set(name, found);
    }
    return found;
  };
  const needed = async (name: string, kind: ModuleKind) => {
    const found = module(name);
    if (!found) throw new Error(`there is no server module named ${name} (server/${name}.ts or .js)`);
    const exports = await found;
    if (typeof exports[kind] !== "function") throw new Error(`server/${name} exports no ${kind} function`);
    return exports;
  };
  return {
    async kinds(name) {
      const found = module(name);
      if (!found) return undefined;
      const exports = await found;
      return (["load", "action", "route"] as const).filter((k) => typeof exports[k] === "function");
    },
    async load(name, args) {
      const exports = await needed(name, "load");
      const keep = durationMs(exports.cache);
      const key = `${name}\u0000${JSON.stringify(args)}`;
      const kept = keep ? cache.get(key) : undefined;
      if (kept && kept.until > now()) return kept.value;
      const value = plain(await exports.load!(args, context()));
      if (keep) {
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
        cache.set(key, { value, until: now() + keep });
      }
      return value;
    },
    async action(name, fields, request) {
      const exports = await needed(name, "action");
      const value = await exports.action!(fields, { ...context(), request });
      if (value && typeof value === "object" && Array.isArray((value as { problems?: unknown }).problems))
        return { problems: (value as { problems: unknown[] }).problems.map(String) };
      return { value: plain(value), ...(typeof exports.answer === "string" ? { answer: exports.answer } : {}) };
    },
    async route(name, request) {
      const exports = await needed(name, "route");
      const response = await exports.route!(request, { ...context(), request });
      if (!(response instanceof Response)) throw new Error(`server/${name}'s route returned no Response`);
      return response;
    },
  };
}

/** At most `limit` requests per visitor and module in a window, kept in memory (Q532). */
export class VisitorLimiter {
  private readonly seen = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}
  /** Counts a request; false when the visitor already sent the limit. */
  take(key: string, at: number): boolean {
    const recent = (this.seen.get(key) ?? []).filter((t) => t > at - this.windowMs);
    if (recent.length >= this.limit) {
      this.seen.set(key, recent);
      return false;
    }
    recent.push(at);
    this.seen.set(key, recent);
    if (this.seen.size > 10_000) this.seen.delete(this.seen.keys().next().value!);
    return true;
  }
}
