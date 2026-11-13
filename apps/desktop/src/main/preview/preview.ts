// The preview: a native view laid over the window's preview column (ADR 0008),
// showing the open project as served by the runtime. When the project's files
// change, the page is rendered again and morphed in place, never reloaded.
import { createHash } from "node:crypto";
import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Overlay, previewHead, Runtime, tailwindStyle, themeStyle } from "@upstart/runtime";
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
  PreviewZoom,
  PreviewZoomReady,
  ProjectInfo,
  Rect,
  ToPreview,
} from "../../shared/ipc";
import { PageGrid, pictureKey, type ThumbnailAction, type ThumbnailScreen } from "./grid";
import { PreviewServer, VENDOR_BASE } from "./server";
import { isTestRecord, TestRecordStore, testRecordsSource } from "./test-records";

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
  /** A file of the open project changed on the disk, by its path in the project. */
  onFileChanged?: (path: string) => void;
  onPageEvent?: (event: FromPreview) => void;
  /** What the preview's script may ask for: the maker's edits and comments (Q90, Q95). */
  invokes?: Partial<{
    [C in keyof PreviewInvokes]: (
      ...args: Parameters<PreviewInvokes[C]>
    ) => ReturnType<PreviewInvokes[C]> | Promise<ReturnType<PreviewInvokes[C]>>;
  }>;
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
  /** The interface is to zoom between the page and the thumbnails (Q133). */
  onZoom?: (zoom: PreviewZoom) => void;
  /** The agent began writing a website's second page, or a later one (Q131). */
  onManyPages?: () => void;
  /** The page a zoom goes to is drawn, out of sight: the zoom may land (Q142). */
  onZoomReady?: (ready: PreviewZoomReady) => void;
};

export class Preview {
  readonly view: WebContentsView;
  private readonly server: PreviewServer;
  private site: OpenSite | undefined;
  private bounds: Rect | null = null;
  /** Not shown but kept drawn at its place's size, out of sight, so that a zoom lands on a page already drawn (Q142). */
  private parked = false;
  /** For checks: how each zoom to a page landed, whether the page drew a frame out of sight, and how soon. */
  readonly landings: { route: string; drawn: boolean; ms: number }[] = [];
  private device: DeviceView | undefined;
  private route: string | null = null;
  private title = "";
  private loading = false;
  /** Whether the page shows something yet; until then the interface's empty state stays visible. */
  private shown = false;
  /**
   * Test records a form tried in the preview just wrote, and when: the page
   * keeps the form's answer instead of being drawn again (Q172).
   */
  private fromForms = new Map<string, number>();
  private pending: { final: boolean } | undefined;
  private timer: NodeJS.Timeout | undefined;
  private lastPush = 0;
  /** Whether the preview moves to the page the agent writes; off once the maker navigates. */
  private following = true;
  readonly errors: { message: string; source?: string; at: number }[] = [];
  /**
   * How the page answers the pointer (Q99), and whether editing waits for the
   * agent (Q91). A site opens in visitor mode, its animations playing (Q253, Q255).
   */
  private mode: PreviewMode = "visitor";
  private paused = false;
  /** The site's scripts as the page shown loaded them; a change loads the page again. */
  private loadedScripts: string | undefined;
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
      standIns: true,
      // Collected datasources show their test records; a form tried here adds one (Q172).
      testRecords: testRecordsSource(project.path, overlay),
      collected: new TestRecordStore(
        project.path,
        () => runtime.data,
        (file) => {
          this.fromForms.set(file, Date.now());
          this.options.onFileChanged?.(file);
        },
      ),
      head: () =>
        previewHead({
          vendorBase: VENDOR_BASE,
          theme: runtime.theme(),
          assets: runtime.assets(),
          styles: runtime.styles(),
        }),
    });
    const site: OpenSite = { project, root: project.path, overlay, runtime, watcher: undefined };
    this.site = site;
    this.mode = "visitor";
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

  setBounds(rect: Rect | null, device?: DeviceView, parked = false) {
    this.bounds = rect;
    this.parked = !!rect && parked;
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

  /**
   * One page, or every page as thumbnails (Q128). With `animate`, the interface
   * zooms between them (Q133): going to the thumbnails, it is first given a
   * picture of the page shown; going to a page, which page it opens.
   */
  async setView(view: PreviewView, { route, animate = true }: { route?: string; animate?: boolean } = {}) {
    if (view === this.viewMode) return;
    if (animate && view === "pages" && this.bounds && this.shown && this.site) {
      const image = await this.view.webContents.capturePage().catch(() => undefined);
      if (this.viewMode === view) return;
      if (image && !image.isEmpty())
        this.options.onZoom?.({
          to: "pages",
          route: this.route ?? "/",
          url: `data:image/jpeg;base64,${image.toJPEG(85).toString("base64")}`,
        });
    }
    if (animate && view === "page") this.options.onZoom?.({ to: "page", route: route ?? this.route ?? "/" });
    this.viewMode = view;
    this.options.onView?.(view);
    this.emit();
  }

  get currentView() {
    return this.viewMode;
  }

  /**
   * Opens a page from its thumbnail (Q132). From the thumbnails, the interface
   * zooms meanwhile (Q133): the page is loaded out of sight at its size, and
   * once it has drawn, the zoom is told it may land (Q142).
   */
  async openPage(route: string) {
    const zooming = this.viewMode === "pages";
    await this.setView("page", { route });
    const started = Date.now();
    await this.navigate(route, true);
    if (!zooming) return;
    const drawn = await this.drawn();
    this.landings.push({ route, drawn, ms: Date.now() - started });
    if (this.landings.length > 20) this.landings.shift();
    this.options.onZoomReady?.({ route });
  }

  /** Whether the page drew two frames, within a short time: a page out of sight draws none. */
  private drawn(): Promise<boolean> {
    const frames = this.view.webContents
      .executeJavaScript("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))")
      .then(Boolean)
      .catch(() => false);
    return Promise.race([frames, new Promise<boolean>((r) => setTimeout(() => r(false), 600))]);
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
      const routes = new Set(
        this.site?.runtime
          .routes()
          .filter((r) => !r.generated)
          .map((r) => r.route),
      );
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
    if (this.site) this.send({ type: "theme", css: themeStyle(css) });
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
      notes: [
        ...new Set([
          ...(result
            ? [
                ...(result.status !== 200 ? [`status ${result.status}`] : []),
                ...result.notes.map((n) => `${n.file}: ${n.note}`),
              ]
            : []),
          // Every datasource's problems, whichever page is shown: a record left out is said (Q166).
          ...(site ? dataNotes(site.runtime) : []),
          // A page file that gets no address (Q188).
          ...(site ? site.runtime.pageNotes().map((n) => `${n.file}: ${n.note}`) : []),
        ]),
      ],
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
    const styles = tailwindStyle(site.runtime.styles());
    this.send({ type: "theme", css: themeStyle(theme), styles });
    this.grid.setTheme(themeStyle(theme), styles);
    // The site's scripts changed since the page loaded: it loads again, to run them anew (ADR 0011).
    if (pending.final && site.overlay.size === 0 && this.loadedScripts !== undefined) {
      const scripts = scriptsKey(site.runtime);
      if (scripts !== this.loadedScripts) {
        this.loadedScripts = undefined;
        this.view.webContents.reload();
        return;
      }
    }
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
    if (result?.status !== 200) return this.emit();
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
        if (!isTestRecord(path) && path.split("/").some((part) => part.startsWith(".") || part === "node_modules"))
          return;
        this.options.onFileChanged?.(path);
        // A file the agent is still writing is shown from the overlay, not from the disk.
        if (site.overlay.has(path)) return;
        // A record a form just sent: the page shows the form's answer until the visitor moves on.
        const sent = this.fromForms.get(path);
        if (sent !== undefined && Date.now() - sent < 2000) return;
        this.fromForms.delete(path);
        this.refresh(true);
      });
    } catch {
      return undefined;
    }
  }

  private layout() {
    const visible = !!this.bounds && !!this.site && this.shown;
    const b = this.bounds;
    // Parked: left of the window, where it keeps drawing (a hidden view does not).
    if (b) this.view.setBounds(this.parked ? { ...b, x: -b.width - 200 } : b);
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
    // The page's errors, its scripts' and Upstart's start script's: read from its console, the page's
    // own world being out of the preload's reach.
    contents.on("console-message", (details) => {
      if (details.level !== "error") return;
      const source = details.sourceId ? `${details.sourceId}:${details.lineNumber}` : undefined;
      this.errors.push({ message: details.message, source, at: Date.now() });
      if (this.errors.length > 50) this.errors.shift();
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
      if (message.type === "chrome-hidden") {
        this.chromeHidden?.();
        this.chromeHidden = undefined;
      }
      if (message.type === "loaded") {
        this.title = message.title;
        if (this.site) this.loadedScripts = scriptsKey(this.site.runtime);
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

/** The notes of every datasource of the site: records left out, values that do not read. */
function dataNotes(runtime: Runtime): string[] {
  try {
    return runtime.data.names().flatMap((name) => runtime.data.get(name).notes.map((n) => `${n.file}: ${n.note}`));
  } catch {
    return [];
  }
}

/** The site's scripts, what they are and what they hold: what a page that runs them depends on. */
function scriptsKey(runtime: Runtime): string {
  const { libraries, lib, modules } = runtime.assets();
  const hash = createHash("sha256").update(JSON.stringify(libraries));
  for (const path of [...lib, ...modules])
    hash
      .update(path)
      .update("\0")
      .update(runtime.source.read(path) ?? "");
  return hash.digest("hex");
}
