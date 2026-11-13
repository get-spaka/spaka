// The preview's "All pages" view (Q128–Q141). Each page is a picture of its
// first screen, laid out on a screen's width and drawn small (Q129), taken by
// a window that is never shown and taken again when a file is finished; the
// page the agent is writing is a live view instead, laid over its cell and
// morphed into each new rendering like the preview (ADR 0009), so that the
// maker sees it being written (Q134). Only one live view: each costs a page
// of its own, about 125 MB (Q141). The live view takes no click on its
// content: its script passes the click and the right click on (Q132).
import { createHash } from "node:crypto";
import { BrowserWindow, type NativeImage, WebContentsView } from "electron";
import type { FromPreview, GridCell, ToPreview } from "../../shared/ipc";

export type ThumbnailScreen = { width: number; height: number; mobile: boolean };
export type ThumbnailAction = Extract<FromPreview, { type: "thumb" }>["action"];

/** The width pictures are kept at: sharp in a thumbnail of up to about 400 px on a Retina screen. */
const PICTURE_WIDTH = 800;
/** How long after a file is finished the pictures are taken again, gathering the files finished together. */
const PICTURES_DELAY_MS = 250;

type Live = {
  view: WebContentsView;
  route: string;
  /** Its document exists: the screen can be emulated. */
  ready: boolean;
  loaded: boolean;
  shown: boolean;
  clip: number;
  html?: string;
  final?: boolean;
  sent: boolean;
};

export type GridOptions = {
  origin: () => string;
  preload: string;
  background: boolean;
  onAction: (route: string, action: ThumbnailAction) => void;
  /** The live view loaded: it needs a rendering. */
  wantsRendering: () => void;
  /** What a page's picture shows, as a short key: its rendering and its theme. Undefined: no such page. */
  keyOf: (route: string) => string | undefined;
  /** A page's picture, new or taken again, as a data URL. */
  onPicture: (route: string, url: string) => void;
};

export class PageGrid {
  private cells = new Map<string, GridCell>();
  private screen: ThumbnailScreen = { width: 1280, height: 800, mobile: false };
  private theme = "";
  private styles: string | undefined;
  private writing: string | null = null;
  /** The page just written, still live until its picture is taken: no half-written picture shows meanwhile. */
  private leaving: string | null = null;
  private current: Live | undefined;
  private readonly pictures = new Map<string, { key: string; url: string }>();
  private readonly camera: Camera;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly win: BrowserWindow,
    private readonly o: GridOptions,
  ) {
    this.camera = new Camera(o.origin);
  }

  /** The pages shown, and where; null hides them (the page view, or something over the window). */
  setCells(cells: GridCell[] | null, screen?: ThumbnailScreen) {
    const opening = this.cells.size === 0 && !!cells?.length;
    const resized = !!screen && JSON.stringify(screen) !== JSON.stringify(this.screen);
    if (screen) this.screen = screen;
    if (resized) this.pictures.clear();
    const before = new Set(this.cells.keys());
    this.cells = new Map((cells ?? []).map((c) => [c.route, c]));
    // The interface shows again what it may have forgotten while the grid was away.
    if (opening) for (const [route, p] of this.pictures) if (this.cells.has(route)) this.o.onPicture(route, p.url);
    if (cells) for (const route of [...this.pictures.keys()]) if (!this.cells.has(route)) this.pictures.delete(route);
    this.place(resized);
    if (resized || opening || [...this.cells.keys()].some((r) => !before.has(r))) this.picturesLater(0);
  }

  /** The page the agent is writing, or null once its turn is over. */
  setWriting(route: string | null) {
    if (route === this.writing) return;
    const was = this.writing;
    this.writing = route;
    // The page that was live becomes a picture again, once that picture is taken.
    if (was !== null && this.leaving === null && this.current?.shown && this.current.route === was) this.leaving = was;
    if (was !== null) this.picturesLater(0);
    this.place(false);
  }

  /** The pages that follow the renderings: the one being written, when it is on screen. */
  live(): string[] {
    const live = this.current;
    return live?.loaded && this.cells.get(live.route)?.visible ? [live.route] : [];
  }

  /** A page's new rendering, sent to the live view if it shows that page. */
  render(route: string, html: string, final: boolean) {
    const live = this.current;
    if (!live || live.route !== route) return;
    if (live.html === html && live.final === final && live.sent) return;
    live.html = html;
    live.final = final;
    live.sent = false;
    this.flush(live);
  }

  setTheme(css: string, styles?: string) {
    if (css === this.theme && styles === this.styles) return;
    this.theme = css;
    this.styles = styles;
    if (this.current?.loaded) this.send(this.current, { type: "theme", css, styles });
  }

  /** Files changed on the disk: the pictures whose page changed are taken again, a moment later. */
  filesChanged() {
    this.picturesLater(PICTURES_DELAY_MS);
  }

  /** A page's last picture, for the zoom between the page and the grid (Q133). */
  picture(route: string): string | undefined {
    return this.pictures.get(route)?.url;
  }

  /** For checks: the live view, and the page it shows. */
  get liveView() {
    return this.current && { view: this.current.view, route: this.current.route, shown: this.current.shown };
  }

  clear() {
    clearTimeout(this.timer);
    this.cells.clear();
    this.pictures.clear();
    this.writing = null;
    this.leaving = null;
    this.dropLive();
  }

  close() {
    this.clear();
    this.camera.close();
  }

  /** The live view over the cell of the page being written, while that cell is on screen. */
  private place(resized: boolean) {
    const route = this.leaving ?? this.writing;
    const cell = route === null ? undefined : this.cells.get(route);
    if (!cell) return this.dropLive();
    let live = this.current;
    if (!live) {
      live = this.createLive(cell.route);
      this.current = live;
    } else if (live.route !== cell.route) this.moveLive(live, cell.route);
    const scaled = live.view.getBounds().width !== cell.rect.width;
    live.view.setBounds(cell.rect);
    if (scaled || resized) this.emulate(live);
    const clip = Math.round((cell.clipTop ?? 0) * (this.screen.width / cell.rect.width));
    if (clip !== live.clip) {
      live.clip = clip;
      if (live.loaded) this.send(live, { type: "clip", top: clip });
    }
    // Shown once it has this page's rendering.
    this.show(live, cell.visible && live.loaded && live.sent);
  }

  private createLive(route: string): Live {
    const view = new WebContentsView({
      webPreferences: {
        preload: this.o.preload,
        contextIsolation: true,
        sandbox: true,
        partition: "preview",
        backgroundThrottling: !this.o.background,
        additionalArguments: ["--upstart-thumbnail"],
      },
    });
    view.setBackgroundColor("#ffffff");
    view.setBorderRadius(6);
    view.setVisible(false);
    this.win.contentView.addChildView(view);
    const live: Live = { view, route, ready: false, loaded: false, shown: false, clip: 0, sent: false };
    const contents = view.webContents;
    // A thumbnail never goes anywhere: it is a picture of its page.
    contents.on("will-navigate", (details) => details.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("dom-ready", () => {
      live.ready = true;
      this.emulate(live);
    });
    contents.ipc.on("preview:event", (event, message: FromPreview) => {
      if (event.sender !== contents || this.current !== live) return;
      if (message.type === "loaded") {
        live.loaded = true;
        live.sent = false;
        if (this.theme) this.send(live, { type: "theme", css: this.theme, styles: this.styles });
        if (live.clip) this.send(live, { type: "clip", top: live.clip });
        this.place(false);
        this.o.wantsRendering();
      }
      if (message.type === "thumb") this.o.onAction(live.route, message.action);
    });
    this.load(live);
    return live;
  }

  /**
   * The live view moves to another page without loading it again, as the
   * preview follows the agent (ADR 0009): the next page's rendering is morphed
   * in. It is hidden until then, so the cell never shows the other page.
   */
  private moveLive(live: Live, route: string) {
    live.route = route;
    live.html = undefined;
    live.sent = false;
    this.show(live, false);
    if (live.loaded) {
      live.view.webContents
        .executeJavaScript(`history.replaceState(null, "", ${JSON.stringify(route)})`)
        .catch(() => {});
      this.o.wantsRendering();
    }
  }

  private load(live: Live) {
    void live.view.webContents.loadURL(new URL(live.route, this.o.origin()).toString()).catch(() => {});
  }

  private dropLive() {
    const live = this.current;
    if (!live) return;
    this.current = undefined;
    // On quitting, the window may be gone already.
    if (!this.win.isDestroyed()) this.win.contentView.removeChildView(live.view);
    if (!live.view.webContents.isDestroyed()) live.view.webContents.close();
  }

  private show(live: Live, shown: boolean) {
    if (shown === live.shown) return;
    live.shown = shown;
    live.view.setVisible(shown);
    // Showing a view again drops its emulated screen.
    if (shown) this.emulate(live);
  }

  private flush(live: Live) {
    if (!live.loaded || live.sent || live.html === undefined) return;
    live.sent = true;
    this.send(live, { type: "render", html: live.html, final: live.final ?? false });
    // A page it has just moved to shows once its rendering is in.
    if (!live.shown && this.cells.get(live.route)?.visible) this.show(live, true);
  }

  private send(live: Live, message: ToPreview) {
    if (!live.view.webContents.isDestroyed()) live.view.webContents.send("preview:message", message);
  }

  /** The page laid out on the screen's width and drawn at the thumbnail's (Q129). */
  private emulate(live: Live) {
    const contents = live.view.webContents;
    if (contents.isDestroyed() || !live.ready) return;
    const s = this.screen;
    contents.enableDeviceEmulation({
      screenPosition: s.mobile ? "mobile" : "desktop",
      screenSize: { width: s.width, height: s.height },
      viewPosition: { x: 0, y: 0 },
      deviceScaleFactor: 0,
      viewSize: { width: s.width, height: s.height },
      scale: Math.round((live.view.getBounds().width / s.width) * 1000) / 1000,
    });
  }

  private picturesLater(delay: number) {
    if (this.cells.size === 0) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.takePictures(), delay);
  }

  /** Takes, one at a time, the pictures of the pages shown whose rendering changed. */
  private async takePictures() {
    const leaving = this.leaving;
    const routes = [...this.cells.keys()].sort((a, b) => Number(b === leaving) - Number(a === leaving));
    for (const route of routes) {
      // A page half written is not pictured: it is live, or gets its picture when it is finished.
      if (route === this.writing) continue;
      const key = this.o.keyOf(route);
      const full = key === undefined ? undefined : `${key}:${this.screen.width}x${this.screen.height}`;
      const url =
        full === undefined || this.pictures.get(route)?.key === full
          ? undefined
          : await this.camera.take(route, this.screen).catch(() => undefined);
      // The grid went away meanwhile: the next opening takes it.
      if (url && full && this.cells.has(route)) {
        this.pictures.set(route, { key: full, url });
        this.o.onPicture(route, url);
      }
      // The page just written has its picture: the live view moves on.
      if (route === this.leaving) {
        this.leaving = null;
        this.place(false);
      }
    }
    if (this.leaving !== null && !this.cells.has(this.leaving)) {
      this.leaving = null;
      this.place(false);
    }
  }
}

/** A key for what a picture shows. */
export function pictureKey(html: string, theme: string): string {
  return createHash("sha256").update(theme).update("\0").update(html).digest("hex").slice(0, 16);
}

/**
 * A window that is never shown, which loads a page from the preview's server
 * and paints it, as the gallery's thumbnails do (main/gallery/thumbnails.ts).
 */
class Camera {
  private win: BrowserWindow | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly origin: () => string) {}

  take(route: string, screen: ThumbnailScreen): Promise<string> {
    const next = this.queue.then(() => this.draw(route, screen));
    this.queue = next.catch(() => {});
    return next;
  }

  close() {
    this.win?.destroy();
    this.win = undefined;
  }

  private async draw(route: string, screen: ThumbnailScreen): Promise<string> {
    const win = this.window();
    win.setContentSize(screen.width, screen.height);
    await win.webContents.loadURL(new URL(route, this.origin()).toString());
    // A picture shows the page, not its scrollbar.
    await win.webContents.insertCSS("html { scrollbar-width: none !important; }");
    await win.webContents.executeJavaScript(PAGE_READY);
    const image = await new Promise<NativeImage>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The page was not drawn in time.")), 5000);
      let frames = 0;
      const paint = (_event: unknown, _dirty: Electron.Rectangle, frame: NativeImage) => {
        const size = frame.getSize();
        // The first frames may still be empty, or at the old size.
        if (
          ++frames < 2 ||
          frame.isEmpty() ||
          size.height === 0 ||
          Math.abs(size.width / size.height - screen.width / screen.height) > 0.02
        )
          return win.webContents.invalidate();
        clearTimeout(timer);
        win.webContents.off("paint", paint);
        resolve(frame);
      };
      win.webContents.on("paint", paint);
      win.webContents.invalidate();
    });
    return image.resize({ width: Math.min(PICTURE_WIDTH, image.getSize().width), quality: "best" }).toDataURL();
  }

  private window(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    this.win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      useContentSize: true,
      webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, partition: "preview" },
    });
    // Nothing in a page may open or leave anything.
    this.win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.win.webContents.on("will-navigate", (event) => event.preventDefault());
    this.win.webContents.setFrameRate(30);
    this.win.webContents.setAudioMuted(true);
    return this.win;
  }
}

/** In a page: resolves once Tailwind, which compiles in the page, has styled it, and it has painted. */
const PAGE_READY = `new Promise((done) => {
  const started = Date.now();
  const ready = () => [...document.querySelectorAll("style")].some((s) => !s.hasAttribute("data-up-runtime") && s.textContent.length > 0);
  const wait = () => ready() || Date.now() - started > 3000
    ? requestAnimationFrame(() => requestAnimationFrame(() => done(true)))
    : setTimeout(wait, 30);
  wait();
})`;
