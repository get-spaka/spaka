// A gallery block shown large while the pointer rests on its thumbnail (Q109):
// rendered for real with the project's theme, at about the preview's width, in
// a view of its own laid over the preview's column. The site under it is
// dimmed by a dark backdrop, and the block stands on it with a shadow,
// centered; a block taller than the column is scaled down to fit it. It is
// not part of the page; nothing in it can be clicked through to the site.
import { type BrowserWindow, WebContentsView } from "electron";
import type { Rect } from "../../shared/ipc";

const MARGIN = 24;

/** The block's page made a card on a backdrop, the block at the given width; answers its height. */
const STAGE = (width: number) => `new Promise((done) => {
  // The block in a card of its own: the card has the page's background under the block's, and the
  // block keeps its colors (a style outside Tailwind's layers would win over the block's classes).
  const block = document.body.firstElementChild;
  const card = document.createElement("div");
  card.id = "spaka-peek-card";
  if (block) { block.replaceWith(card); card.append(block); }
  const style = document.createElement("style");
  style.setAttribute("data-spaka-runtime", "");
  style.textContent = \`
    html { background: rgb(9 9 11 / 0.55) !important; height: 100%; overflow: hidden !important; }
    body { background: transparent !important; margin: 0 !important; height: 100%; overflow: hidden !important;
      display: flex !important; align-items: center; justify-content: center; }
    #spaka-peek-card { flex: none; width: ${width}px; border-radius: 12px; overflow: hidden;
      background-color: var(--color-base-100); color: var(--color-base-content);
      box-shadow: 0 24px 64px rgb(0 0 0 / 0.45), 0 0 0 1px rgb(0 0 0 / 0.12); }\`;
  document.head.append(style);
  const started = Date.now();
  // Tailwind compiles in the page: its styles first, then the block's height.
  const styled = () => [...document.querySelectorAll("style")].some((s) => !s.hasAttribute("data-spaka-runtime") && s.textContent.length > 0);
  const wait = () => styled() || Date.now() - started > 3000
    ? done(card.getBoundingClientRect().height)
    : setTimeout(wait, 10);
  wait();
})`;

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

  /** Where the preview's column is; none while it is hidden. */
  setArea(area: Rect | null) {
    this.area = area;
    if (!area) this.hide();
  }

  async show(id: string) {
    const area = this.area;
    if (!area) return;
    const n = ++this.seq;
    const view = this.ensure();
    const contents = view.webContents;
    view.setBounds(area);
    contents.setZoomFactor(1);
    await contents.loadURL(`${this.origin()}/__spaka/block/${encodeURIComponent(id)}`).catch(() => {});
    if (n !== this.seq) return;
    const width = Math.max(240, area.width - 2 * MARGIN);
    const height = (await contents.executeJavaScript(STAGE(width)).catch(() => 0)) as number;
    if (n !== this.seq || !this.area) return;
    // A block taller than the column, scaled down to fit it whole.
    const room = area.height - 2 * MARGIN;
    contents.setZoomFactor(height > room ? Math.max(0.2, room / height) : 1);
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
    // A session of its own: a zoom is kept per site in a session, and the preview's must stay as it is.
    const view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true, partition: "peek" },
    });
    view.setVisible(false);
    view.setBackgroundColor("#00000000");
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", (event) => event.preventDefault());
    this.win.contentView.addChildView(view);
    this.view = view;
    return view;
  }
}
