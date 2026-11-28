// The Cloudflare export's Worker (Q175): pages, fragments, form submissions
// and the management API answered by the runtime, the records kept in D1.
// The files of public/ are served by Workers Static Assets before the Worker
// is woken; wrangler.jsonc sends /_data/ and /_spaka/ to it first.
import { moduleHost, type ServerHost, type ServerModule, type SqlApi, secretsEnv } from "../server.ts";
import { SqlStore } from "../sql.ts";
import { type BundledModules, type PublishedSite, siteRuntime } from "./site.ts";

/** The few D1 calls the store needs. */
type D1 = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all(): Promise<{ results: Record<string, unknown>[] }>;
      first(): Promise<Record<string, unknown> | null>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
};
/** The Worker's bindings: its D1, its management token, and the site's secrets (Q516). */
export type WorkerEnv = { DB: D1; SPAKA_TOKEN?: string } & Record<string, unknown>;

/** A value as D1 takes it: true as 1, a date as its ISO text, undefined as null. */
const input = (value: unknown) =>
  value === undefined
    ? null
    : typeof value === "boolean"
      ? value
        ? 1
        : 0
      : value instanceof Date
        ? value.toISOString()
        : value;

/** SQL on the site's D1, as modules call it (Q514). */
function d1Sql(db: D1): SqlApi {
  return {
    all: async (query, ...params) =>
      (
        await db
          .prepare(query)
          .bind(...params.map(input))
          .all()
      ).results,
    get: async (query, ...params) =>
      (await db
        .prepare(query)
        .bind(...params.map(input))
        .first()) ?? undefined,
    run: async (query, ...params) => ({
      changes: (
        await db
          .prepare(query)
          .bind(...params.map(input))
          .run()
      ).meta.changes,
    }),
  };
}

/**
 * The site's server modules (ADR 0014), bundled into modules.mjs: their tables
 * in D1, made by the migrations wrangler applies; no folder for files (Q524).
 */
function workerModules(
  site: PublishedSite,
  bundled: BundledModules,
  env: WorkerEnv,
  runtime: () => ReturnType<typeof siteRuntime>,
): ServerHost | undefined {
  const published = site.server;
  if (!published) return undefined;
  return moduleHost({
    modules: Object.fromEntries(
      published.modules.map((name) => [
        name,
        async () => {
          const load = bundled.modules[name];
          if (!load) throw new Error(`modules.mjs has no module named ${name}: export the website again`);
          return (await load()) as ServerModule;
        },
      ]),
    ),
    context: () => ({
      env: secretsEnv(
        Object.fromEntries(
          published.secrets.map((name) => [name, typeof env[name] === "string" ? (env[name] as string) : undefined]),
        ),
      ),
      data: runtime().dataApi(),
      sql: d1Sql(env.DB),
    }),
  });
}

export function siteWorker(site: PublishedSite, bundled: BundledModules = { modules: {} }) {
  let runtime: ReturnType<typeof siteRuntime> | undefined;
  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      runtime ??= siteRuntime(
        site,
        new SqlStore({
          all: async (sql, params) =>
            (
              await env.DB.prepare(sql)
                .bind(...params)
                .all()
            ).results,
          run: async (sql, params) =>
            (
              await env.DB.prepare(sql)
                .bind(...params)
                .run()
            ).meta.changes,
        }),
        env.SPAKA_TOKEN,
        workerModules(site, bundled, env, () => runtime!),
      );
      const visitor = request.headers.get("cf-connecting-ip") ?? undefined;
      return runtime.fetch(request, visitor ? { visitor } : {});
    },
  };
}
