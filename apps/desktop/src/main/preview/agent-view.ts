// The agent's own view of the website (Q314–Q324): where it looks at a page,
// hidden from the maker, whose preview no longer moves when the agent looks.
// A window rendered offscreen, never shown: it draws 60 frames a second
// whether or not the maker's window is on screen, which a view parked in
// that window does not (spikes/looks/REPORT.md). It loads the preview's
// server with the preview's own script in visitor mode, takes the
// renderings morphed in place as the preview does (ADR 0009), and keeps
// its page, a menu opened or the scroll, until the end of the agent's turn
// (Q324). It follows links within the website (Q323), opens nothing else,
// and sends no form: any request other than a GET is refused (Q322).
import { BrowserWindow, session } from "electron";
import type { FromPreview, ToPreview } from "../../shared/ipc";
import { SCREENS, type ScreenName, type StepView } from "./look-steps";

/** The view's own session: what it refuses never touches the maker's preview. */
const PARTITION = "agent-look";
/** Unused this long, the view is closed: it holds 230–320 MB while open. */
const IDLE_MS = 5 * 60_000;
/** The longest wait for the page's load, then for it to settle. */
const LOAD_MS = 10_000;

export type AgentViewOptions = {
  origin: () => string;
  preload: string;
  /** The view loaded a page: it needs a rendering of what changed meanwhile. */
  wantsRendering: () => void;
  /** The site's scripts as they are now, as a short key; a change loads the page again (ADR 0011). */
  scriptsKey: () => string | undefined;
};

export type ViewError = { message: string; source?: string; at: number };

export class AgentView {
  private win: BrowserWindow | undefined;
  private route: string | null = null;
  private screen: ScreenName = "desktop";
  private loaded = false;
  /** The turn ended: the next look starts from a fresh page (Q324). */
  private stale = true;
  private html: string | undefined;
  private final = false;
  private sent = true;
  private theme: { css: string; styles?: string } | undefined;
  private loadedScripts: string | undefined;
  /** A page on its way, from a look or a link followed, until the preview's script says it loaded. */
  private loading: Promise<void> | undefined;
  private onLoaded: (() => void) | undefined;
  /** The last link to another website the page tried to follow; it was not. */
  private refusedLink: string | undefined;
  /** The page a link followed led to, since the last step. */
  private wentTo: string | undefined;
  private idle: NodeJS.Timeout | undefined;
  /** The page's errors since it was loaded, the view's own, apart from the maker's preview. */
  readonly errors: ViewError[] = [];
  /** Requests the page tried that were refused: a form sent, a beacon. */
  private readonly refused: { method: string; url: string }[] = [];

  constructor(private readonly o: AgentViewOptions) {}

  /** The page the view shows, while it keeps its state; null once closed or at a turn's end. */
  get current(): string | null {
    return this.win && this.loaded && !this.stale ? this.route : null;
  }

  get currentScreen(): ScreenName {
    return this.screen;
  }

  /** For checks: the view's contents, while open. */
  get contents(): Electron.WebContents | undefined {
    return this.win && !this.win.isDestroyed() ? this.win.webContents : undefined;
  }

  /**
   * Shows the page at `route` on `screen` and waits until it has settled. The
   * page and its state are kept from the last look of this turn when it is
   * the same route; another route, `fresh`, or a new turn loads it anew.
   */
  async show(route: string, screen: ScreenName, fresh = false): Promise<void> {
    this.keepOpen();
    const win = this.window();
    if (screen !== this.screen) {
      this.screen = screen;
      await this.emulate();
    }
    if (fresh || this.stale || !this.loaded || route !== this.route) await this.load(win, route);
    else if (this.html !== undefined && !this.sent) this.flush();
    this.wentTo = undefined;
    this.refusedLink = undefined;
    await this.settle();
  }

  /** A picture of the screen, as the page shows it now. */
  async capture(): Promise<Buffer> {
    const tools = this.window().webContents.debugger;
    const { data } = (await tools.sendCommand("Page.captureScreenshot", { format: "png" })) as { data: string };
    return Buffer.from(data, "base64");
  }

  /** Runs code in the page's own world and gives back its value. */
  // biome-ignore lint/suspicious/noExplicitAny: what the page answers
  run(code: string): Promise<any> {
    return this.window().webContents.executeJavaScript(code, true);
  }

  /** The requests refused since the last call: a form sent, a beacon. */
  takeRefused(): { method: string; url: string }[] {
    return this.refused.splice(0);
  }

  /** The DevTools protocol on the page, for the agent's steps. */
  // biome-ignore lint/suspicious/noExplicitAny: DevTools' answers
  send(method: string, params: object = {}): Promise<any> {
    return this.window().webContents.debugger.sendCommand(method, params);
  }

  /** Waits until the page has settled: the scroll still, no animation finishing, no style changing, at most 2 s. */
  async settle(): Promise<void> {
    await this.run(SETTLE).catch(() => {});
  }

  /** A new rendering of a page, morphed in if the view shows it (ADR 0009, Q324). */
  render(route: string, html: string, final: boolean) {
    if (this.current !== route) return;
    if (this.html === html && this.final === final && this.sent) return;
    this.html = html;
    this.final = final;
    this.sent = false;
    this.flush();
  }

  setTheme(css: string, styles?: string) {
    if (this.theme?.css === css && this.theme.styles === styles) return;
    this.theme = { css, styles };
    if (this.current !== null) this.message({ type: "theme", css, styles });
  }

  /** The site's scripts changed once complete: the page loads again, to run them anew (ADR 0011). */
  scriptsChanged(key: string) {
    const win = this.win;
    if (!win || this.current === null || this.loadedScripts === undefined || key === this.loadedScripts) return;
    void this.load(win, this.route!);
  }

  /** The agent's turn is over: its next look starts from a fresh page (Q324). */
  endTurn() {
    this.stale = true;
  }

  close() {
    clearTimeout(this.idle);
    this.idle = undefined;
    const win = this.win;
    this.win = undefined;
    this.loaded = false;
    this.stale = true;
    this.route = null;
    this.html = undefined;
    if (win && !win.isDestroyed()) win.destroy();
  }

  private keepOpen() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.close(), IDLE_MS);
  }

  private async load(win: BrowserWindow, route: string) {
    this.route = route;
    this.loaded = false;
    this.stale = false;
    this.html = undefined;
    this.sent = true;
    const loaded = this.startLoading();
    await win.webContents.loadURL(new URL(route, this.o.origin()).toString()).catch(() => {});
    await Promise.race([loaded, wait(LOAD_MS)]);
    await this.started();
  }

  private startLoading(): Promise<void> {
    this.loading ??= new Promise<void>((resolve) => {
      this.onLoaded = () => {
        this.loading = undefined;
        this.onLoaded = undefined;
        resolve();
      };
    });
    return this.loading;
  }

  /** The site's modules started (visitor mode), Tailwind styled the page, the fonts are in. */
  private async started() {
    await this.run(STARTED).catch(() => {});
  }

  /** What the steps need of the view (look-steps.ts). */
  steps(): StepView {
    return {
      run: (code) => this.run(code),
      send: (method, params) => this.send(method, params),
      settle: () => this.settle(),
      screen: () => this.screen,
      afterAction: async () => {
        // A link followed starts its navigation within a moment of the click.
        await wait(150);
        if (this.loading) await Promise.race([this.loading, wait(LOAD_MS)]);
        const { refusedLink, wentTo } = this;
        this.refusedLink = undefined;
        this.wentTo = undefined;
        if (wentTo) await this.started();
        return wentTo ? { went: wentTo } : { refusedLink };
      },
    };
  }

  private flush() {
    if (!this.loaded || this.sent || this.html === undefined) return;
    this.sent = true;
    this.message({ type: "render", html: this.html, final: this.final });
  }

  private message(message: ToPreview) {
    const contents = this.contents;
    if (contents) contents.send("preview:message", message);
  }

  /** The page laid out at the screen's size, as DevTools does it, and told it has the focus. */
  private async emulate() {
    const contents = this.contents;
    if (!contents) return;
    const s = SCREENS[this.screen];
    const tools = contents.debugger;
    try {
      if (!tools.isAttached()) tools.attach("1.3");
      await tools.sendCommand("Emulation.setDeviceMetricsOverride", {
        width: s.width,
        height: s.height,
        deviceScaleFactor: s.scale,
        mobile: s.mobile,
        screenWidth: s.width,
        screenHeight: s.height,
      });
      // Tab and :focus-visible behave as in a window with the keyboard, which this one never takes.
      await tools.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
    } catch {
      // The page is going away; the next document is emulated when it starts.
    }
  }

  private window(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const win = new BrowserWindow({
      show: false,
      width: SCREENS.desktop.width,
      height: SCREENS.desktop.height,
      useContentSize: true,
      enableLargerThanScreen: true,
      webPreferences: {
        offscreen: true,
        preload: this.o.preload,
        sandbox: true,
        contextIsolation: true,
        partition: PARTITION,
        backgroundThrottling: false,
        additionalArguments: ["--upstart-agent"],
      },
    });
    this.win = win;
    const contents = win.webContents;
    contents.setFrameRate(60);
    contents.setAudioMuted(true);
    guardSession();
    // A link within the website is followed (Q323); nothing else opens.
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (details) => {
      if (details.url.startsWith(`${this.o.origin()}/`)) return;
      details.preventDefault();
      this.refusedLink = details.url;
    });
    contents.on("did-navigate", (_event, url) => {
      if (!url.startsWith(this.o.origin())) return;
      this.route = new URL(url).pathname;
      this.wentTo = this.route;
    });
    contents.on("did-navigate-in-page", (_event, url) => {
      if (url.startsWith(this.o.origin())) this.route = new URL(url).pathname;
    });
    // A new document may come with a new renderer, which starts without the screen's size.
    contents.on("did-start-navigation", (details) => {
      // A link to another website starts here too, before will-navigate refuses it.
      if (!details.isMainFrame || details.isSameDocument || !details.url.startsWith(`${this.o.origin()}/`)) return;
      this.loaded = false;
      this.html = undefined;
      this.sent = true;
      this.errors.length = 0;
      void this.startLoading();
      void this.emulate();
    });
    // A form sent by the page itself (not by htmx) is a navigation the session refused: the page comes back.
    contents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code === -20 && this.route !== null) void this.load(win, this.route);
    });
    contents.on("dom-ready", () => void this.emulate());
    contents.on("console-message", (details) => {
      if (details.level !== "error") return;
      const source = details.sourceId ? `${details.sourceId}:${details.lineNumber}` : undefined;
      this.errors.push({ message: details.message, source, at: Date.now() });
      if (this.errors.length > 50) this.errors.shift();
    });
    contents.on("render-process-gone", () => {
      this.loaded = false;
      this.stale = true;
    });
    refusals.set(contents.id, (method, url) => {
      this.refused.push({ method, url });
      if (this.refused.length > 20) this.refused.shift();
    });
    contents.once("destroyed", () => refusals.delete(contents.id));
    contents.ipc.on("preview:event", (event, message: FromPreview) => {
      if (event.sender !== contents || message.type !== "loaded") return;
      this.loaded = true;
      this.loadedScripts = this.o.scriptsKey();
      if (this.theme) this.message({ type: "theme", css: this.theme.css, styles: this.theme.styles });
      // Visitor mode: the page moves, its modules start (Q253).
      this.message({ type: "editor", mode: "visitor", paused: false });
      this.onLoaded?.();
      this.onLoaded = undefined;
      // Anything that changed while the page was loading.
      this.o.wantsRendering();
    });
    return win;
  }
}

/** The views' refused requests, by their contents' id. */
const refusals = new Map<number, (method: string, url: string) => void>();
let guarded = false;

/** The view's session sends nothing but GETs, and asks for no permission. */
function guardSession() {
  if (guarded) return;
  guarded = true;
  const look = session.fromPartition(PARTITION);
  look.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  look.webRequest.onBeforeRequest((details, callback) => {
    const sends = details.method !== "GET" && details.method !== "HEAD" && details.method !== "OPTIONS";
    if (sends && details.webContentsId !== undefined)
      refusals.get(details.webContentsId)?.(details.method, details.url);
    callback({ cancel: sends });
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * In the page: resolves once the site's modules have started, Tailwind (which
 * compiles in the page) has styled it and the fonts are in, at most 5 s.
 */
const STARTED = `new Promise((done) => {
  const started = Date.now();
  const styled = () => [...document.querySelectorAll("style")].some((s) => !s.hasAttribute("data-up-runtime")
    && !s.hasAttribute("data-up-page") && s.id !== "up-scroll" && s.textContent.length > 0);
  const ready = () => (!window.__upStart || window.__upStart.started) && styled();
  const check = () => ready() || Date.now() - started > 5000
    ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1000))]).then(() => done(true))
    : setTimeout(check, 30);
  check();
})`;

/**
 * In the page: resolves once it has settled, at most 2 s (spikes/looks): two
 * frames, the scroll still for 200 ms, no finite animation running (those
 * the scroll drives aside), and no style or class changed for 150 ms, which
 * catches the animations Motion runs in JavaScript. Endless animations draw
 * on canvases or change no attribute, so they never hold it back.
 */
export const SETTLE = `new Promise((done) => {
  const start = performance.now();
  let lastY = scrollY, lastX = scrollX, still = start, quiet = start, frames = 0;
  const mo = new MutationObserver(() => { quiet = performance.now(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"], subtree: true });
  const finite = () => document.getAnimations().some((a) => a.playState === "running"
    && (!a.timeline || a.timeline instanceof DocumentTimeline)
    && Number.isFinite(a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().endTime : Infinity));
  const end = (settled) => { mo.disconnect(); clearTimeout(fallback); done(settled); };
  const fallback = setTimeout(() => end(false), 2600);
  const tick = () => {
    const now = performance.now();
    frames++;
    if (scrollY !== lastY || scrollX !== lastX) { lastY = scrollY; lastX = scrollX; still = now; }
    if (frames >= 2 && now - still >= 200 && now - quiet >= 150 && !finite()) return end(true);
    if (now - start > 2000) return end(false);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})`;
