import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

const FIXTURE = join(import.meta.dirname, "fixtures/images");

// The media library (Q149-Q159, Q168), with the image search answered by
// made-up images: an image found and added with its credits, at most 2400 px
// wide; a file added from the disk; an alt text written, one version on
// leaving; an image chosen for a record's field in the picker; its uses
// shown and its deletion refused; renamed everywhere it is used; an unused
// file deleted and brought back; the credits page. In the preview: a
// record's title edited in place, "Replace…" on an image written in the
// template and on a record's image, a file dropped onto an image, an image
// set in its frame (Q547).
describe("the media library", () => {
  let launched: LaunchedApp;
  let path: string;
  const { invoke, until, page, input, center, click, typeText, key, drawn, picture } = previewDriver(() => launched);
  const w = () => launched.window;
  const last = async () => ((await invoke("history:list")) as { label: string }[]).at(-1)?.label;
  const items = () =>
    w()
      .getByTestId("media-item")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-path")));
  const routes = async () => {
    const state = (await launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's objects, set for checks
      () => (globalThis as any).spaka.preview.state(),
    )) as { routes: { route: string }[] };
    return state.routes.map((r) => r.route);
  };

  beforeAll(async () => {
    launched = await launchApp({ env: { SPAKA_IMAGES_FIXTURE: FIXTURE, SPAKA_IMAGES_GENERATED: "1" } });
    await w().getByTestId("message-input").waitFor();
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
  }, 60_000 * SLOW);
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
        page("!!document.querySelector('spaka-editor').shadowRoot.querySelector('[data-testid=\"editor-replace\"]')"),
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
      String(await page("document.querySelector('img.hero').getAttribute('data-spaka-src')"))
        .split(":")
        .pop(),
    );
    const versions = ((await invoke("history:list")) as unknown[]).length;
    // What the preview sends for a drop: a real one cannot be made in the background.
    await launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's objects, set for checks
      (_electron, action) => (globalThis as any).spaka.editor.edit(action),
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

  test("an image written in the template is set in its frame, shown as it is set (Q547)", async () => {
    const file = () => readFileSync(join(path, "pages/blog.liquid"), "utf8");
    const hero = (read: string) => page(`(() => { const el = document.querySelector('img.hero'); return ${read}; })()`);
    const control = (testid: string, read: string) =>
      page(
        `(() => { const el = document.querySelector('spaka-editor').shadowRoot.querySelector('[data-testid="${testid}"]'); return ${read}; })()`,
      );
    const open = async () => {
      await until(() => control("editor-frame", "!!el"));
      await click('[data-testid="editor-frame"]', true);
      await until(() => drawn('[data-testid="frame-pop"]'));
    };
    const before = file();
    const versions = ((await invoke("history:list")) as unknown[]).length;
    // The image is put back in sight and selected by a point of its own.
    await page("document.querySelector('img.hero').scrollIntoView({ block: 'center' })");
    await click("img.hero");
    await open();
    // It is set for every screen, the one the preview shows being the one seen changing.
    const shown = (await page("innerWidth < 768 ? 'phone' : innerWidth < 1024 ? 'tablet' : 'desktop'")) as string;
    for (const format of ["desktop", "tablet", "phone"]) {
      expect(await control(`frame-format-${format}`, "el.getAttribute('aria-pressed')")).toBe("true");
      expect(await control(`frame-format-${format}`, "el.disabled")).toBe(format === shown);
    }
    expect(await drawn('[data-testid="frame-hint"]')).toBe(false);
    // Each gesture shows on the image itself; nothing is written yet.
    // The shapes go from the widest to the tallest, after the one the page gives.
    expect(
      await page(
        `[...document.querySelector('spaka-editor').shadowRoot.querySelectorAll('[data-ratio]')].map((b) => b.textContent)`,
      ),
    ).toEqual(["Auto", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"]);
    expect(await control("frame-ratio-original", "el.getAttribute('aria-pressed')")).toBe("true");
    await click('[data-testid="frame-ratio-9-16"]', true);
    await until(() => hero("getComputedStyle(el).aspectRatio === '9 / 16'"));
    await click('[data-testid="frame-ratio-1-1"]', true);
    await until(() =>
      hero("getComputedStyle(el).aspectRatio === '1 / 1' && getComputedStyle(el).objectFit === 'cover'"),
    );
    expect(await control("frame-ratio-1-1", "el.getAttribute('aria-pressed')")).toBe("true");
    await click('[data-testid="frame-pos-0-0"]', true);
    await until(() => hero("el.style.objectPosition === '0% 0%'"));
    await click('[data-testid="frame-zoom"]', true);
    await until(() => control("frame-zoom", "Number(el.value) > 1"));
    const zoom = Number(await control("frame-zoom", "el.value"));
    expect(await hero("el.style.transform")).toBe(`scale(${zoom})`);
    expect(await hero("el.style.clipPath")).toContain("inset(0%");
    // The outline stays on the frame, which the zoom does not make larger.
    const size = await hero("[el.clientWidth, el.clientHeight]");
    expect(await control("frame-drag", "[Math.round(el.offsetWidth), Math.round(el.offsetHeight)]")).toEqual(size);
    // Dragged to the left, the image shows more of its right.
    const { x, y } = await center('[data-testid="frame-drag"]', true);
    await input([
      { type: "mouseMove", x, y },
      { type: "mouseDown", x, y, button: "left", clickCount: 1 },
      { type: "mouseMove", x: x - 12, y, button: "left" },
      { type: "mouseMove", x: x - 24, y, button: "left" },
      { type: "mouseUp", x: x - 24, y, button: "left", clickCount: 1 },
    ]);
    await until(() => hero("parseFloat(el.style.objectPosition) > 0"));
    expect(await control("frame-pos-0-0", "el.getAttribute('aria-pressed')")).toBe("false");
    // A picture is taken of a frame the page draws: it is kept drawing for a moment.
    await page(`(() => { let n = 0; const tick = () => { document.body.style.opacity = n++ % 2 ? "1" : "0.999";
      if (n < 240) requestAnimationFrame(tick); else document.body.style.opacity = ""; }; tick(); })()`);
    await picture("image-frame");
    expect(file()).toBe(before);
    await click('[data-testid="frame-save"]', true);
    await until(async () => file() !== before);
    const tag = /<img [^>]*class="hero[^>]*>/.exec(file())?.[0] ?? "";
    // Classes of the image, for every screen: none names one.
    expect(tag).toMatch(/class="hero object-cover! object-\[[\d.]+%_0%\]! aspect-\[1\/1\]! \[transform:scale\(/);
    // The page's own Tailwind gives them their rules: the image stays as it was set, without a style of its own.
    await until(() =>
      hero(
        "el.style.transform === '' && getComputedStyle(el).transform !== 'none' && getComputedStyle(el).aspectRatio === '1 / 1'",
      ),
    );
    expect(await last()).toBe("Image adjusted");
    expect(((await invoke("history:list")) as unknown[]).length).toBe(versions + 1);
    expect(await drawn('[data-testid="frame-pop"]')).toBe(false);
    // Opened again it says what was saved; Reset shows the template's own frame, Cancel takes it back.
    const saved = file();
    await open();
    expect(Number(await control("frame-zoom", "el.value"))).toBe(zoom);
    await click('[data-testid="frame-reset"]', true);
    await until(() =>
      hero("getComputedStyle(el).transform === 'none' && getComputedStyle(el).aspectRatio !== '1 / 1'"),
    );
    await click('[data-testid="frame-cancel"]', true);
    await until(() =>
      hero("getComputedStyle(el).transform !== 'none' && getComputedStyle(el).aspectRatio === '1 / 1'"),
    );
    expect(file()).toBe(saved);
    // On a phone it is set apart: the larger screens keep what they have. The page is drawn smaller
    // there, so the panel is driven from the page itself.
    const press = (testid: string) => control(testid, "(el.click(), true)");
    await w().getByTestId("width-phone").click();
    await until(() => page("innerWidth < 768"));
    await page("document.querySelector('img.hero').click()");
    await until(() => control("editor-frame", "!!el"));
    await press("editor-frame");
    await until(() => drawn('[data-testid="frame-pop"]'));
    expect(await control("frame-format-phone", "el.disabled")).toBe(true);
    await press("frame-format-desktop");
    await press("frame-format-tablet");
    expect(await drawn('[data-testid="frame-hint"]')).toBe(true);
    // A tick says which screens it is for: only the phone's shows now.
    const ticked = (format: string) =>
      control(`frame-format-${format}`, "getComputedStyle(el.querySelector('.tick')).visibility === 'visible'");
    expect([await ticked("desktop"), await ticked("tablet"), await ticked("phone")]).toEqual([false, false, true]);
    // The screen shown has a second tick, the others never do.
    const twice = (format: string) =>
      control(`frame-format-${format}`, "getComputedStyle(el.querySelector('.second')).display !== 'none'");
    expect([await twice("desktop"), await twice("tablet"), await twice("phone")]).toEqual([false, false, true]);
    await press("frame-ratio-16-9");
    await until(() => hero("getComputedStyle(el).aspectRatio === '16 / 9'"));
    await press("frame-save");
    await until(async () => file() !== saved);
    const apart = /<img [^>]*class="hero[^>]*>/.exec(file())?.[0] ?? "";
    expect(apart).toContain("max-md:aspect-[16/9]!");
    expect(apart).toContain("md:aspect-[1/1]!");
    expect(apart).not.toMatch(/ aspect-\[/);
    expect(await last()).toBe("Image adjusted");
    await until(() => hero("el.style.aspectRatio === '' && getComputedStyle(el).aspectRatio === '16 / 9'"));
    // Back on a wide page, the image is as it was set there.
    await w().getByTestId("width-desktop").click();
    await until(() => page("innerWidth >= 1024"));
    await until(() => hero("getComputedStyle(el).aspectRatio === '1 / 1'"));
    await w().getByTestId("width-fit").click();
    await until(() => page(`(innerWidth < 768 ? 'phone' : innerWidth < 1024 ? 'tablet' : 'desktop') === '${shown}'`));
    // An image whose template gives it a style of its own: Reset shows it with that style, which Save
    // leaves in the file, so that what was seen is what stays.
    const styled = file().replace(
      /<img [^>]*class="hero[^>]*>/,
      '<img class="hero" style="aspect-ratio: 2 / 1" src="/media/croissants.jpg" alt="x">',
    );
    writeFileSync(join(path, "pages/blog.liquid"), styled);
    await until(() =>
      hero("el.getAttribute('style') === 'aspect-ratio: 2 / 1' && getComputedStyle(el).aspectRatio === '2 / 1'"),
    );
    const adjust = async () => {
      await page("document.querySelector('img.hero').click()");
      await until(() => control("editor-frame", "!!el"));
      await press("editor-frame");
      await until(() => drawn('[data-testid="frame-pop"]'));
    };
    await adjust();
    await press("frame-ratio-1-1");
    await until(() => hero("getComputedStyle(el).aspectRatio === '1 / 1'"));
    await press("frame-save");
    await until(async () => file().includes("aspect-[1/1]!"));
    await until(() =>
      hero("el.getAttribute('style') === 'aspect-ratio: 2 / 1' && getComputedStyle(el).aspectRatio === '1 / 1'"),
    );
    await adjust();
    await press("frame-reset");
    await until(() => hero("getComputedStyle(el).aspectRatio === '2 / 1'"));
    await press("frame-save");
    await until(async () => file() === styled);
    await until(async () => !(await drawn('[data-testid="frame-pop"]')));
    expect(await hero("getComputedStyle(el).aspectRatio")).toBe("2 / 1");
    // On a tablet, an image as wide as the page zoomed to twice its size spills out of the page, which
    // then reads wider; the screen is still a tablet, and the panel stays open on it.
    writeFileSync(
      join(path, "pages/blog.liquid"),
      file().replace(
        /<img [^>]*class="hero[^>]*>/,
        '<div class="around"><img class="hero" style="display: block; width: 100%" src="/media/croissants.jpg" alt="x"></div>',
      ),
    );
    await until(() => hero("el.getAttribute('style') === 'display: block; width: 100%'"));
    await w().getByTestId("width-tablet").click();
    await until(() => page("matchMedia('(width >= 48rem)').matches && !matchMedia('(width >= 64rem)').matches"));
    await adjust();
    await control("frame-zoom", "(el.value = '2', el.dispatchEvent(new Event('input', { bubbles: true })), true)");
    await until(() => hero("getComputedStyle(el).transform.startsWith('matrix(2,')"));
    await new Promise((r) => setTimeout(r, 300));
    expect(await drawn('[data-testid="frame-pop"]')).toBe(true);
    expect(await control("frame-format-tablet", "el.disabled")).toBe(true);
    // What contains the image cuts what goes past: the page is no wider for it, while it is set and once saved.
    const wide = () => page("document.documentElement.scrollWidth > document.documentElement.clientWidth");
    expect(await wide()).toBe(false);
    await press("frame-save");
    await until(async () => file().includes("[transform:scale(2)]!"));
    await until(() => hero("el.style.transform === '' && getComputedStyle(el).transform.startsWith('matrix(2,')"));
    expect(await hero("getComputedStyle(el.parentElement).overflow")).toBe("clip");
    expect(await wide()).toBe(false);
    // Brought back to 100%, the saved zoom no longer shows: the panel's frame stands for the saved one.
    await adjust();
    await control("frame-zoom", "(el.value = '1', el.dispatchEvent(new Event('input', { bubbles: true })), true)");
    await until(() => hero("getComputedStyle(el).transform === 'none' && getComputedStyle(el).clipPath === 'none'"));
    // Saved proportions too, once the panel is back to Auto.
    await press("frame-ratio-16-9");
    await press("frame-save");
    await until(async () => file().includes("aspect-[16/9]!"));
    await until(async () => !(await drawn('[data-testid="frame-pop"]')));
    await adjust();
    await press("frame-ratio-original");
    await until(() => hero("getComputedStyle(el).aspectRatio !== '16 / 9'"));
    // Cancelled, the image is as saved again.
    await press("frame-cancel");
    await until(() => hero("getComputedStyle(el).aspectRatio === '16 / 9'"));
    writeFileSync(join(path, "pages/blog.liquid"), styled);
    await until(() => hero("el.getAttribute('style') === 'aspect-ratio: 2 / 1'"));
    // A phone turned on its side is as wide as a tablet: the tablet's frame is the one set, and the panel says why.
    await w().getByTestId("width-phone").click();
    await until(() => page("innerWidth < 768"));
    await adjust();
    expect(await control("frame-format-phone", "el.disabled")).toBe(true);
    expect(await drawn('[data-testid="frame-sideways"]')).toBe(false);
    await w().getByTestId("rotate").click();
    await until(() => page("innerWidth >= 768 && innerWidth < 1024"));
    // The page being another screen now, the panel has closed.
    await until(async () => !(await drawn('[data-testid="frame-pop"]')));
    await adjust();
    expect(await control("frame-format-tablet", "el.disabled")).toBe(true);
    expect(await control("frame-sideways", "el.textContent")).toContain("A phone held sideways is as wide as a tablet");
    expect(await drawn('[data-testid="frame-sideways"]')).toBe(true);
    await press("frame-cancel");
    await w().getByTestId("rotate").click();
    await w().getByTestId("width-fit").click();
    await until(() => page(`(innerWidth < 768 ? 'phone' : innerWidth < 1024 ? 'tablet' : 'desktop') === '${shown}'`));
    // A zoomed image takes no more room than its frame: held by its bottom left and shown twice as
    // large, it is cut to the frame it had, which a point just outside of it does not reach.
    expect(
      await page(`(() => {
        const img = document.createElement("img");
        img.style.cssText = "position: fixed; left: 100px; top: 100px; width: 100px; height: 100px; z-index: 9; object-position: 0% 100%; transform: scale(2); transform-origin: 0% 100%; clip-path: inset(50% 50% 0% 0%)";
        document.body.append(img);
        const hit = (x, y) => document.elementFromPoint(x, y) === img;
        const hits = [hit(105, 105), hit(195, 195), hit(205, 150), hit(150, 95), hit(150, 205)];
        img.remove();
        return hits;
      })()`),
    ).toEqual([true, true, false, false, false]);
    // A record's image is shown for each record: it has no frame of its own.
    await click("img.cover");
    await until(() => control("editor-replace", "!!el"));
    expect(await control("editor-frame", "!!el")).toBe(false);
  });

  test("an image generated by the agent: WebP, marked Generated, with its model and prompt, no credits (Q428)", async () => {
    const answer = (await launched.app.evaluate(
      async (_electron, project) => {
        // biome-ignore lint/suspicious/noExplicitAny: the main process's objects, set for checks
        const u = (globalThis as any).spaka;
        return u.kitFor(project).tools.generateImage({
          prompt: "A sage-green ceramic cup on a linen tablecloth, morning light",
          aspect: "4:3",
          name: "sage cup",
          alt: "A sage-green cup on linen",
        });
      },
      await invoke("projects:current"),
    )) as string;
    expect(answer).toContain("/media/sage-cup.webp");
    const info = JSON.parse(readFileSync(join(path, "media/sage-cup.json"), "utf8"));
    expect(info).toMatchObject({
      alt: "A sage-green cup on linen",
      generated: { model: "gemini/gemini-nano-banana-2.1", prompt: expect.stringContaining("sage-green") },
    });
    expect(info.credit).toBeUndefined();
    await until(async () => (await items()).includes("media/sage-cup.webp"));
    const tile = w().locator('[data-testid="media-item"][data-path="media/sage-cup.webp"]');
    await expect(tile.getByTestId("media-generated-mark").count()).resolves.toBe(1);
    await tile.click();
    await until(async () => (await w().getByTestId("media-generated").textContent())?.includes("morning light"));
    expect(await w().getByTestId("media-generated").textContent()).toContain("Nano Banana");
    await w().getByTestId("media-back").click();
  });
});
