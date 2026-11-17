// The local web server the preview loads its pages from: the project, served
// by the runtime, on 127.0.0.1 only. A real address keeps forms, cookies and
// htmx requests working as they will once the site is published.
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize, sep } from "node:path";
import type { Runtime } from "@upstart/runtime";
import { daisyuiBelowComponents, START_JS, START_SCRIPT, VENDOR } from "@upstart/runtime";

/** Named so that it does not collide with the `require` electron-vite adds to ESM output. */
const nodeRequire = createRequire(import.meta.url);

export const VENDOR_BASE = "/__up/vendor";

let daisyui: string | undefined;
/** daisyui.css with its components below the site's (daisyuiBelowComponents), made once. */
function layeredDaisyui(file: string): string {
  daisyui ??= daisyuiBelowComponents(readFileSync(file, "utf8"));
  return daisyui;
}

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
  /** The page last served at each address, as it was sent. */
  private readonly pages = new Map<string, string>();

  /**
   * `site()` gives what is served now: the open project, or nothing. `block(id)`
   * gives a gallery block's template, shown alone with the project's theme at
   * /__up/block/<id>, for its thumbnail.
   */
  constructor(
    private readonly site: () => Site | undefined,
    private readonly block: (id: string) => string | undefined = () => undefined,
    private readonly font: (path: string) => string | undefined = () => undefined,
  ) {}

  get origin() {
    return `http://127.0.0.1:${this.port}`;
  }

  /** The page last served at an address, if it was one: what a page loaded from it shows. */
  servedPage(pathname: string): string | undefined {
    return this.pages.get(pathname);
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

    if (url.pathname === `${VENDOR_BASE}/${START_SCRIPT}`) {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(START_JS);
      return;
    }
    if (url.pathname.startsWith(`${VENDOR_BASE}/`)) {
      const name = url.pathname.slice(VENDOR_BASE.length + 1) as keyof typeof VENDOR;
      const vendor = VENDOR[name];
      if (!vendor) return notFound(res);
      const file = nodeRequire.resolve(vendor.module);
      res.writeHead(200, { "content-type": vendor.type, "cache-control": "max-age=3600" });
      if (name === "daisyui.css") res.end(layeredDaisyui(file));
      else createReadStream(file).pipe(res);
      return;
    }

    // A shipped font, for a theme the Theme tab shows before writing it.
    const font = /^\/__up\/fonts\/([a-z0-9-]+\/(?:normal|italic)\.woff2)$/.exec(url.pathname);
    if (font) {
      const file = this.font(font[1]!);
      if (!file || !isFile(file)) return notFound(res);
      res.writeHead(200, { "content-type": "font/woff2", "cache-control": "max-age=3600" });
      createReadStream(file).pipe(res);
      return;
    }

    const site = this.site();
    if (!site) return notFound(res);

    const block = /^\/__up\/block\/([a-z0-9-]+)$/.exec(url.pathname);
    if (block) {
      const source = this.block(block[1]!);
      if (source === undefined) return notFound(res);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(site.runtime.decorate(`<!doctype html><html><head><title></title></head><body>${source}</body></html>`));
      return;
    }

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

    const method = req.method ?? "GET";
    // A form tried in the preview sends its fields (Q172).
    const body = method === "GET" || method === "HEAD" ? undefined : new Uint8Array(await readBody(req));
    const request = new Request(url, { method, headers: req.headers as Record<string, string>, body });
    const response = await site.runtime.fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    const sent = Buffer.from(await response.arrayBuffer());
    if (method === "GET" && response.status === 200 && response.headers.get("content-type")?.startsWith("text/html"))
      this.pages.set(url.pathname, sent.toString("utf8"));
    res.end(sent);
  }
}

/** A request's body, at most 1 MB: what a form sends. */
async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1024 * 1024) throw new Error("This form sent too much.");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
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
