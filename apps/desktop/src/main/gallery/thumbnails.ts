// The gallery's thumbnails (Q92): each block drawn with the open project's
// theme, in a window that is never shown, and kept on disk by a hash of the
// theme and the block, so that a theme seen before costs nothing.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BrowserWindow } from "electron";

const WIDTH = 1024;
const SHOWN_WIDTH = 480;
const MAX_HEIGHT = 1100;

export class Thumbnails {
  private win: BrowserWindow | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly dir: string,
    /** Where the preview's server shows a block alone: `${origin}/__up/block/<id>`. */
    private readonly origin: () => string,
  ) {}

  /** A block's thumbnail as a PNG data URL, drawn now or from the disk. */
  get(id: string, source: string, theme: string): Promise<string> {
    const key = createHash("sha256").update(theme).update("\0").update(source).digest("hex").slice(0, 32);
    const file = join(this.dir, `${key}.png`);
    if (existsSync(file)) return Promise.resolve(dataUrl(readFileSync(file)));
    // One at a time: a single hidden window draws them all.
    const next = this.queue.then(async () => {
      if (existsSync(file)) return dataUrl(readFileSync(file));
      const png = await this.draw(id);
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(file, png);
      return dataUrl(png);
    });
    this.queue = next.catch(() => {});
    return next;
  }

  close() {
    this.win?.destroy();
    this.win = undefined;
  }

  private async draw(id: string): Promise<Buffer> {
    const win = this.window();
    win.setContentSize(WIDTH, 800);
    await win.webContents.loadURL(`${this.origin()}/__up/block/${id}`);
    // Tailwind compiles in the page: wait for its stylesheet and two frames.
    const height = (await win.webContents.executeJavaScript(`new Promise((done) => {
      const started = Date.now();
      const ready = () => [...document.querySelectorAll("style")].some((s) => !s.hasAttribute("data-up-runtime") && s.textContent.length > 0);
      const wait = () => ready() || Date.now() - started > 3000
        ? requestAnimationFrame(() => requestAnimationFrame(() => done((document.body.firstElementChild ?? document.body).getBoundingClientRect().height)))
        : setTimeout(wait, 30);
      wait();
    })`)) as number;
    const h = Math.max(40, Math.min(MAX_HEIGHT, Math.ceil(height)));
    win.setContentSize(WIDTH, h);
    // An offscreen window gives its frames as they are painted (capturePage does not work on it).
    const image = await new Promise<Electron.NativeImage>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The block was not drawn in time.")), 5000);
      let frames = 0;
      const paint = (_event: unknown, _dirty: Electron.Rectangle, frame: Electron.NativeImage) => {
        const size = frame.getSize();
        // The first frames may still be at the old size.
        if (++frames < 2 || size.height < (h * size.width) / WIDTH - 2) return win.webContents.invalidate();
        clearTimeout(timer);
        win.webContents.off("paint", paint);
        resolve(frame);
      };
      win.webContents.on("paint", paint);
      win.webContents.invalidate();
    });
    // The window may not shrink to a short block: only the block is kept, at the frame's scale.
    const size = image.getSize();
    const scale = size.width / WIDTH;
    const block = image.crop({ x: 0, y: 0, width: size.width, height: Math.min(size.height, Math.round(h * scale)) });
    return block.resize({ width: SHOWN_WIDTH, quality: "best" }).toPNG();
  }

  private window(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    this.win = new BrowserWindow({
      show: false,
      width: WIDTH,
      height: 800,
      useContentSize: true,
      webPreferences: {
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        javascript: true,
        partition: "preview",
      },
    });
    // Nothing in a block may open or leave anything.
    this.win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.win.webContents.on("will-navigate", (event) => event.preventDefault());
    this.win.webContents.setFrameRate(30);
    return this.win;
  }
}

function dataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}
