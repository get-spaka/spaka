// A template shown large in the start screen (Q249): real and moving, as
// visitors will see it, rendered by a runtime of its own from the template's
// folder and served on a server of its own, so that its links go from page to
// page. A native view laid over the panel, like the preview (ADR 0008); it
// never writes anything, not even a form's answer.
import { previewHead, Runtime } from "@upstart/runtime";
import { diskSource } from "@upstart/runtime/node";
import { type BrowserWindow, shell, WebContentsView } from "electron";
import type { Rect, TemplateViewState } from "../../shared/ipc";
import { en as t } from "../../shared/strings/en";
import { PreviewServer, VENDOR_BASE } from "../preview/server";

/** Visitor mode, as the preview's own script sets it: the site's scripts start, its animations play (Q242). */
const MOVING =
  "document.documentElement.setAttribute('data-up-moving', ''); window.__upStart && window.__upStart.go(); true";

type Shown = { id: string; root: string; runtime: Runtime };

export class TemplateViewer {
  readonly view: WebContentsView;
  private readonly server: PreviewServer;
  private shown: Shown | undefined;
  private bounds: Rect | null = null;
  private route: string | null = null;
  private title = "";
  private loading = false;

  constructor(
    win: BrowserWindow,
    private readonly options: {
      background: boolean;
      onState: (state: TemplateViewState) => void;
      font?: (path: string) => string | undefined;
    },
  ) {
    this.server = new PreviewServer(
      () => this.shown && { root: this.shown.root, runtime: this.shown.runtime },
      undefined,
      options.font,
    );
    this.view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        partition: "template-view",
        backgroundThrottling: !options.background,
      },
    });
    this.view.setVisible(false);
    this.view.setBorderRadius(8);
    win.contentView.addChildView(this.view);
    this.guard();
  }

  async start() {
    await this.server.start();
    // A view that never loaded anything has no document; tools that drive the app wait for one.
    await this.view.webContents.loadURL("about:blank").catch(() => {});
  }

  get origin() {
    return this.server.origin;
  }

  /** Shows the template in `root` at `route`; the same template only goes to the page. */
  async show(id: string, root: string, route = "/") {
    if (this.shown?.id !== id) {
      const runtime: Runtime = new Runtime(diskSource(root), {
        standIns: true,
        head: () =>
          previewHead({
            vendorBase: VENDOR_BASE,
            theme: runtime.theme(),
            assets: runtime.assets(),
            styles: runtime.styles(),
          }),
      });
      this.shown = { id, root, runtime };
      this.title = "";
    }
    this.layout();
    this.loading = true;
    this.emit();
    await this.view.webContents.loadURL(new URL(route, this.origin).toString()).catch(() => {});
  }

  close() {
    this.shown = undefined;
    this.route = null;
    this.title = "";
    this.layout();
    this.emit();
    void this.view.webContents.loadURL("about:blank").catch(() => {});
  }

  setBounds(rect: Rect | null) {
    this.bounds = rect;
    this.layout();
  }

  state(): TemplateViewState {
    const shown = this.shown;
    return {
      id: shown?.id ?? null,
      route: shown ? this.route : null,
      title: this.title,
      pages: shown ? pagesOf(shown.runtime) : [],
      loading: this.loading,
    };
  }

  private layout() {
    if (this.bounds) this.view.setBounds(this.bounds);
    this.view.setVisible(!!this.bounds && !!this.shown);
  }

  private emit() {
    this.options.onState(this.state());
  }

  private guard() {
    const contents = this.view.webContents;
    contents.setWindowOpenHandler(({ url }) => {
      openOutside(url);
      return { action: "deny" };
    });
    contents.on("will-navigate", (details) => {
      if (!details.url.startsWith(`${this.origin}/`)) {
        details.preventDefault();
        openOutside(details.url);
      }
    });
    const navigated = (url: string) => {
      if (!url.startsWith(this.origin)) return;
      this.route = new URL(url).pathname;
      this.emit();
    };
    contents.on("did-navigate", (_event, url) => navigated(url));
    contents.on("did-navigate-in-page", (_event, url) => navigated(url));
    contents.on("dom-ready", () => {
      if (this.shown) void contents.executeJavaScript(MOVING).catch(() => {});
    });
    contents.on("did-stop-loading", () => {
      this.loading = false;
      this.title = contents.getTitle();
      this.emit();
    });
    contents.on("page-title-updated", (_event, title) => {
      this.title = title;
      this.emit();
    });
  }
}

/** A link out of the template opens in the maker's browser, as in the preview. */
function openOutside(url: string) {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
}

/** The pages to go to: each page, and the first record's page of each page per record. */
export function pagesOf(runtime: Runtime): { route: string; name: string }[] {
  const firsts = new Set<string>();
  const pages: { route: string; name: string }[] = [];
  for (const r of runtime.routes()) {
    if (r.generated) continue;
    if (r.record) {
      if (firsts.has(r.file)) continue;
      firsts.add(r.file);
    }
    pages.push({ route: r.route, name: r.record && r.title ? r.title : nameOf(r.route) });
  }
  return pages;
}

function nameOf(route: string): string {
  if (route === "/") return t.start.home;
  const last = route.split("/").filter(Boolean).at(-1) ?? route;
  const words = last.replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
