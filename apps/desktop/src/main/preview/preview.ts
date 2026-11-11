// The preview: a native view laid over the window's preview column (ADR 0008),
// showing the open project as served by the runtime. When the project's files
// change, the page is rendered again and morphed in place, never reloaded.
import { createHash } from "node:crypto";
import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Overlay, previewHead, Runtime } from "@upstart/runtime";
import { diskSource } from "@upstart/runtime/node";
import { type BrowserWindow, shell, WebContentsView } from "electron";
import type {
  DeviceView,
  FromPreview,
  GridCell,
  PageComment,
  PreviewInvokes,
  PreviewMode,
  PreviewState,
  PreviewView,
  ProjectInfo,
  Rect,
  ToPreview,
} from "../../shared/ipc";
import { PageGrid, pictureKey, type ThumbnailAction, type ThumbnailScreen } from "./grid";
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
  /** What the preview's script may ask for: the maker's edits and comments (Q90, Q95). */
  invokes?: Partial<PreviewInvokes>;
  /** A gallery block's template, for its thumbnail (Q92). */
  block?: (id: string) => string | undefined;
  /** A shipped font's file, from its path under /__up/fonts/, for a theme shown before it is written. */
  font?: (path: string) => string | undefined;
  /** A page's thumbnail in the "All pages" view was clicked, right-clicked or hovered (Q132). */
  onThumb?: (route: string, action: ThumbnailAction) => void;
  /** A page's picture in the "All pages" view, new or taken again (Q141). */
  onPicture?: (route: string, url: string) => void;
  /** The preview went to one page or to all of them, by the maker or on its own (Q131). */
  onView?: (view: PreviewView) => void;
  /** The agent began writing a website's second page, or a later one (Q131). */
  onManyPages?: () => void;
};

export class Preview {
  readonly view: WebContentsView;
  private readonly server: PreviewServer;
  private site: OpenSite | undefined;
  private bounds: Rect | null = null;
  private device: DeviceView | undefined;
  private route: string | null = null;
  private title = "";
  private loading = false;
  /** Whether the page shows something yet; until then the interface's empty state stays visible. */
  private shown = false;
  private pending: { final: boolean } | undefined;
  private timer: NodeJS.Timeout | undefined;
  private lastPush = 0;
  /** Whether the preview moves to the page the agent writes; off once the maker navigates. */
  private following = true;
  readonly errors: { message: string; source?: string; at: number }[] = [];
  /** How the page answers the pointer (Q99), and whether editing waits for the agent (Q91). */
  private mode: PreviewMode = "edit";
  private paused = false;
  private chromeHidden: (() => void) | undefined;
  /** Every page as thumbnails (Q128): their views, and which view is shown. */
  readonly grid: PageGrid;
  private viewMode: PreviewView = "page";
  /** The page the agent is writing (Q134). */
  private writing: string | null = null;
  /** For checks: how long the last renderings took, in milliseconds, thumbnails included. */
  readonly pushTimes: number[] = [];

  constructor(
    private readonly win: BrowserWindow,
    private readonly options: PreviewOptions,
  ) {
    this.server = new PreviewServer(
      () => this.site && { root: this.site.root, runtime: this.site.runtime },
      options.block,
      options.font,
    );
    this.view = new WebContentsView({
      webPreferences: {
        preload: join(here, "../preload/preview.cjs"),
        contextIsolation: true,
        sandbox: true,
        partition: "preview",
        backgroundThrottling: !options.background,
        // The app's checks, run in the background, read the editor's drawings.
        additionalArguments: options.background ? ["--upstart-checks"] : [],
      },
    });
    this.view.setVisible(false);
    win.contentView.addChildView(this.view);
    this.guard();
    this.grid = new PageGrid(win, {
      origin: () => this.origin,
      preload: join(here, "../preload/preview.cjs"),
      background: options.background,
      onAction: (route, action) => options.onThumb?.(route, action),
      wantsRendering: () => this.refresh(true),
      keyOf: (route) => {
        const site = this.site;
        if (!site?.runtime.resolve(route)) return undefined;
        const result = site.runtime.renderRoute(route);
        return result.status === 200 ? pictureKey(result.html, site.runtime.theme()) : undefined;
      },
      onPicture: (route, url) => options.onPicture?.(route, url),
    });
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
    // Hidden by close() above: a project with pages is shown again at once.
    this.layout();
    await this.navigate(runtime.routes()[0]?.route ?? "/");
  }

  close() {
    this.site?.watcher?.close();
    this.site = undefined;
    this.route = null;
    this.writing = null;
    this.grid.clear();
    this.shown = false;
    this.layout();
    this.emit();
  }

  /** A new turn of the agent: the preview follows it again. */
  startFollowing() {
    this.following = true;
  }

  async navigate(route: string, byMaker = false) {
    if (byMaker) this.following = false;
    this.loading = true;
    this.emit();
    await this.view.webContents.loadURL(new URL(route, this.origin).toString()).catch(() => {});
  }

  reload() {
    this.view.webContents.reload();
  }

  setBounds(rect: Rect | null, device?: DeviceView) {
    this.bounds = rect;
    const changed = JSON.stringify(device) !== JSON.stringify(this.device);
    this.device = device;
    if (changed) this.emulate();
    this.layout();
  }

  /**
   * The page laid out at the device's size and drawn smaller to fit, or at the
   * view's own size. As DevTools does it, so that the page's viewport meta tag
   * counts as on a phone.
   */
  private emulate() {
    const d = this.device;
    const tools = this.view.webContents.debugger;
    try {
      if (!tools.isAttached()) tools.attach("1.3");
    } catch {
      return;
    }
    if (!d) {
      void tools.sendCommand("Emulation.clearDeviceMetricsOverride").catch(() => {});
      this.view.setBorderRadius(0);
      return;
    }
    void tools
      .sendCommand("Emulation.setDeviceMetricsOverride", {
        width: d.width,
        height: d.height,
        deviceScaleFactor: 0,
        mobile: true,
        scale: d.scale,
        screenWidth: d.width,
        screenHeight: d.height,
      })
      .catch(() => {});
    this.view.setBorderRadius(Math.round(d.radius));
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

  /** The "All pages" thumbnails, where the interface put them; null hides them. */
  setGrid(cells: GridCell[] | null, screen?: ThumbnailScreen) {
    this.grid.setCells(this.site ? cells : null, screen);
  }

  /** One page, or every page as thumbnails (Q128). */
  setView(view: PreviewView) {
    if (view === this.viewMode) return;
    this.viewMode = view;
    this.options.onView?.(view);
    this.emit();
  }

  get currentView() {
    return this.viewMode;
  }

  /** The agent's turn is over: no page is being written. */
  doneWriting() {
    if (this.writing === null) return;
    this.writing = null;
    this.grid.setWriting(null);
    this.emit();
  }

  /** Points the preview at a page, when the agent starts writing it. */
  follow(file: string) {
    const writing = this.site?.runtime.routeOf(file);
    if (writing !== undefined && writing !== this.writing) {
      this.writing = writing;
      this.grid.setWriting(writing);
      this.emit();
      const routes = new Set(this.site?.runtime.routes().map((r) => r.route));
      routes.add(writing);
      if (routes.size >= 2) this.options.onManyPages?.();
    }
    if (!this.following) return;
    const route = this.site?.runtime.routeOf(file);
    if (route !== undefined && route !== this.route) {
      this.route = route;
      this.view.webContents
        .executeJavaScript(`history.replaceState(null, "", ${JSON.stringify(route)})`)
        .catch(() => {});
    }
  }

  /** Edit or visitor (Q99). */
  setMode(mode: PreviewMode) {
    this.mode = mode;
    this.sendEditor();
    this.emit();
  }

  /** While the agent works, editing by hand waits (Q91). */
  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    this.sendEditor();
  }

  private sendEditor() {
    this.send({ type: "editor", mode: this.mode, paused: this.paused });
    this.send({ type: "comments", comments: this.comments });
  }

  private comments: PageComment[] = [];

  /** The maker's comments, drawn by the page on the elements they are about (Q95). */
  /** A theme being set in the Theme tab, shown before it is written (Q93). */
  showTheme(css: string) {
    if (this.site) this.send({ type: "theme", css });
  }

  setComments(comments: PageComment[]) {
    this.comments = comments;
    this.send({ type: "comments", comments });
  }

  /**
   * A picture of the page as the maker sees it, taken without the window
   * being on screen, without Upstart's own drawings over the page.
   */
  async capture(params: Record<string, unknown> = {}): Promise<Buffer> {
    const contents = this.view.webContents;
    if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
    await this.hideChrome(true);
    try {
      const { data } = await contents.debugger.sendCommand("Page.captureScreenshot", { format: "png", ...params });
      return Buffer.from(data, "base64");
    } finally {
      this.send({ type: "chrome", hidden: false });
    }
  }

  private hideChrome(hidden: boolean): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, 300);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.chromeHidden = done;
      this.send({ type: "chrome", hidden });
    });
  }

  /**
   * What the agent sees when it looks at the preview: the page as shown, the
   * errors the page reported and what the runtime had to repair or skip.
   */
  async look(): Promise<{ route: string | null; png?: Buffer; errors: string[]; notes: string[] }> {
    const site = this.site;
    const route = this.route;
    const result = site && route !== null && site.runtime.resolve(route) ? site.runtime.renderRoute(route) : undefined;
    const since = Date.now() - 60_000;
    const png = this.shown ? await this.capture().catch(() => undefined) : undefined;
    return {
      route,
      png,
      errors: this.errors.filter((e) => e.at > since).map((e) => (e.source ? `${e.message} (${e.source})` : e.message)),
      notes: result
        ? [
            ...(result.status !== 200 ? [`status ${result.status}`] : []),
            ...result.notes.map((n) => `${n.file}: ${n.note}`),
          ]
        : [],
    };
  }

  state(): PreviewState {
    return {
      route: this.site ? this.route : null,
      title: this.title,
      routes: this.site?.runtime.routes() ?? [],
      loading: this.loading,
      mode: this.mode,
      theme: this.site ? createHash("sha256").update(this.site.runtime.theme()).digest("hex").slice(0, 12) : "",
      view: this.viewMode,
      writing: this.site ? this.writing : null,
    };
  }

  private push() {
    const started = performance.now();
    this.pushNow();
    this.pushTimes.push(Math.round((performance.now() - started) * 10) / 10);
    if (this.pushTimes.length > 500) this.pushTimes.shift();
  }

  private pushNow() {
    const site = this.site;
    const pending = this.pending;
    this.pending = undefined;
    if (!site || !pending) return;
    this.lastPush = Date.now();
    const theme = site.runtime.theme();
    this.send({ type: "theme", css: theme });
    this.grid.setTheme(theme);
    this.pushGrid(site, pending.final);
    // A file is complete: the pictures of the pages it changed are taken again (Q141).
    if (pending.final) this.grid.filesChanged();
    // A theme is the first thing the agent writes: the empty page in the
    // site's colours is shown at once, before the first text (decisions).
    if (!this.shown && /--theme-[\w-]+\s*:[^;]+;/.test(theme)) {
      this.shown = true;
      this.layout();
    }
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
    // Nor is a page whose body has not started yet (its head is still being
    // written): the page shown so far stays rather than turning blank.
    if (site.overlay.size > 0 && !hasVisibleBody(result.html)) return this.emit();
    this.send({ type: "render", html: result.html, final: pending.final && site.overlay.size === 0 });
    if (!this.shown) {
      this.shown = true;
      this.layout();
    }
    this.emit();
  }

  /** Each page on screen in the "All pages" view gets its rendering (Q130), by the same rules as the page. */
  private pushGrid(site: OpenSite, final: boolean) {
    for (const route of this.grid.live()) {
      if (!site.runtime.resolve(route)) continue;
      const result = site.runtime.renderRoute(route);
      if (result.status !== 200) continue;
      if (site.overlay.size > 0 && !hasVisibleBody(result.html)) continue;
      this.grid.render(route, result.html, final && site.overlay.size === 0);
    }
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
      // A link the maker followed: the preview stays where they went.
      this.following = false;
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
    // A new document may come with a new renderer, which starts without the device's size.
    contents.on("did-start-navigation", (details) => {
      if (details.isMainFrame && !details.isSameDocument && this.device) this.emulate();
    });
    contents.on("dom-ready", () => {
      if (this.device) this.emulate();
    });
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
    // The edits and comments the maker makes in the page, from the preview's own script only.
    for (const [channel, handler] of Object.entries(this.options.invokes ?? {}))
      contents.ipc.handle(channel, (event, ...args: unknown[]) => {
        if (event.sender !== contents) throw new Error("Not available.");
        return (handler as (...a: unknown[]) => unknown)(...args);
      });
    contents.ipc.on("preview:event", (event, message: FromPreview) => {
      if (event.sender !== contents) return;
      if (message.type === "error") {
        this.errors.push({ message: message.message, source: message.source, at: Date.now() });
        if (this.errors.length > 50) this.errors.shift();
      }
      if (message.type === "chrome-hidden") {
        this.chromeHidden?.();
        this.chromeHidden = undefined;
      }
      if (message.type === "loaded") {
        this.title = message.title;
        this.sendEditor();
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

/** Whether a page's body shows anything yet: text, an image or a drawing. */
export function hasVisibleBody(html: string): boolean {
  const start = html.search(/<body[\s>]/i);
  if (start < 0) return false;
  const body = html
    .slice(start)
    .replace(/^<body[^>]*>/i, "")
    .replace(/<(script|style|template)[\s\S]*?(<\/\1>|$)/gi, "");
  if (/<(img|svg|video|canvas|picture|iframe)[\s>]/i.test(body)) return true;
  return body.replace(/<[^>]*>/g, "").trim().length > 0;
}
