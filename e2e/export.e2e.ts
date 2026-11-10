import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, runsDir } from "./app.ts";

// The static export (decisions): the recorded project is exported, the folder
// served by a plain static file server, and its pages look like the preview.
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
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
    server?.close();
  });

  test("every page, the stylesheet and the theme are written; nothing of the preview", async () => {
    const result = await invoke("export:run", out);
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
    await invoke("export:run", out);
    expect(existsSync(join(out, "stale.html"))).toBe(false);

    const theirs = join(runsDir, "export-theirs");
    rmSync(theirs, { recursive: true, force: true });
    mkdirSync(theirs, { recursive: true });
    writeFileSync(join(theirs, "notes.txt"), "mine");
    const result = await invoke("export:run", theirs);
    expect(result.folder).toBe(join(theirs, `${await projectFolderName()}-site`));
    expect(readFileSync(join(theirs, "notes.txt"), "utf8")).toBe("mine");
    expect(existsSync(join(result.folder, "index.html"))).toBe(true);
    // Back to the first folder, for the next checks.
    await invoke("export:run", out);
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

  test("the dialog exports again into the last folder, hides the page and keeps the site's address", async () => {
    const w = launched.window;
    await w.getByTestId("export-open").click();
    await w.getByTestId("export-dialog").waitFor();
    await until(async () => !(await main((u) => u.preview.view.getVisible())));
    await w.getByTestId("export-again").click();
    await expect(w.getByTestId("export-result").textContent()).resolves.toContain("Exported 2 pages");
    await launched.capture("export-dialog");
    await w.getByTestId("export-site-url").fill("https://chez-margot.netlify.app");
    await w.getByTestId("export-site-url-save").click();
    await until(async () => (await invoke("projects:current")).siteUrl === "https://chez-margot.netlify.app");
    const { path } = await invoke("projects:current");
    expect(JSON.parse(readFileSync(join(path, ".upstart/project.json"), "utf8")).siteUrl).toBe(
      "https://chez-margot.netlify.app",
    );
    await w.getByTestId("export-close").click();
    await until(() => main((u) => u.preview.view.getVisible()));
  });

  const projectFolderName = async () => (await invoke("projects:current")).path.split("/").at(-1);
});
