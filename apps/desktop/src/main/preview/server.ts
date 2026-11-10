// The local web server the preview loads its pages from: the project, served
// by the runtime, on 127.0.0.1 only. A real address keeps forms, cookies and
// htmx requests working as they will once the site is published.
import { createReadStream, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize, sep } from "node:path";
import type { Runtime } from "@upstart/runtime";
import { VENDOR } from "@upstart/runtime";

/** Named so that it does not collide with the `require` electron-vite adds to ESM output. */
const nodeRequire = createRequire(import.meta.url);

export const VENDOR_BASE = "/__up/vendor";

const STATIC_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
};

export type Site = { root: string; runtime: Runtime };

export class PreviewServer {
  private server: Server | undefined;
  private port = 0;

  /** `site()` gives what is served now: the open project, or nothing. */
  constructor(private readonly site: () => Site | undefined) {}

  get origin() {
    return `http://127.0.0.1:${this.port}`;
  }

  async start() {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error) => {
        if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
        res.end(String(error));
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const address = this.server.address();
    this.port = typeof address === "object" && address ? address.port : 0;
  }

  stop() {
    this.server?.close();
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", this.origin);
    res.setHeader("cache-control", "no-store");

    if (url.pathname.startsWith(`${VENDOR_BASE}/`)) {
      const name = url.pathname.slice(VENDOR_BASE.length + 1) as keyof typeof VENDOR;
      const vendor = VENDOR[name];
      if (!vendor) return notFound(res);
      const file = nodeRequire.resolve(vendor.module);
      res.writeHead(200, { "content-type": vendor.type, "cache-control": "max-age=3600" });
      createReadStream(file).pipe(res);
      return;
    }

    const site = this.site();
    if (!site) return notFound(res);

    // A file of the project that is not a template: an image, a font, a script.
    const ext = extname(url.pathname).toLowerCase();
    if (ext && STATIC_TYPES[ext] && url.pathname !== "/theme.css") {
      const file = safeJoin(site.root, decodeURIComponent(url.pathname));
      if (file && isFile(file)) {
        res.writeHead(200, { "content-type": STATIC_TYPES[ext] });
        createReadStream(file).pipe(res);
        return;
      }
    }

    // A project with no page yet: an empty page, ready for the agent's first file.
    if (
      site.runtime.routes().length === 0 &&
      !url.pathname.startsWith("/fragments/") &&
      url.pathname !== "/theme.css"
    ) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(site.runtime.decorate("<!doctype html><html><head></head><body></body></html>"));
      return;
    }

    const request = new Request(url, { method: req.method ?? "GET", headers: req.headers as Record<string, string> });
    const response = await site.runtime.fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }
}

function notFound(res: ServerResponse) {
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
}

function isFile(path: string) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** A path inside `root`, or undefined for anything that would leave it or reach a hidden folder. */
export function safeJoin(root: string, urlPath: string): string | undefined {
  const relative = normalize(urlPath).replace(/^([/\\])+/, "");
  if (relative.split(/[/\\]/).some((part) => part === ".." || part.startsWith("."))) return undefined;
  const full = join(root, relative);
  return full.startsWith(root.endsWith(sep) ? root : root + sep) ? full : undefined;
}
