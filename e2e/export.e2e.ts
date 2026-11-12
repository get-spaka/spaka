import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";

// The static export (decisions): the recorded project is exported, the folder
// served by a plain static file server, and its pages look like the preview.
// With a blog written beside it: its record pages and the credits page, no
// datasources, the images in WebP at the widths a screen asks for (Q156).
describe("exporting the website", () => {
  let launched: LaunchedApp;
  let server: Server;
  let siteOrigin = "";
  const out = join(runsDir, "export");
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

  beforeAll(async () => {
    rmSync(out, { recursive: true, force: true });
    // A static file server as a host would run it: a folder's index.html answers for the folder.
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
    await launched.window.getByTestId("conversation").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => launched.window.locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    // The bakery has two pages: the preview went to all of them (Q131); these checks are on one.
    await invoke("preview:set-view", "page");
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
    server?.close();
  });

  test("every page, the stylesheet and the theme are written; nothing of the preview", async () => {
    const result = await invoke("export:run", out, "static");
    expect(result.folder).toBe(out);
    expect(result.pages.sort()).toEqual(["/", "/menu"]);
    for (const file of ["index.html", "menu/index.html", "theme.css", "assets/site.css", "assets/htmx.js"])
      expect(existsSync(join(out, file)), file).toBe(true);
    const home = readFileSync(join(out, "index.html"), "utf8");
    expect(home).toContain("Chez Margot");
    expect(home).not.toMatch(/data-up-src|tailwindcss\/browser|preview/);
    // The classes the pages use are in the compiled stylesheet.
    const css = readFileSync(join(out, "assets/site.css"), "utf8");
    expect(css).toContain(".text-5xl");
    expect(css).toContain(".btn");
    expect(statSync(join(out, "assets/site.css")).size).toBeLessThan(200_000);
  });

  test("an export replaces the previous one; a folder of the maker's is never written over", async () => {
    writeFileSync(join(out, "stale.html"), "old");
    await invoke("export:run", out, "static");
    expect(existsSync(join(out, "stale.html"))).toBe(false);

    const theirs = join(runsDir, "export-theirs");
    rmSync(theirs, { recursive: true, force: true });
    mkdirSync(theirs, { recursive: true });
    writeFileSync(join(theirs, "notes.txt"), "mine");
    const result = await invoke("export:run", theirs, "static");
    expect(result.folder).toBe(join(theirs, `${await projectFolderName()}-site`));
    expect(readFileSync(join(theirs, "notes.txt"), "utf8")).toBe("mine");
    expect(existsSync(join(result.folder, "index.html"))).toBe(true);
    // Back to the first folder, for the next checks.
    await invoke("export:run", out, "static");
  });

  test("the exported page, served as files, looks like the preview", async () => {
    await main((u) => u.preview.navigate("/"));
    await until(() => inPreview("location.pathname === '/' && !!document.querySelector('h1')"));
    await new Promise((r) => setTimeout(r, 800));
    const diff = await main(async (u, origin, electron) => {
      // The served page goes into a view of its own, the preview's size, without
      // the preview's script (which would put the preview's rendering back in).
      const preview = electron.nativeImage.createFromBuffer(await u.preview.capture());
      const view = new electron.WebContentsView({ webPreferences: { partition: "export-check" } });
      u.win.contentView.addChildView(view);
      view.setBounds(u.preview.view.getBounds());
      const contents = view.webContents;
      await contents.loadURL(`${origin}/`);
      await contents.executeJavaScript("document.fonts.ready.then(() => true)");
      await new Promise((r) => setTimeout(r, 500));
      contents.debugger.attach("1.3");
      const { data } = await contents.debugger.sendCommand("Page.captureScreenshot", { format: "png" });
      const exported = electron.nativeImage.createFromBuffer(Buffer.from(data, "base64"));
      const served = {
        url: contents.getURL(),
        marked: await contents.executeJavaScript("document.querySelectorAll('[data-up-src]').length"),
        sheets: await contents.executeJavaScript("[...document.styleSheets].map((s) => s.href)"),
      };
      u.win.contentView.removeChildView(view);
      contents.close();
      const a = preview.toBitmap();
      const b = exported.toBitmap();
      const size = preview.getSize();
      const servedSize = exported.getSize();
      if (a.length !== b.length) return { size, servedSize, served, differing: 1, pngs: [] };
      let differing = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        if (d > 24) differing++;
      }
      return {
        size,
        servedSize,
        served,
        differing: differing / (a.length / 4),
        pngs: [preview.toPNG().toString("base64"), exported.toPNG().toString("base64")],
      };
    }, siteOrigin);
    mkdirSync(runsDir, { recursive: true });
    if (diff.pngs[0]) writeFileSync(join(runsDir, "export-preview.png"), Buffer.from(diff.pngs[0], "base64"));
    if (diff.pngs[1]) writeFileSync(join(runsDir, "export-served.png"), Buffer.from(diff.pngs[1], "base64"));
    expect(diff.size).toEqual(diff.servedSize);
    process.stdout.write(
      `[export] ${diff.size.width}×${diff.size.height}, ${(diff.differing * 100).toFixed(2)}% differ\n`,
    );
    // The picture is of the served files, not of the preview.
    expect(diff.served.url).toBe(`${siteOrigin}/`);
    expect(diff.served.marked).toBe(0);
    expect(diff.served.sheets).toContain(`${siteOrigin}/assets/site.css`);
    expect(diff.size.width).toBeGreaterThan(200);
    expect(diff.differing).toBeLessThan(0.01);
  });

  test("Publish: three ways, the last one chosen again; the static one exports again into its last folder and shows the hosts", async () => {
    const w = launched.window;
    await w.getByTestId("export-open").click();
    await w.getByTestId("export-dialog").waitFor();
    await until(async () => !(await main((u) => u.preview.view.getVisible())));
    await until(async () => (await w.getByTestId("publish-choice").count()) === 3);
    expect(
      await w
        .getByTestId("publish-choice")
        .evaluateAll((els) => els.map((e) => [e.getAttribute("data-id"), e.getAttribute("aria-pressed")])),
    ).toEqual([
      ["static", "true"],
      ["node", "false"],
      ["cloudflare", "false"],
    ]);
    // The way it was exported last time is chosen again.
    expect(await w.getByTestId("export-choose").isDisabled()).toBe(false);
    await w.locator('[data-testid="publish-choice"][data-id="static"]').click();
    await w.getByTestId("export-again").click();
    await expect(w.getByTestId("export-result").textContent()).resolves.toContain("Exported 2 pages");
    expect(await w.getByTestId("guide-step").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")))).toEqual([
      "upload",
    ]);
    await launched.capture("export-dialog");
    // The site's address is given in the website's settings now (Q183).
    expect(await w.getByTestId("export-site-url").count()).toBe(0);
    await w.getByTestId("export-close").click();
    await until(() => main((u) => u.preview.view.getVisible()));
  });

  test("record pages and the credits page; no datasources; the images in WebP with a srcset (Q147, Q156, Q157)", async () => {
    const { path } = await invoke("projects:current");
    const write = (name: string, text: string | Buffer) => {
      mkdirSync(join(path, name, ".."), { recursive: true });
      writeFileSync(join(path, name), text);
    };
    write(
      "data/posts/_datasource.yaml",
      "label: Posts\nfields:\n  - name: title\n    kind: text\n  - name: cover\n    kind: image\n",
    );
    write(
      "data/posts/opening.md",
      "---\ntitle: Opening day\ncover: /media/croissants.jpg\n---\nWe open on *Monday*.\n",
    );
    write("media/croissants.jpg", readFileSync(join(import.meta.dirname, "fixtures/images/croissants.jpg")));
    write(
      "media/croissants.json",
      JSON.stringify({
        alt: "Croissants on a counter",
        credit: {
          author: "Jane Doe",
          license: "CC BY-SA 4.0",
          source: "https://commons.wikimedia.org/wiki/File:Croissants.jpg",
        },
      }),
    );
    write(
      "pages/blog/index.liquid",
      '<!doctype html><html><head><title>Blog</title></head><body>{% for post in data.posts %}<a href="/blog/{{ post.id }}"><img src="{{ post.cover }}" style="width:100%">{{ post.title }}</a>{% endfor %}<footer>Chez Margot</footer></body></html>',
    );
    write(
      "pages/blog/[posts].liquid",
      "<!doctype html><html><head><title>{{ record.title }}</title></head><body><h1>{{ record.title }}</h1>{{ record.body }}</body></html>",
    );
    const started = Date.now();
    const result = await invoke("export:run", out, "static");
    process.stdout.write(`[export] with 4 WebP copies of a 2600 px image: ${Date.now() - started} ms\n`);
    expect(result.pages).toEqual(expect.arrayContaining(["/blog", "/blog/opening", "/credits"]));
    expect(readFileSync(join(out, "blog/opening/index.html"), "utf8")).toContain(
      "<h1>Opening day</h1><p>We open on <em>Monday</em>.</p>",
    );
    expect(readFileSync(join(out, "credits/index.html"), "utf8")).toContain("Jane Doe");
    expect(existsSync(join(out, "data"))).toBe(false);
    expect(existsSync(join(out, "media/croissants.json"))).toBe(false);
    for (const w of [480, 960, 1600, 2400])
      expect(existsSync(join(out, `media/croissants-${w}w.webp`)), `${w}`).toBe(true);
    const blog = readFileSync(join(out, "blog/index.html"), "utf8");
    expect(blog).toContain(
      '<img srcset="/media/croissants-480w.webp 480w, /media/croissants-960w.webp 960w, /media/croissants-1600w.webp 1600w, /media/croissants-2400w.webp 2400w" sizes="100vw" alt="Croissants on a counter" src="/media/croissants.jpg"',
    );
    expect(blog).toMatch(/<a href="\/credits"[^>]*>Image credits<\/a><\/p><\/footer>/);
    // Served, the browser takes a WebP copy, not the original.
    const shown = await main(async (u, origin, electron) => {
      const view = new electron.WebContentsView({ webPreferences: { partition: "export-check" } });
      u.win.contentView.addChildView(view);
      view.setBounds({ x: 0, y: 0, width: 800, height: 600 });
      await view.webContents.loadURL(`${origin}/blog`);
      const src = await view.webContents.executeJavaScript(
        "new Promise((r) => { const i = document.querySelector('img'); i.complete ? r(i.currentSrc) : i.onload = () => r(i.currentSrc); })",
      );
      u.win.contentView.removeChildView(view);
      view.webContents.close();
      return src as string;
    }, siteOrigin);
    expect(shown).toMatch(/\/media\/croissants-\d+w\.webp$/);
  });

  const projectFolderName = async () => (await invoke("projects:current")).path.split("/").at(-1);
});
