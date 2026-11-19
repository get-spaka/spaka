import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";
import { writePagesRecording } from "./fixtures/pages-recording.ts";

// The preview's "All pages" view (Q128–Q141), with a recording that writes
// the home page, the menu and the about page, each in small pieces: the switch
// to all pages when the menu begins, once per website; the page being written
// live while it is written, outlined, and moved on to the next;
// a picture of each page; a click that opens a page; the right-click menu's
// duplicate, delete and undo, and the question to the agent; the view kept.
describe("all pages as thumbnails", () => {
  let launched: LaunchedApp;
  let path: string;
  let projectId: string;
  const seen = { pages: false, writing: new Set<string>(), live: new Map<string, Set<number>>() };
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).upstart.invoke(channel, ...args),
      [channel, args] as const,
    );
  // biome-ignore lint/suspicious/noExplicitAny: the main process's objects, set for checks
  type Main = any;
  const main = <T, A = undefined>(fn: (u: Main, arg: A) => T, arg?: A) =>
    launched.app.evaluate(
      (_e, [source, arg]) =>
        new Function("u", "arg", `return (${source})(u, arg)`)((globalThis as { upstart?: unknown }).upstart, arg),
      [fn.toString(), arg] as const,
    ) as Promise<Awaited<T>>;
  const until = async (read: () => Promise<unknown>, timeout = 10_000) => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value) return value;
      if (Date.now() - started > timeout) throw new Error(`timed out waiting for: ${read}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const thumbs = () => launched.window.locator('[data-testid="page-thumb"]');
  const menuItem = (route: string, label: string) =>
    main(
      (u, [route, label]: string[]) => {
        const item = u.pageItems(route).find((i: { label?: string }) => i.label === label);
        return item ? { enabled: item.enabled !== false } : undefined;
      },
      [route, label],
    );
  const click = (route: string, label: string) =>
    main(
      (u, [route, label]: string[]) =>
        u
          .pageItems(route)
          .find((i: { label?: string }) => i.label === label)
          .click(),
      [route, label],
    );

  beforeAll(async () => {
    const recording = join(mkdtempSync(join(tmpdir(), "pages-grid-")), "three.jsonl");
    writePagesRecording(recording, 3, { chunk: 40, step: 25 });
    launched = await launchApp({ env: { UPSTART_AGENT_REPLAY: recording, UPSTART_AGENT_REPLAY_SPEED: "1" } });
    const w = launched.window;
    await w.getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A climbing gym in Grenoble, three pages.");
    // Watches the turn: the view, the outline, and what the live thumbnail shows.
    for (const started = Date.now(); ; ) {
      const state = await main((u) => ({
        view: u.preview.currentView,
        live: u.preview.grid.liveView?.shown ? u.preview.grid.liveView.route : "",
      }));
      if (state.view === "pages") seen.pages = true;
      if (state.live) {
        const length = await main((u) =>
          u.preview.grid.liveView.view.webContents.executeJavaScript("document.body.innerText.length"),
        ).catch(() => 0);
        seen.live.set(state.live, (seen.live.get(state.live) ?? new Set()).add(length as number));
      }
      const outlined = await w
        .locator('[data-testid="page-thumb"]:has([data-testid="page-writing"])')
        .getAttribute("data-route", { timeout: 50 })
        .catch(() => null);
      if (outlined) seen.writing.add(outlined);
      if (await w.locator('[data-testid="agent-message"][data-status="done"]').count()) break;
      if (Date.now() - started > 40_000) throw new Error("The turn did not end.");
      await new Promise((r) => setTimeout(r, 50));
    }
    const project = await invoke("projects:current");
    path = project.path;
    projectId = project.id;
  }, 90_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test("the preview goes to all pages when the menu begins; the page being written is live and outlined", async () => {
    expect(seen.pages).toBe(true);
    expect([...seen.writing]).toEqual(["/menu", "/about"]);
    expect([...seen.live.keys()]).toEqual(["/menu", "/about"]);
    // The live thumbnail changed as each page was written.
    for (const [route, lengths] of seen.live) expect(lengths.size, route).toBeGreaterThan(2);
    await expect(launched.window.getByTestId("view-pages").getAttribute("aria-pressed")).resolves.toBe("true");
    expect(await thumbs().evaluateAll((els) => els.map((e) => e.getAttribute("data-route")))).toEqual([
      "/",
      "/about",
      "/menu",
    ]);
    // Once the turn is over, no page is live and each has its picture.
    await until(async () => (await launched.window.locator('[data-testid="page-thumb"] img').count()) === 3);
    expect(await launched.window.getByTestId("page-writing").count()).toBe(0);
    await until(async () => !(await main((u) => u.preview.grid.liveView)));
    await launched.capture("pages-grid");
  });

  test("a click opens the page; the view is kept for the website", async () => {
    await launched.window.locator('[data-testid="page-thumb"][data-route="/menu"] button').click();
    await until(async () => (await main((u) => u.preview.state())).route === "/menu");
    expect(await main((u) => u.preview.currentView)).toBe("page");
    const dataDir = (await main((u, id: string) => u.projects.dataFor(id), projectId)) as string;
    const data = () => JSON.parse(readFileSync(join(dataDir, "preview.json"), "utf8"));
    expect(data()).toEqual({ view: "page", switched: true });
    // Reopened, the website is in the view it was left in, and does not switch again.
    await invoke("preview:set-view", "pages");
    await invoke("projects:close");
    await invoke("projects:open", projectId);
    expect(await main((u) => u.preview.currentView)).toBe("pages");
    expect(data()).toEqual({ view: "pages", switched: true });
    await until(async () => (await thumbs().count()) === 3);
  });

  test("the menu's duplicate, delete and undo; the home page cannot be deleted", async () => {
    expect(await menuItem("/", "Delete")).toEqual({ enabled: false });
    expect(await menuItem("/menu", "Delete")).toEqual({ enabled: true });
    await click("/menu", "Duplicate");
    expect(readFileSync(join(path, "pages/menu-2.liquid"), "utf8")).toBe(
      readFileSync(join(path, "pages/menu.liquid"), "utf8"),
    );
    await until(async () => (await thumbs().count()) === 4);
    await until(async () => (await launched.window.locator('[data-testid="page-thumb"] img').count()) === 4);
    await click("/menu-2", "Delete");
    expect(existsSync(join(path, "pages/menu-2.liquid"))).toBe(false);
    await until(async () => (await thumbs().count()) === 3);
    await expect(launched.window.getByTestId("page-deleted").textContent()).resolves.toContain("Menu 2 deleted");
    const labels = ((await invoke("history:list")) as { label: string }[]).map((e) => e.label);
    expect(labels).toEqual(expect.arrayContaining(["Page duplicated", "Page deleted"]));
    await launched.window.getByTestId("page-deleted-undo").click();
    await until(() => Promise.resolve(existsSync(join(path, "pages/menu-2.liquid"))));
    await until(async () => (await thumbs().count()) === 4);
    expect(await launched.window.getByTestId("page-deleted").count()).toBe(0);
  });

  test("the zoom from a thumbnail to its page, and back", async () => {
    const w = launched.window;
    const zoom = w.getByTestId("preview-zoom");
    await until(async () => (await w.locator('[data-testid="page-thumb"] img').count()) === 4);
    await w.locator('[data-testid="page-thumb"][data-route="/about"] button').click();
    await zoom.waitFor({ timeout: 2000 });
    await zoom.waitFor({ state: "detached", timeout: 2000 });
    expect(await main((u) => u.preview.currentView)).toBe("page");
    await until(async () => (await main((u) => u.preview.state())).route === "/about");
    const landing = await main((u) => u.preview.landings.at(-1));
    // The page was loaded and drawn out of sight meanwhile (Q142).
    expect(landing).toMatchObject({ route: "/about", drawn: true });
    expect(landing.ms).toBeLessThan(1000);
    // The page scrolls without a scrollbar taking its width, as its thumbnail (Q143).
    const widths = await main((u) =>
      u.preview.view.webContents.executeJavaScript(
        "[innerWidth, document.documentElement.clientWidth, document.documentElement.scrollHeight > innerHeight]",
      ),
    );
    expect(widths[0]).toBe(widths[1]);
    expect(widths[2]).toBe(true);
    // Back to the thumbnails: the page shrinks into its cell, the other thumbnails fade in.
    await w.getByTestId("view-pages").click();
    await zoom.waitFor({ timeout: 2000 });
    await new Promise((r) => setTimeout(r, 120));
    await launched.capture("pages-zoom");
    await zoom.waitFor({ state: "detached", timeout: 2000 });
    await until(async () => (await thumbs().count()) === 4);
  });

  test("thumbnails are pictured at the preview's size; the zoom lands under the page view", async () => {
    const w = launched.window;
    // The cells have the preview's shape, and the pictures are taken at its size (Q142).
    const area = await w.getByTestId("pages-grid").evaluate((el) => {
      const r = (el.parentElement as HTMLElement).getBoundingClientRect();
      return r.width / r.height;
    });
    const cellShape = async () =>
      w.locator('[data-testid="page-thumb"][data-route="/about"] button').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.width / r.height;
      });
    await until(async () => Math.abs((await cellShape()) - area) < 0.03);
    const pictureShape = () =>
      w
        .locator('[data-testid="page-thumb"][data-route="/about"] img')
        .evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight);
    await until(async () => Math.abs((await pictureShape()) - area) < 0.03);
    await w.locator('[data-testid="page-thumb"][data-route="/about"] button').click();
    const zoom = w.getByTestId("preview-zoom");
    await zoom.waitFor({ timeout: 2000 });
    // The picture goes only once the page view is in its place over it: nothing shows between them.
    for (const started = Date.now(); ; ) {
      const [shown, x] = await Promise.all([zoom.count(), main((u) => u.preview.view.getBounds().x)]);
      if (!shown) {
        expect(x).toBeGreaterThanOrEqual(0);
        break;
      }
      if (Date.now() - started > 2000) throw new Error("The zoom did not land.");
    }
    expect(await main((u) => u.preview.landings.at(-1))).toMatchObject({ route: "/about", drawn: true });
    await invoke("preview:set-view", "pages");
    await until(async () => (await thumbs().count()) === 4);
  });

  test("asking the agent about a page starts the message with its address", async () => {
    await click("/menu", "Ask the agent about it");
    const input = launched.window.getByTestId("message-input");
    await until(async () => (await input.inputValue()) === "On the page /menu: ");
    expect(await input.evaluate((el) => el === document.activeElement)).toBe(true);
  });

  test("a page per record, after the others under its datasource's name, named by its title (Q147, Q164)", async () => {
    const w = launched.window;
    mkdirSync(join(path, "data/posts"), { recursive: true });
    mkdirSync(join(path, "pages/blog"), { recursive: true });
    writeFileSync(
      join(path, "data/posts/_datasource.yaml"),
      "label: Posts\nfields:\n  - name: title\n    kind: text\n  - name: date\n    kind: date\nsort: -date\n",
    );
    writeFileSync(join(path, "data/posts/first.md"), "---\ntitle: First post\ndate: 2026-11-01\n---\nHello.\n");
    writeFileSync(join(path, "data/posts/second.md"), "---\ntitle: Second post\ndate: 2026-11-05\n---\nAgain.\n");
    writeFileSync(
      join(path, "pages/blog/[posts].liquid"),
      "<!doctype html><html><head><title>Post</title></head><body><h1>{{ record.title }}</h1></body></html>",
    );
    await until(async () => (await thumbs().count()) === 6);
    expect(await thumbs().evaluateAll((els) => els.map((e) => e.getAttribute("data-route")))).toEqual([
      "/",
      "/about",
      "/menu",
      "/menu-2",
      "/blog/second",
      "/blog/first",
    ]);
    expect(await w.getByTestId("page-group").allTextContents()).toEqual(["Posts"]);
    await expect(
      w.locator('[data-testid="page-thumb"][data-route="/blog/second"] figcaption').textContent(),
    ).resolves.toContain("Second post");
    const groups = await w
      .getByTestId("page-select")
      .evaluate((el) => [...el.querySelectorAll("optgroup")].map((g) => [g.label, g.children.length]));
    expect(groups).toEqual([["Posts", 2]]);
    // Its menu acts on the record's file.
    await click("/blog/second", "Duplicate");
    expect(readFileSync(join(path, "data/posts/second-2.md"), "utf8")).toContain("Second post");
    await until(async () => (await thumbs().count()) === 7);
    await click("/blog/second-2", "Delete");
    expect(existsSync(join(path, "data/posts/second-2.md"))).toBe(false);
    await until(async () => (await thumbs().count()) === 6);
    await expect(w.getByTestId("page-deleted").textContent()).resolves.toContain("Second post deleted");
    const labels = ((await invoke("history:list")) as { label: string }[]).map((e) => e.label);
    expect(labels).toEqual(expect.arrayContaining(["Record duplicated", "Record deleted"]));
  });
});
