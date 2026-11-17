import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";

// A site that styles daisyUI's buttons in its own `@layer components` looks
// the same in the preview and once exported: its rules beat daisyUI's
// components in both, and a utility beats them all (theme, base, daisyui,
// components, utilities).
describe("a site's own button styles", () => {
  let launched: LaunchedApp;
  let server: Server;
  let siteOrigin = "";
  const out = join(runsDir, "cascade");
  // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
  const main = <T>(fn: (upstart: any, arg: any, electron: any) => T, arg?: unknown) =>
    launched.app.evaluate(
      (electron, [source, arg]) =>
        new Function("u", "a", "e", `return (${source})(u, a, e)`)(
          (globalThis as { upstart?: unknown }).upstart,
          arg,
          electron,
        ),
      [fn.toString(), arg] as const,
    ) as Promise<Awaited<T>>;
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
      [channel, args] as const,
    );
  const until = async (read: () => Promise<unknown>, timeout = 15_000) => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const inPreview = (code: string) => main((u, code) => u.preview.view.webContents.executeJavaScript(code), code);
  /** What each button looks like, by id. */
  const READ = `(() => Object.fromEntries([...document.querySelectorAll("[data-check]")].map((b) => {
    const s = getComputedStyle(b);
    return [b.dataset.check, { radius: s.borderTopLeftRadius, padding: s.paddingLeft, size: s.fontSize, weight: s.fontWeight, transform: s.textTransform }];
  })))()`;

  beforeAll(async () => {
    rmSync(out, { recursive: true, force: true });
    server = createServer((req, res) => {
      const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
      let file = join(out, path);
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      if (!file.startsWith(out) || !existsSync(file)) {
        res.writeHead(404).end("not found");
        return;
      }
      const types: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    siteOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    launched = await launchApp();
    await launched.window.getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    await invoke("preview:set-view", "page");
    const path = (await invoke("projects:current")).path as string;
    mkdirSync(join(path, "styles"), { recursive: true });
    writeFileSync(
      join(path, "styles/site.css"),
      `@layer components {
  .btn { border-radius: 0; font-weight: 500; text-transform: uppercase; }
  .btn:not(.btn-sm) { padding-inline: 3rem; font-size: 1.125rem; }
}
`,
    );
    writeFileSync(
      join(path, "pages/buttons.liquid"),
      `<!doctype html>
<html lang="en">
<head><title>Buttons</title></head>
<body>
<a href="#" class="btn btn-primary" data-check="primary">Book</a>
<a href="#" class="btn btn-outline btn-lg" data-check="large">Call</a>
<a href="#" class="btn btn-sm" data-check="small">More</a>
<a href="#" class="btn btn-primary rounded-full px-2" data-check="utilities">Go</a>
</body>
</html>
`,
    );
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
    server?.close();
  });

  test("its @layer components rules beat daisyUI's in the preview and in the export, a utility beats both", async () => {
    await until(() => main((u) => u.preview.runtime.routes().some((r: { route: string }) => r.route === "/buttons")));
    await main((u) => u.preview.navigate("/buttons"));
    await until(() => inPreview("location.pathname === '/buttons' && !!document.querySelector('[data-check]')"));
    // The browser build of Tailwind compiles the site's stylesheet after the page has loaded.
    await until(() =>
      inPreview(`getComputedStyle(document.querySelector('[data-check=primary]')).textTransform === 'uppercase'`),
    );
    const preview = await inPreview(READ);

    await invoke("export:run", out, "static");
    const exported = await main(
      async (_u, [url, read], electron) => {
        const view = new electron.WebContentsView({ webPreferences: { partition: "cascade-check" } });
        await view.webContents.loadURL(url);
        const looks = await view.webContents.executeJavaScript(read);
        view.webContents.close();
        return looks;
      },
      [`${siteOrigin}/buttons/`, READ],
    );

    expect(exported).toEqual(preview);
    expect(preview.primary).toEqual({
      radius: "0px",
      padding: "48px",
      size: "18px",
      weight: "500",
      transform: "uppercase",
    });
    expect(preview.large.padding).toBe("48px");
    // .btn-sm is left to daisyUI: its own padding, the site's corners.
    expect(preview.small.padding).not.toBe("48px");
    expect(preview.small.radius).toBe("0px");
    // Utilities beat the site's components.
    expect(preview.utilities.radius).not.toBe("0px");
    expect(preview.utilities.padding).toBe("8px");
  });
});
