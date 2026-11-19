import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type LaunchedApp, runsDir, SLOW } from "./app.ts";

/**
 * Driving the preview as the maker would, in the background: input events
 * sent to its page, and its editor's drawings read (they are in an open
 * shadow root when the app runs for checks).
 */
export function previewDriver(app: () => LaunchedApp) {
  const invoke = (channel: string, ...args: unknown[]) =>
    app().window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
      [channel, args] as const,
    );
  const until = async (read: () => Promise<unknown>, timeout = 10_000) => {
    timeout *= SLOW;
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout)
        throw new Error(`timed out waiting for: ${read}; the preview shows ${await shown()}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  // biome-ignore lint/suspicious/noExplicitAny: what the page answers
  const page = (code: string): Promise<any> =>
    app().app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, code) => (globalThis as any).upstart.preview.view.webContents.executeJavaScript(code),
      code,
    );
  /** What the preview shows: its address, its title and its first heading. */
  const shown = () =>
    page("JSON.stringify([location.href, document.title, document.querySelector('h1')?.textContent])").catch(
      () => "nothing that answers",
    );
  /** Input events, as the pointer and the keyboard would send them. */
  const input = (events: object[]) =>
    app().app.evaluate(async (_electron, events) => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const contents = (globalThis as any).upstart.preview.view.webContents as Electron.WebContents;
      contents.focus();
      for (const event of events) {
        contents.sendInputEvent(event as Electron.MouseInputEvent);
        await new Promise((r) => setTimeout(r, 15));
      }
    }, events);
  const center = async (selector: string, inShadow = false) => {
    const root = inShadow ? "document.querySelector('upstart-editor').shadowRoot" : "document";
    // An element of the page is scrolled into sight first, as one would before clicking: a small window
    // shows less of the page. The editor's own drawings are where they are drawn.
    const r = await page(`(() => { const el = ${root}.querySelector(${JSON.stringify(selector)});
      ${inShadow ? "" : 'el.scrollIntoView({ block: "nearest", inline: "nearest" });'}
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + Math.min(r.width / 2, 40)), y: Math.round(r.top + r.height / 2) }; })()`);
    return r as { x: number; y: number };
  };
  const click = async (selector: string, inShadow = false, clickCount = 1) => {
    const { x, y } = await center(selector, inShadow);
    const down = (n: number) => [
      { type: "mouseDown", x, y, button: "left", clickCount: n },
      { type: "mouseUp", x, y, button: "left", clickCount: n },
    ];
    await input([{ type: "mouseMove", x, y }, ...down(1), ...(clickCount === 2 ? down(2) : [])]);
  };
  const typeText = (text: string) => input([...text].map((c) => ({ type: "char", keyCode: c })));
  const key = (keyCode: string) =>
    input([
      { type: "keyDown", keyCode },
      { type: "keyUp", keyCode },
    ]);
  const drawn = (selector: string) =>
    page(
      `getComputedStyle(document.querySelector('upstart-editor').shadowRoot.querySelector(${JSON.stringify(selector)})).display !== "none"`,
    );
  /** A picture of the preview with the editor's drawings (the capture for the agent leaves them out). */
  const picture = async (name: string) => {
    // A picture is for people to look at: one that does not come in 10 seconds is not taken.
    const png = await app().app.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      const contents = (globalThis as any).upstart.preview.view.webContents as Electron.WebContents;
      if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
      const shot = contents.debugger.sendCommand("Page.captureScreenshot", { format: "png" });
      const late = new Promise<undefined>((r) => setTimeout(() => r(undefined), 10_000));
      return ((await Promise.race([shot, late])) as { data: string } | undefined)?.data;
    });
    if (png) writeFileSync(join(runsDir, `${name}.png`), Buffer.from(png, "base64"));
    else console.warn(`no picture ${name}: the preview did not give one in 10 seconds`);
  };

  return { invoke, until, page, input, center, click, typeText, key, drawn, picture };
}
