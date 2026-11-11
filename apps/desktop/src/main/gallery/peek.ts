// A gallery block shown large while the pointer rests on its thumbnail (Q109):
// rendered for real with the project's theme, at about the preview's width, in
// a view of its own floating over the top of the preview. It is not part of
// the page; nothing in it can be clicked through to the site.
import { type BrowserWindow, WebContentsView } from "electron";
import type { Rect } from "../../shared/ipc";
import { BLOCK_HEIGHT } from "./thumbnails";

const MARGIN = 16;

export class BlockPeek {
  private view: WebContentsView | undefined;
  private area: Rect | null = null;
  /** Each request supersedes the ones before it. */
  private seq = 0;
  /** The block shown, while it is. */
  shown: string | undefined;

  constructor(
    private readonly win: BrowserWindow,
    private readonly origin: () => string,
  ) {}

  /** Where the preview is; none while it is hidden. */
  setArea(area: Rect | null) {
    this.area = area;
    if (!area) this.hide();
  }

  async show(id: string) {
    const area = this.area;
    if (!area) return;
    const n = ++this.seq;
    const view = this.ensure();
    const width = Math.max(240, area.width - 2 * MARGIN);
    const most = Math.max(120, area.height - 2 * MARGIN);
    view.setBounds({ x: area.x + MARGIN, y: area.y + MARGIN, width, height: Math.min(most, 480) });
    await view.webContents.loadURL(`${this.origin()}/__up/block/${encodeURIComponent(id)}`).catch(() => {});
    if (n !== this.seq) return;
    const height = (await view.webContents.executeJavaScript(BLOCK_HEIGHT).catch(() => 0)) as number;
    if (n !== this.seq || !this.area) return;
    view.setBounds({
      x: area.x + MARGIN,
      y: area.y + MARGIN,
      width,
      height: Math.min(most, Math.max(60, Math.ceil(height))),
    });
    // Above the preview, which may have been added again since.
    this.win.contentView.addChildView(view);
    view.setVisible(true);
    this.shown = id;
  }

  hide() {
    this.seq++;
    this.shown = undefined;
    this.view?.setVisible(false);
  }

  close() {
    this.hide();
    this.view?.webContents.close();
    this.view = undefined;
  }

  private ensure(): WebContentsView {
    if (this.view) return this.view;
    const view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true, partition: "preview" },
    });
    view.setVisible(false);
    view.setBorderRadius(12);
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", (event) => event.preventDefault());
    // A thin edge, so that a block with the page's own background stands apart from the site under it.
    view.webContents.on("dom-ready", () => {
      void view.webContents
        .insertCSS("html { outline: 1px solid rgb(0 0 0 / 0.18); outline-offset: -1px; overflow: hidden; }")
        .catch(() => {});
    });
    this.win.contentView.addChildView(view);
    this.view = view;
    return view;
  }
}
