import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

const FIXTURE = join(import.meta.dirname, "fixtures/images");

// The media library (Q149-Q159, Q168), with the image search answered by
// made-up images: an image found and added with its credits, at most 2400 px
// wide; a file added from the disk; an alt text written, one version on
// leaving; an image chosen for a record's field in the picker; its uses
// shown and its deletion refused; renamed everywhere it is used; an unused
// file deleted and brought back; the credits page. In the preview: a
// record's title edited in place, "Replace…" on an image written in the
// template and on a record's image, a file dropped onto an image.
describe("the media library", () => {
  let launched: LaunchedApp;
  let path: string;
  const { invoke, until, page, click, typeText, key } = previewDriver(() => launched);
  const w = () => launched.window;
  const last = async () => ((await invoke("history:list")) as { label: string }[]).at(-1)?.label;
  const items = () =>
    w()
      .getByTestId("media-item")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-path")));
  // biome-ignore lint/suspicious/noExplicitAny: the main process's objects, set for checks
  const routes = async () =>
    (
      (await launched.app.evaluate(() => (globalThis as any).upstart.preview.state())) as {
        routes: { route: string }[];
      }
    ).routes.map((r) => r.route);

  beforeAll(async () => {
    launched = await launchApp({ env: { UPSTART_IMAGES_FIXTURE: FIXTURE } });
    await w().getByTestId("conversation").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => w().locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    path = (await invoke("projects:current")).path;
    mkdirSync(join(path, "data/posts"), { recursive: true });
    writeFileSync(
      join(path, "data/posts/_datasource.yaml"),
      "label: Posts\nfields:\n  - name: title\n    kind: text\n  - name: cover\n    kind: image\n",
    );
    writeFileSync(join(path, "data/posts/opening.md"), "---\ntitle: Opening day\n---\n");
    await w().getByTestId("tab-content").click();
    await w().getByTestId("content-media").click();
    await w().getByTestId("media").waitFor();
    // Edit mode: the preview opens in visitor mode (Q253).
    await invoke("preview:set-mode", "edit");
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("an image found, added with its credits, at most 2400 px wide (Q149-Q151)", async () => {
    await until(async () => (await w().getByTestId("media").textContent())?.includes("No files yet"));
    await w().getByTestId("media-search-toggle").click();
    await w().getByTestId("image-search-input").fill("croissants");
    await w().getByTestId("image-search-input").press("Enter");
    await until(async () => (await w().getByTestId("image-found").count()) === 2);
    expect(await w().locator('[data-testid="image-found"] img').count()).toBe(2);
    await w().locator('[data-testid="image-found"][data-id="commons:101"]').click();
    await until(async () => (await items()).includes("media/croissants-on-a-counter.jpg"));
    const info = JSON.parse(readFileSync(join(path, "media/croissants-on-a-counter.json"), "utf8"));
    expect(info).toMatchObject({
      alt: "Croissants on a counter",
      credit: { author: "Jane Doe", license: "CC BY-SA 4.0" },
    });
    const jpeg = readFileSync(join(path, "media/croissants-on-a-counter.jpg"));
    // The width, from the JPEG's frame header.
    const sof = jpeg.findIndex((b, i) => b === 0xff && (jpeg[i + 1] === 0xc0 || jpeg[i + 1] === 0xc2));
    expect(jpeg.readUInt16BE(sof + 7)).toBe(2400);
    expect(await last()).toBe("Image added");
  });

  test("a file added from the disk, as one dropped from the Finder", async () => {
    await invoke("media:add-files", [join(FIXTURE, "shop-front.jpg")]);
    await until(async () => (await items()).includes("media/shop-front.jpg"));
    expect(await last()).toBe("File added");
    await expect(invoke("media:add-files", ["/tmp/clip.mp4"])).rejects.toThrow("does not keep video or audio");
  });

  test("an alt text written as typed, one version on leaving", async () => {
    await w().locator('[data-testid="media-item"][data-path="media/shop-front.jpg"]').click();
    await expect(w().getByTestId("media-uses").textContent()).resolves.toBe("Not used yet");
    await w().getByTestId("media-alt").fill("The shop's window in the morning");
    await until(async () =>
      readFileSync(join(path, "media/shop-front.json"), "utf8").includes("The shop's window in the morning"),
    );
    expect(await last()).toBe("File added");
    await w().getByTestId("media-back").click();
    await until(async () => (await last()) === "Alt text of shop-front.jpg changed");
  });

  test("an image chosen for a record's field in the picker (Q158)", async () => {
    await w().getByTestId("content-datasources").click();
    await w().locator('[data-testid="datasource"][data-name="posts"]').click();
    await w().locator('[data-testid="record"][data-id="opening"] button').first().click();
    await w().getByTestId("field-cover-choose").click();
    await w().getByTestId("media-picker").waitFor();
    await until(async () => (await w().getByTestId("picker-item").count()) === 2);
    await launched.capture("media-picker");
    await w().locator('[data-testid="picker-item"][data-path="media/croissants-on-a-counter.jpg"]').click();
    await w().getByTestId("media-picker").waitFor({ state: "detached" });
    await until(async () =>
      readFileSync(join(path, "data/posts/opening.md"), "utf8").includes("cover: /media/croissants-on-a-counter.jpg"),
    );
    await w().getByTestId("content-back").click();
    await until(async () => (await last()) === "Edited Opening day");
    // Its licence asks for credits: the site has a credits page.
    await until(async () => (await routes()).includes("/credits"));
  });

  test("a file in use cannot be deleted; renamed, it is renamed where it is used (Q168)", async () => {
    await w().getByTestId("content-back").click();
    await w().getByTestId("content-media").click();
    await w().locator('[data-testid="media-item"][data-path="media/croissants-on-a-counter.jpg"]').click();
    await expect(w().getByTestId("media-uses").textContent()).resolves.toBe("Used in Posts (1)");
    expect(await w().getByTestId("media-delete").isDisabled()).toBe(true);
    await expect(invoke("media:delete", "media/croissants-on-a-counter.jpg")).rejects.toThrow(
      "This file is used (Posts (1)): replace it there first.",
    );
    await w().getByTestId("media-rename").click();
    await w().getByTestId("media-name-input").fill("croissants");
    await w().getByTestId("media-name-save").click();
    await until(() => Promise.resolve(existsSync(join(path, "media/croissants.jpg"))));
    expect(existsSync(join(path, "media/croissants.json"))).toBe(true);
    expect(existsSync(join(path, "media/croissants-on-a-counter.jpg"))).toBe(false);
    expect(readFileSync(join(path, "data/posts/opening.md"), "utf8")).toContain("cover: /media/croissants.jpg");
    expect(await last()).toBe("File renamed");
    await until(async () => (await w().getByTestId("media-name").textContent()) === "/media/croissants.jpg");
    await w().getByTestId("media-back").click();
  });

  test("a file not used is deleted, and brought back", async () => {
    await w().locator('[data-testid="media-item"][data-path="media/shop-front.jpg"]').click();
    await w().getByTestId("media-delete").click();
    await until(() => Promise.resolve(!existsSync(join(path, "media/shop-front.jpg"))));
    expect(existsSync(join(path, "media/shop-front.json"))).toBe(false);
    await expect(w().getByTestId("media-deleted").textContent()).resolves.toContain("shop-front.jpg deleted");
    await w().getByTestId("media-deleted-undo").click();
    await until(() => Promise.resolve(existsSync(join(path, "media/shop-front.jpg"))));
    await until(async () => (await items()).join() === "media/croissants.jpg,media/shop-front.jpg");
    await launched.capture("media-library");
  });

  test("a record's title edited in place in the preview, written in its record (Q148)", async () => {
    writeFileSync(
      join(path, "pages/blog.liquid"),
      '<!doctype html><html><head><title>Blog</title></head><body>{% for post in data.posts %}<article><h2>{{ post.title }}</h2><img class="cover" src="{{ post.cover }}" alt="" width="200"></article>{% endfor %}<img class="hero" src="/media/shop-front.jpg" alt="Shop" width="200"></body></html>',
    );
    await invoke("preview:navigate", "/blog");
    await until(() =>
      page("!!document.querySelector('img.hero') && document.querySelector('h2')?.textContent === 'Opening day'"),
    );
    await click("h2", false, 2);
    await until(() => page("document.querySelector('h2').isContentEditable"));
    await key("End");
    await typeText(" again");
    await key("Enter");
    await until(async () =>
      readFileSync(join(path, "data/posts/opening.md"), "utf8").includes("title: Opening day again"),
    );
    expect(await last()).toBe("Edited Opening day again");
  });

  test("Replace… on an image of the template, and on a record's image, through the picker (Q159)", async () => {
    const replace = async (selector: string, choose: string) => {
      await click(selector);
      await until(() =>
        page("!!document.querySelector('upstart-editor').shadowRoot.querySelector('[data-testid=\"editor-replace\"]')"),
      );
      await click('[data-testid="editor-replace"]', true);
      await w().getByTestId("media-picker").waitFor();
      await w().locator(`[data-testid="picker-item"][data-path="${choose}"]`).click();
      await w().getByTestId("media-picker").waitFor({ state: "detached" });
    };
    await replace("img.hero", "media/croissants.jpg");
    await until(async () =>
      readFileSync(join(path, "pages/blog.liquid"), "utf8").includes(
        '<img class="hero" src="/media/croissants.jpg" alt="Croissants on a counter" width="200">',
      ),
    );
    expect(await last()).toBe("Image replaced");
    await until(() => page("document.querySelector('img.hero').getAttribute('src') === '/media/croissants.jpg'"));
    await replace("img.cover", "media/shop-front.jpg");
    await until(async () =>
      readFileSync(join(path, "data/posts/opening.md"), "utf8").includes("cover: /media/shop-front.jpg"),
    );
    expect(await last()).toBe("Image replaced");
  });

  test("an image file dropped onto an image: added to the library and used, one version", async () => {
    const at = Number(
      String(await page("document.querySelector('img.hero').getAttribute('data-up-src')"))
        .split(":")
        .pop(),
    );
    const versions = ((await invoke("history:list")) as unknown[]).length;
    // What the preview sends for a drop: a real one cannot be made in the background.
    await launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's objects, set for checks
      (_electron, action) => (globalThis as any).upstart.editor.edit(action),
      { type: "image", file: "pages/blog.liquid", at, src: "", from: join(FIXTURE, "shop-front.jpg") },
    );
    await until(async () =>
      readFileSync(join(path, "pages/blog.liquid"), "utf8").includes('src="/media/shop-front-2.jpg"'),
    );
    expect(existsSync(join(path, "media/shop-front-2.jpg"))).toBe(true);
    expect(((await invoke("history:list")) as unknown[]).length).toBe(versions + 1);
    expect(await last()).toBe("Image replaced");
    await until(async () => (await items()).includes("media/shop-front-2.jpg"));
  });
});
