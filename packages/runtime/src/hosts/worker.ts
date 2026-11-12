// The Cloudflare export's Worker (Q175): pages, fragments, form submissions
// and the management API answered by the runtime, the records kept in D1.
// The files of public/ are served by Workers Static Assets before the Worker
// is woken; wrangler.jsonc sends /_data/ and /_upstart/ to it first.
import { SqlStore } from "../sql.ts";
import { type PublishedSite, siteRuntime } from "./site.ts";

/** The few D1 calls the store needs. */
type D1 = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all(): Promise<{ results: Record<string, unknown>[] }>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
};
export type WorkerEnv = { DB: D1; UPSTART_TOKEN?: string };

export function siteWorker(site: PublishedSite) {
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
        env.UPSTART_TOKEN,
      );
      const visitor = request.headers.get("cf-connecting-ip") ?? undefined;
      return runtime.fetch(request, visitor ? { visitor } : {});
    },
  };
}
