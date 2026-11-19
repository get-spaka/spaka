// The tooltips of the preview's bar (Q329), drawn over the page: the page's
// native view covers whatever the interface draws below the bar, so a tooltip
// there is shown in a small transparent view of its own, above the page's, at
// the place and in the colors the interface gave it.
import { type BrowserWindow, WebContentsView } from "electron";
import type { OverTip } from "../shared/ipc";

/** Room around the tooltip for its shadow. */
const MARGIN = 8;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; background: transparent; overflow: hidden; }
#tip { position: absolute; left: ${MARGIN}px; top: ${MARGIN}px; box-sizing: border-box; display: flex; align-items: center;
  gap: 8px; white-space: nowrap; user-select: none; cursor: default; box-shadow: 0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1);
  animation: in .15s ease-out; }
kbd { font: inherit; letter-spacing: .1em; opacity: .6; }
@keyframes in { from { opacity: 0; } }
</style></head><body><div id="tip"></div><script>
window.show = (tip) => {
  const el = document.getElementById("tip");
  el.replaceChildren();
  Object.assign(el.style, tip.style, { width: tip.rect.width + "px", height: tip.rect.height + "px" });
  const text = document.createElement("span");
  text.textContent = tip.text;
  el.append(text);
  if (tip.keys) {
    const keys = document.createElement("kbd");
    keys.textContent = tip.keys;
    el.append(keys);
  }
  // Played again for each tooltip.
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
};
</script></body></html>`;

export class TipOverlay {
  private view: WebContentsView | undefined;
  private loaded: Promise<unknown> | undefined;
  private seq = 0;
  /** What it shows, for the app's checks. */
  shown: string | undefined;

  constructor(private readonly win: BrowserWindow) {}

  async show(tip: OverTip) {
    const n = ++this.seq;
    const view = this.ensure();
    await this.loaded;
    if (n !== this.seq || this.win.isDestroyed()) return;
    const zoom = this.win.webContents.getZoomFactor();
    view.webContents.setZoomFactor(zoom);
    await view.webContents.executeJavaScript(`show(${JSON.stringify(tip)})`).catch(() => {});
    if (n !== this.seq || this.win.isDestroyed()) return;
    view.setBounds({
      x: Math.round((tip.rect.x - MARGIN) * zoom),
      y: Math.round((tip.rect.y - MARGIN) * zoom),
      width: Math.round((tip.rect.width + 2 * MARGIN) * zoom),
      height: Math.round((tip.rect.height + 2 * MARGIN) * zoom),
    });
    // Above the page and the thumbnails, which may have been added again since.
    this.win.contentView.addChildView(view);
    view.setVisible(true);
    this.shown = tip.text;
  }

  hide() {
    this.seq++;
    this.shown = undefined;
    this.view?.setVisible(false);
  }

  private ensure(): WebContentsView {
    if (this.view) return this.view;
    // A session of its own: a zoom is kept per site in a session.
    const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, partition: "tip" } });
    view.setVisible(false);
    view.setBackgroundColor("#00000000");
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", (event) => event.preventDefault());
    this.win.contentView.addChildView(view);
    this.loaded = view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`).catch(() => {});
    this.view = view;
    return view;
  }
}
