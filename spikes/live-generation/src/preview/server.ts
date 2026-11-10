// The preview server of the spike: serves a project through the runtime to an
// ordinary browser, and pushes updates to the open page over server-sent events.
// Throwaway spike code.
import { createReadStream, existsSync, readFileSync, statSync, watch } from "node:fs";
import http from "node:http";
import path from "node:path";
import { Runtime, type RenderResult } from "../runtime/runtime.ts";

const here = import.meta.dirname;
const modules = path.resolve(here, "../../node_modules");
const VENDOR: Record<string, [string, string]> = {
  "daisyui.css": [path.join(modules, "daisyui/daisyui.css"), "text/css"],
  "tailwind.js": [path.join(modules, "@tailwindcss/browser/dist/index.global.js"), "text/javascript"],
  "htmx.js": [path.join(modules, "htmx.org/dist/htmx.js"), "text/javascript"],
  "idiomorph.js": [path.join(modules, "idiomorph/dist/idiomorph.js"), "text/javascript"],
};
const MIME: Record<string, string> = {
  ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2", ".ico": "image/x-icon",
  ".json": "application/json", ".txt": "text/plain", ".html": "text/html",
};

// The theme's core values (the spike's own naming) and the daisyUI variables pointed at them.
// Fallbacks keep the page presentable before theme.css exists.
const THEME_MAP: [daisy: string, theme: string, fallback: string][] = [
  ["--color-base-100", "--theme-color-surface", "#ffffff"],
  ["--color-base-200", "--theme-color-surface-alt", "#f4f4f5"],
  ["--color-base-300", "--theme-color-border", "#e4e4e7"],
  ["--color-base-content", "--theme-color-text", "#18181b"],
  ["--color-primary", "--theme-color-primary", "#4f46e5"],
  ["--color-primary-content", "--theme-color-primary-content", "#ffffff"],
  ["--color-secondary", "--theme-color-secondary", "#db2777"],
  ["--color-secondary-content", "--theme-color-secondary-content", "#ffffff"],
  ["--color-accent", "--theme-color-accent", "#0d9488"],
  ["--color-accent-content", "--theme-color-accent-content", "#ffffff"],
  ["--color-neutral", "--theme-color-neutral", "#27272a"],
  ["--color-neutral-content", "--theme-color-neutral-content", "#fafafa"],
  ["--radius-box", "--theme-radius", "0.75rem"],
];
const FONT_FALLBACK = 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"';

export const BRIDGE_CSS = `/* daisyUI's variables pointed at the theme's */
:root {
${THEME_MAP.map(([d, t, f]) => `  ${d}: var(${t}, ${f});`).join("\n")}
  --radius-field: calc(var(--radius-box) * 0.5);
  --radius-selector: calc(var(--radius-box) * 0.5);
}
body { font-family: var(--theme-font-body, ${FONT_FALLBACK}); background-color: var(--color-base-100); color: var(--color-base-content); }
h1, h2, h3, h4 { font-family: var(--theme-font-heading, var(--theme-font-body, ${FONT_FALLBACK})); }
`;

// The same names given to Tailwind, so that bg-primary, text-base-content, font-heading,
// rounded-box (and every variant of them) resolve to the theme's variables.
export const TAILWIND_THEME = `@theme inline {
${THEME_MAP.map(([d, t, f]) => `  ${d}: var(${t}, ${f});`).join("\n")}
  --radius-field: calc(var(--theme-radius, 0.75rem) * 0.5);
  --radius-selector: calc(var(--theme-radius, 0.75rem) * 0.5);
  --font-heading: var(--theme-font-heading, ${FONT_FALLBACK});
  --font-body: var(--theme-font-body, ${FONT_FALLBACK});
}`;

/** A stylesheet that is still being written: keep the finished declarations, close the open blocks. */
export function repairCss(css: string): string {
  let cut = Math.max(css.lastIndexOf(";"), css.lastIndexOf("}"), css.lastIndexOf("{")) + 1;
  const openComment = css.lastIndexOf("/*");
  if (openComment >= 0 && css.indexOf("*/", openComment) < 0) cut = Math.min(cut, openComment);
  const kept = css.slice(0, cut);
  const depth = (kept.match(/{/g)?.length ?? 0) - (kept.match(/}/g)?.length ?? 0);
  return kept + "}".repeat(Math.max(0, depth));
}

export type PreviewOptions = {
  projectDir: string;
  /** Minimum delay between two pushes of the same page, in ms. */
  interval?: number;
  label?: string;
  /** A: morph on every chunk. C: reload when a file is complete. */
  mode?: "stream" | "reload" | "instructions";
};

type Client = { res: http.ServerResponse; id: number };

export class PreviewServer {
  runtime: Runtime;
  opts: Required<PreviewOptions>;
  server: http.Server;
  port = 0;
  private clients: Client[] = [];
  private nextClient = 1;
  /** The route the open page shows. The preview follows the agent from page to page. */
  currentRoute = "/";
  private pending = new Map<string, "stream" | "final">();
  private flushing = false;
  private lastFlush = 0;
  private timer: NodeJS.Timeout | null = null;
  private seq = 0;
  private watcher: ReturnType<typeof watch> | null = null;
  private recentFinal = new Map<string, number>();
  /** Approach C: how many reloads have been asked for. A page that loaded before the latest one reloads again. */
  private reloadSeq = 0;
  private finished: { marks: Record<string, number>; text: string } | null = null;
  /** Approach B: the page as built by the agent's instructions, not rendered from files. */
  private instructionDoc: string | null = null;
  /** Approach B: files are written after the page has been shown, and are not shown until the turn ends. */
  private holdFiles = false;
  doneText = "done";
  /** Files whose content is still arriving in the stream (approach A). */
  streaming = new Set<string>();
  reports: unknown[] = [];
  pushLog: { t: number; event: string; route?: string; file?: string; bytes?: number; renderMs?: number; notes?: unknown }[] = [];
  /** Every render note seen during the run, counted (the Liquid cases of the spike). */
  noteCounts = new Map<string, number>();
  t0 = 0;
  private homeComplete = false;
  onReport: ((r: any) => void) | null = null;

  constructor(opts: PreviewOptions) {
    this.opts = { interval: 60, label: "", mode: "stream", ...opts };
    this.runtime = new Runtime(opts.projectDir);
    this.holdFiles = this.opts.mode === "instructions";
    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch((e) => {
        res.statusCode = 500;
        res.end(String(e?.stack ?? e));
      });
    });
  }

  async listen(port = 0): Promise<number> {
    await new Promise<void>((ok) => this.server.listen(port, "127.0.0.1", ok));
    this.port = (this.server.address() as any).port;
    // Files that change on disk without going through the stream tap (a shell command, an edit).
    try {
      this.watcher = watch(this.opts.projectDir, { recursive: true }, (_e, name) => {
        if (!name) return;
        const rel = name.split(path.sep).join("/");
        // Folders report a change whenever a file is added to them: only files count.
        if (rel.startsWith(".") || !path.extname(rel) || this.runtime.files.overlay.has(rel)) return;
        // The tap has just announced this file itself: not a second change.
        if (Date.now() - (this.recentFinal.get(rel) ?? 0) < 1500) return;
        this.fileChanged(rel, "final", "disk");
      });
    } catch {}
    return this.port;
  }

  async close() {
    this.watcher?.close();
    for (const c of this.clients) c.res.end();
    await new Promise((ok) => this.server.close(ok));
  }

  get url() {
    return `http://127.0.0.1:${this.port}`;
  }

  // ---- pushing to the open page -------------------------------------------

  push(event: string, data: Record<string, unknown> = {}) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of this.clients) c.res.write(payload);
  }

  start(t0: number, info: Record<string, unknown> = {}) {
    this.t0 = t0;
    this.push("start", { t0, label: this.opts.label, mode: this.opts.mode, ...info });
  }

  status(text: string) {
    this.push("status", { text });
  }

  /** A file of the project changed: in the stream (still being written) or for good. */
  /** Approach B: show the page built so far from the agent's instructions. */
  showInstructions(html: string) {
    this.instructionDoc = html;
    this.pending.set("@instructions", "stream");
    this.scheduleFlush();
  }

  /** Approach B: the first pass is over, the whole page has been shown. */
  instructionsShown() {
    this.log("instructions-shown");
    this.push("mark", { name: "homeComplete" });
  }

  /** Approach B: the turn is over, switch to what the files render. */
  filesReady() {
    this.holdFiles = false;
    this.pending.set("@files", "final");
    this.scheduleFlush();
  }

  fileChanged(rel: string, state: "stream" | "final", source: "tap" | "disk" = "tap") {
    if (this.holdFiles) return;
    if (state === "final" && source === "tap") this.recentFinal.set(rel, Date.now());
    if (state === "final" || !this.pending.has(rel)) this.pending.set(rel, state);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushing || this.timer) return;
    // Approach C: files that land together (one response of the agent) make one reload, not several.
    const settle = this.opts.mode === "reload" ? 120 : 0;
    const wait = Math.max(settle, this.opts.interval - (performance.now() - this.lastFlush));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, wait);
  }

  private async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const batch = new Map(this.pending);
      this.pending.clear();
      if (batch.size) await this.pushBatch(batch);
    } finally {
      this.lastFlush = performance.now();
      this.flushing = false;
      if (this.pending.size) this.scheduleFlush();
    }
  }

  private async pushBatch(batch: Map<string, "stream" | "final">) {
    if (batch.delete("@instructions") && this.instructionDoc !== null) {
      this.log("instructions", { bytes: this.instructionDoc.length });
      this.push("html", { seq: ++this.seq, route: "/", html: this.instructionDoc, final: false, standalone: false, homeComplete: false, notes: [] });
    }
    if (batch.delete("@files")) {
      const css = this.runtime.theme();
      if (css) this.push("theme", { css: repairCss(css), final: true });
      const rendered = await this.runtime.renderRoute("/");
      if (rendered.status === 200) {
        this.currentRoute = "/";
        this.log("files-swap", { file: rendered.file, bytes: rendered.html.length, notes: rendered.notes });
        // swap: the page on screen was built by instructions; this is the same page rendered from the files.
        this.push("html", { seq: ++this.seq, route: "/", file: rendered.file, html: rendered.html, final: true, standalone: false, homeComplete: false, swap: true, notes: rendered.notes });
        this.push("mark", { name: "homeFiles" });
      } else this.log("files-swap-failed", { notes: rendered.notes });
      return;
    }
    if (!batch.size) return;
    const files = [...batch.keys()];
    const anyFinal = [...batch.values()].includes("final");

    if (this.opts.mode === "reload") {
      // Approach C: nothing moves until a file is complete, then the page reloads.
      if (!anyFinal) return;
      const page = files.find((f) => f.startsWith("pages/"));
      const route = page ? this.runtime.routeOf(page) : undefined;
      if (route && !this.runtime.resolve(this.currentRoute)) this.currentRoute = route;
      this.checkHomeComplete(await this.runtime.renderRoute("/"));
      this.reloadSeq++;
      this.log("reload", { route: this.currentRoute, file: files.join(",") });
      this.push("reload", { route: this.currentRoute, homeComplete: this.homeComplete, files, reloadSeq: this.reloadSeq });
      return;
    }

    if (files.includes("theme.css")) {
      const css = repairCss(this.runtime.theme());
      this.log("theme", { bytes: css.length });
      this.push("theme", { css, final: batch.get("theme.css") === "final" });
    }
    const others = files.filter((f) => f !== "theme.css");
    if (!others.length) return;

    // Follow the agent: a page being written becomes the page shown.
    const page = others.find((f) => f.startsWith("pages/"));
    if (page) {
      const route = this.runtime.routeOf(page);
      if (route) this.currentRoute = route;
    }
    let result: RenderResult;
    let standalone = false;
    if (this.runtime.resolve(this.currentRoute)) result = await this.runtime.renderRoute(this.currentRoute);
    else {
      // No page yet: show the shared part being written on its own.
      const part = others.find((f) => f.startsWith("parts/"));
      if (!part) return;
      result = await this.runtime.renderLoose(part);
      standalone = true;
    }
    for (const n of result.notes) {
      const key = n.note.replace(/closed .*/, "closed …").replace(/:.*line.*/, "");
      this.noteCounts.set(key, (this.noteCounts.get(key) ?? 0) + 1);
    }
    if (result.status !== 200) {
      // Keep the last good render on screen; the note says what went wrong.
      this.log("render-failed", { route: this.currentRoute, file: result.file, notes: result.notes });
      return;
    }
    const final = !standalone && anyFinal && this.runtime.files.overlay.size === 0;
    // While only the <head> of a page has been written its body is empty: keep what is on screen.
    if (!final && /<html[\s>]|<head[\s>]/i.test(result.html)) {
      const body = /<body[^>]*>([\s\S]*?)(?:<\/body>|$)/i.exec(result.html);
      if (!body || !body[1].trim()) return;
    }
    if (!standalone && this.currentRoute === "/") this.checkHomeComplete(result);
    this.log("html", { route: this.currentRoute, file: result.file, bytes: result.html.length, renderMs: Math.round(result.ms * 10) / 10 });
    this.push("html", {
      seq: ++this.seq,
      route: this.currentRoute,
      file: result.file,
      html: result.html,
      final,
      standalone,
      homeComplete: this.homeComplete,
      notes: result.notes,
    });
  }

  /** The home page is complete when its file is written for good and nothing it needs is missing. */
  private checkHomeComplete(result: RenderResult) {
    if (this.homeComplete || result.status !== 200 || !result.file) return;
    // Complete once its last character is on screen, even if the tool has not written it to disk yet.
    if (this.streaming.has(result.file)) return;
    if (result.notes.some((n) => /missing|stand-in|repaired|not valid JSON/.test(n.note))) return;
    this.homeComplete = true;
    this.log("home-complete", { file: result.file });
  }

  private log(event: string, extra: Record<string, unknown> = {}) {
    this.pushLog.push({ t: this.t0 ? Date.now() - this.t0 : 0, event, ...extra });
  }

  // ---- HTTP -----------------------------------------------------------------

  private assets(): string {
    return [
      `<meta charset="utf-8" data-up-runtime>`,
      `<meta name="viewport" content="width=device-width, initial-scale=1" data-up-runtime>`,
      `<meta name="up-reload-seq" content="${this.reloadSeq}" data-up-runtime>`,
      `<link rel="stylesheet" href="/__up/vendor/daisyui.css" data-up-runtime>`,
      `<style id="up-theme" data-up-runtime>${repairCss(this.runtime.theme())}</style>`,
      `<style id="up-bridge" data-up-runtime>${BRIDGE_CSS}</style>`,
      `<style type="text/tailwindcss" data-up-runtime>${TAILWIND_THEME}</style>`,
      `<script src="/__up/vendor/tailwind.js" data-up-runtime></script>`,
      `<script src="/__up/vendor/htmx.js" data-up-runtime></script>`,
      `<script src="/__up/vendor/idiomorph.js" data-up-runtime></script>`,
      `<script src="/__up/client.js" data-up-runtime></script>`,
    ].join("\n");
  }

  /** Put the runtime's own assets into a rendered page. */
  decorate(html: string): string {
    const assets = this.assets();
    const head = /<head[^>]*>/i.exec(html);
    if (head) return html.slice(0, head.index + head[0].length) + "\n" + assets + html.slice(head.index + head[0].length);
    const root = /<html[^>]*>/i.exec(html);
    if (root) return html.slice(0, root.index + root[0].length) + `<head>${assets}</head>` + html.slice(root.index + root[0].length);
    return `<!doctype html><html><head>${assets}</head><body>${html}</body></html>`;
  }

  private async body(req: http.IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? "/", "http://x");
    const p = decodeURIComponent(url.pathname);
    const send = (status: number, type: string, body: string | Buffer, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": type.startsWith("text/") ? `${type}; charset=utf-8` : type, "cache-control": "no-store", ...headers });
      res.end(body);
    };

    if (p === "/__up/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      const client = { res, id: this.nextClient++ };
      this.clients.push(client);
      res.write(`event: hello\ndata: ${JSON.stringify({ t0: this.t0, label: this.opts.label, mode: this.opts.mode, finished: this.finished, reloadSeq: this.reloadSeq, homeComplete: this.homeComplete })}\n\n`);
      req.on("close", () => (this.clients = this.clients.filter((c) => c !== client)));
      return;
    }
    if (p === "/__up/report" && req.method === "POST") {
      const report = JSON.parse(await this.body(req));
      this.reports.push(report);
      // Pages opened after the run (the tour of the result) show the run's final figures.
      if (report.kind === "final") this.finished = { marks: report.marks, text: this.doneText };
      this.onReport?.(report);
      return send(204, "text/plain", "");
    }
    if (p === "/__up/client.js") return send(200, "text/javascript", readFileSync(path.join(here, "client.js")));
    if (p.startsWith("/__up/vendor/")) {
      const v = VENDOR[p.slice("/__up/vendor/".length)];
      if (!v) return send(404, "text/plain", "not found");
      return send(200, v[1], readFileSync(v[0]), { "cache-control": "max-age=3600" });
    }
    if (p === "/theme.css") return send(200, "text/css", repairCss(this.runtime.theme()));

    // The generated write endpoint of a datasource.
    const data = /^\/data\/([\w-]+)$/.exec(p);
    if (data && req.method === "POST") {
      const input = Object.fromEntries(new URLSearchParams(await this.body(req)));
      const r = await this.runtime.createRecord(data[1], input);
      this.log("data-post", { file: `data/${data[1]}.json`, notes: { status: r.status, input } });
      return send(r.status, "text/html", r.html);
    }
    const fragment = /^\/fragments\/([\w/-]+)$/.exec(p);
    if (fragment) {
      const r = await this.runtime.renderFragment(fragment[1], { params: Object.fromEntries(url.searchParams) });
      return send(r.status, "text/html", r.html);
    }
    // Media and other static files of the project.
    const ext = path.extname(p);
    if (ext && MIME[ext] && !p.includes("..")) {
      for (const base of ["", "media", "public"]) {
        const abs = path.join(this.opts.projectDir, base, p);
        if (existsSync(abs) && statSync(abs).isFile()) {
          res.writeHead(200, { "content-type": MIME[ext], "cache-control": "no-store" });
          createReadStream(abs).pipe(res);
          return;
        }
      }
      return send(404, "text/plain", "not found");
    }

    // A page.
    if (req.method !== "GET") return send(405, "text/plain", "method not allowed");
    const r = await this.runtime.renderRoute(p, Object.fromEntries(url.searchParams));
    if (r.status === 404) {
      // An empty project, or a page that is not written yet: an empty shell the stream will fill.
      return send(200, "text/html", this.decorate(`<!doctype html><html lang="en"><head><title>Upstart preview</title></head><body></body></html>`));
    }
    if (r.status !== 200) return send(500, "text/html", this.decorate(`<pre>${r.notes.map((n) => `${n.file}: ${n.note}`).join("\n")}</pre>`));
    this.currentRoute = "/" + p.replace(/^\/+|\/+$/g, "");
    return send(200, "text/html", this.decorate(r.html));
  }
}
