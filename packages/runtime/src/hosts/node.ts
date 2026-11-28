// The Node export's server (Q176, Q186): the files of public/ served as they
// are, everything else answered by the runtime, the records kept in SQLite by
// node:sqlite in the data folder. A host, so Node's own modules are used here.
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RECORDS_SCHEMA, SqlStore } from "../sql.ts";
import type { PublishedSite } from "./site.ts";
import { siteRuntime } from "./site.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
};

/** A request's body, at most 1 MB: a form sends no files. */
async function body(req: IncomingMessage): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("too large");
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Who sent a request: the address it came from, or the one a reverse proxy
 * such as Caddy gives, when the request comes from this machine or when every
 * request is said to come through a proxy (SPAKA_PROXY, Q556).
 */
export function visitorAddress(
  remote: string | undefined,
  forwardedFor: string | undefined,
  proxied: boolean,
): string | undefined {
  const local = !remote || remote === "::1" || remote.startsWith("127.") || remote === "::ffff:127.0.0.1";
  const forwarded = (forwardedFor ?? "").split(",")[0]?.trim();
  return (local || proxied) && forwarded ? forwarded : remote;
}
const visitorOf = (req: IncomingMessage, proxied: boolean) =>
  visitorAddress(req.socket.remoteAddress, String(req.headers["x-forwarded-for"] ?? ""), proxied);

export type ServerOptions = {
  /** The export's folder: site.json and public/. */
  dir: string;
  /** Where data.sqlite is kept. */
  dataDir: string;
  managementToken?: string;
  /**
   * Every request comes through a reverse proxy, whose word on the visitor's
   * address is believed: the export's compose.yaml, where Caddy alone
   * reaches the server. Never for a server visitors reach themselves, who
   * could then give any address.
   */
  proxied?: boolean;
};

export function siteServer({ dir, dataDir, managementToken, proxied = false }: ServerOptions): Server {
  const site = JSON.parse(readFileSync(join(dir, "site.json"), "utf8")) as PublishedSite;
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "data.sqlite"));
  db.exec(RECORDS_SCHEMA);
  const runtime = siteRuntime(
    site,
    new SqlStore({
      all: async (sql, params) => db.prepare(sql).all(...(params as never[])) as Record<string, unknown>[],
      run: async (sql, params) => Number(db.prepare(sql).run(...(params as never[])).changes),
    }),
    managementToken,
  );
  const publicDir = join(dir, "public");

  const file = (pathname: string): string | undefined => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return undefined;
    }
    const abs = normalize(join(publicDir, decoded));
    if (!abs.startsWith(publicDir + sep)) return undefined;
    try {
      return statSync(abs).isFile() ? abs : undefined;
    } catch {
      return undefined;
    }
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://site");
      const path = (req.method === "GET" || req.method === "HEAD") && file(url.pathname);
      if (path) {
        res.writeHead(200, {
          "content-type": TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
          "cache-control": url.pathname.startsWith("/media/") ? "public, max-age=86400" : "public, max-age=300",
        });
        res.end(req.method === "HEAD" ? undefined : readFileSync(path));
        return;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers))
        if (typeof value === "string") headers.set(name, value);
        else if (Array.isArray(value)) headers.set(name, value.join(", "));
      const data = await body(req);
      const visitor = visitorOf(req, proxied);
      const response = await runtime.fetch(
        new Request(new URL(url.pathname + url.search, `http://${req.headers.host ?? "site"}`), {
          method: req.method ?? "GET",
          headers,
          ...(data ? { body: data } : {}),
        }),
        visitor ? { visitor } : {},
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      res.writeHead(error instanceof Error && error.message === "too large" ? 413 : 500, {
        "content-type": "text/plain; charset=utf-8",
      });
      res.end(error instanceof Error && error.message === "too large" ? "Too large" : "Server error");
    }
  });
  server.on("close", () => db.close());
  return server;
}
