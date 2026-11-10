// The preview: a native view laid over the window's preview column (ADR 0008),
// showing the open project as served by the runtime. When the project's files
// change, the page is rendered again and morphed in place, never reloaded.
import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Overlay, previewHead, Runtime } from "@upstart/runtime";
import { diskSource } from "@upstart/runtime/node";
import { type BrowserWindow, shell, WebContentsView } from "electron";
import type { FromPreview, PreviewState, ProjectInfo, Rect, ToPreview } from "../../shared/ipc";
import { PreviewServer, VENDOR_BASE } from "./server";

const here = fileURLToPath(new URL(".", import.meta.url));

/** The shortest time between two renderings pushed to the page (ADR 0009). */
const INTERVAL_MS = 60;

type OpenSite = {
  project: ProjectInfo;
  root: string;
  overlay: Overlay;
  runtime: Runtime;
  watcher: FSWatcher | undefined;
};

export type PreviewOptions = {
  background: boolean;
  onState: (state: PreviewState) => void;
  onPageEvent?: (event: FromPreview) => void;
};

export class Preview {
  readonly view: WebContentsView;
  private readonly server: PreviewServer;
  private site: OpenSite | undefined;
  private bounds: Rect | null = null;
  private route: string | null = null;
  private title = "";
  private loading = false;
  /** Whether the page shows something yet; until then the interface's empty state stays visible. */
  private shown = false;
  private pending: { final: boolean } | undefined;
  private timer: NodeJS.Timeout | undefined;
  private lastPush = 0;
  readonly errors: { message: string; source?: string; at: number }[] = [];

  constructor(
    private readonly win: BrowserWindow,
    private readonly options: PreviewOptions,
  ) {
    this.server = new PreviewServer(() => this.site && { root: this.site.root, runtime: this.site.runtime });
    this.view = new WebContentsView({
      webPreferences: {
        preload: join(here, "../preload/preview.cjs"),
        contextIsolation: true,
        sandbox: true,
        partition: "preview",
        backgroundThrottling: !options.background,
      },
    });
    this.view.setVisible(false);
    win.contentView.addChildView(this.view);
    this.guard();
  }

  async start() {
    await this.server.start();
    // A view that never loaded anything has no document; tools that drive the
    // app (DevTools, Playwright) wait for one.
    await this.view.webContents.loadURL("about:blank").catch(() => {});
  }

  get origin() {
    return this.server.origin;
  }

  get project() {
    return this.site?.project;
  }

  /** Shows a project: its home page, or an empty page waiting for the agent's first file. */
  async open(project: ProjectInfo) {
    this.close();
    const overlay = new Overlay(diskSource(project.path));
    const runtime: Runtime = new Runtime(overlay, {
      markPageStyles: true,
      head: () => previewHead({ vendorBase: VENDOR_BASE, theme: runtime.theme() }),
    });
    const site: OpenSite = { project, root: project.path, overlay, runtime, watcher: undefined };
    this.site = site;
    site.watcher = this.watch(site);
    this.shown = runtime.routes().length > 0;
    await this.navigate(runtime.routes()[0]?.route ?? "/");
  }

  close() {
    this.site?.watcher?.close();
    this.site = undefined;
    this.route = null;
    this.shown = false;
    this.layout();
    this.emit();
  }

  async navigate(route: string) {
    this.loading = true;
    this.emit();
    await this.view.webContents.loadURL(new URL(route, this.origin).toString()).catch(() => {});
  }

  reload() {
    this.view.webContents.reload();
  }

  setBounds(rect: Rect | null) {
    this.bounds = rect;
    this.layout();
  }

  /** The files that the agent is writing, in front of the disk's (ADR 0009). */
  get overlay() {
    return this.site?.overlay;
  }

  get runtime() {
    return this.site?.runtime;
  }

  /**
   * Asks for the page to be rendered again from the project's files. Calls are
   * gathered: at most one rendering every INTERVAL_MS, `final` when any asked
   * for it (the files are complete, scripts may run).
   */
  refresh(final: boolean) {
    this.pending = { final: final || (this.pending?.final ?? false) };
    if (this.timer) return;
    const wait = Math.max(0, INTERVAL_MS - (Date.now() - this.lastPush));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.push();
    }, wait);
  }

  /** Points the preview at a page, when the agent starts writing it. */
  follow(file: string) {
    const route = this.site?.runtime.routeOf(file);
    if (route !== undefined && route !== this.route) {
      this.route = route;
      this.view.webContents
        .executeJavaScript(`history.replaceState(null, "", ${JSON.stringify(route)})`)
        .catch(() => {});
    }
  }

  /** A picture of the page as the maker sees it, taken without the window being on screen. */
  async capture(params: Record<string, unknown> = {}): Promise<Buffer> {
    const contents = this.view.webContents;
    if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
    const { data } = await contents.debugger.sendCommand("Page.captureScreenshot", { format: "png", ...params });
    return Buffer.from(data, "base64");
  }

  state(): PreviewState {
    return {
      route: this.site ? this.route : null,
      title: this.title,
      routes: this.site?.runtime.routes() ?? [],
      loading: this.loading,
    };
  }

  private push() {
    const site = this.site;
    const pending = this.pending;
    this.pending = undefined;
    if (!site || !pending) return;
    this.lastPush = Date.now();
    this.send({ type: "theme", css: site.runtime.theme() });
    const routes = site.runtime.routes();
    let result =
      this.route !== null && site.runtime.resolve(this.route) ? site.runtime.renderRoute(this.route) : undefined;
    if (!result && routes.length === 0) {
      // No page yet: show the first shared part on its own.
      const part = site.runtime.source.list("parts")[0];
      if (part) result = site.runtime.renderLoose(part);
    }
    if (!result && routes[0] && this.route !== routes[0].route) {
      void this.navigate(routes[0].route);
      return;
    }
    // A rendering that failed is not shown: the last good one stays on screen.
    if (!result || result.status !== 200) return this.emit();
    this.send({ type: "render", html: result.html, final: pending.final && site.overlay.size === 0 });
    if (!this.shown) {
      this.shown = true;
      this.layout();
    }
    this.emit();
  }

  private send(message: ToPreview) {
    if (!this.view.webContents.isDestroyed()) this.view.webContents.send("preview:message", message);
  }

  private watch(site: OpenSite): FSWatcher | undefined {
    try {
      return watch(site.root, { recursive: true }, (_event, name) => {
        if (!name || this.site !== site) return;
        const path = name.split("\\").join("/");
        if (path.split("/").some((part) => part.startsWith(".") || part === "node_modules")) return;
        // A file the agent is still writing is shown from the overlay, not from the disk.
        if (site.overlay.has(path)) return;
        this.refresh(true);
      });
    } catch {
      return undefined;
    }
  }

  private layout() {
    const visible = !!this.bounds && !!this.site && this.shown;
    if (this.bounds) this.view.setBounds(this.bounds);
    this.view.setVisible(visible);
  }

  private emit() {
    this.options.onState(this.state());
  }

  private guard() {
    const contents = this.view.webContents;
    contents.setWindowOpenHandler(({ url }) => {
      this.openOutside(url);
      return { action: "deny" };
    });
    contents.on("will-navigate", (details) => {
      if (!details.url.startsWith(`${this.origin}/`)) {
        details.preventDefault();
        this.openOutside(details.url);
      }
    });
    const navigated = (url: string) => {
      if (!url.startsWith(this.origin)) return;
      this.route = new URL(url).pathname;
      this.emit();
    };
    contents.on("did-navigate", (_event, url) => navigated(url));
    contents.on("did-navigate-in-page", (_event, url) => navigated(url));
    contents.on("did-stop-loading", () => {
      this.loading = false;
      this.title = contents.getTitle();
      this.emit();
      // Loading a page takes the keyboard from the interface (ADR 0008): give it back.
      if (!this.options.background && this.win.isFocused()) this.win.webContents.focus();
    });
    contents.on("page-title-updated", (_event, title) => {
      this.title = title;
      this.emit();
    });
    // A page stuck in a loop is stopped and loaded again.
    contents.on("unresponsive", () => {
      contents.forcefullyCrashRenderer();
      setTimeout(() => this.route !== null && void this.navigate(this.route), 300);
    });
    contents.on("render-process-gone", (_event, details) => {
      if (details.reason !== "clean-exit") setTimeout(() => this.route !== null && void this.navigate(this.route), 300);
    });
    // Nothing in the preview may ask for a permission (camera, location, notifications…).
    contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    contents.ipc.on("preview:event", (event, message: FromPreview) => {
      if (event.sender !== contents) return;
      if (message.type === "error") {
        this.errors.push({ message: message.message, source: message.source, at: Date.now() });
        if (this.errors.length > 50) this.errors.shift();
      }
      if (message.type === "loaded") {
        this.title = message.title;
        // Anything that changed while the page was loading.
        this.refresh(true);
      }
      this.options.onPageEvent?.(message);
    });
  }

  private openOutside(url: string) {
    if (this.options.background) return;
    if (/^https?:\/\//.test(url) || url.startsWith("mailto:")) void shell.openExternal(url);
  }
}
