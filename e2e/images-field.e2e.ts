import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

const FIXTURE = join(import.meta.dirname, "fixtures/images");

// A record's list of images (Q352-Q358), on the recorded bakery with a list
// of homes written beside it. In the Content tab: the thumbnails, moved with
// the arrows, removed, several added at once from the media picker, dragged
// to another place, one replaced. In the preview: an image of the list moved
// earlier or later, removed from the list, dragged by its handle onto
// another, and replaced, each written in the record.
describe("a list of images", () => {
  let launched: LaunchedApp;
  let path: string;
  const { invoke, until, page, input, center, click, drawn } = previewDriver(() => launched);
  const w = () => launched.window;
  const record = "data/homes/wren.md";
  /** The record's images, in the order its file lists them. */
  const photos = () =>
    [...readFileSync(join(path, record), "utf8").matchAll(/\/media\/(\w)\.jpg/g)].map((m) => m[1]).join("");
  const items = () =>
    w()
      .getByTestId("image-item")
      .evaluateAll((els) => els.map((e) => /\/media\/(\w)\.jpg/.exec(e.getAttribute("data-path") ?? "")?.[1]).join(""));
  const last = async () => ((await invoke("history:list")) as { label: string }[]).at(-1)?.label;
  const write = (name: string, text: string) => {
    mkdirSync(join(path, name, ".."), { recursive: true });
    writeFileSync(join(path, name), text);
  };
  const reset = () =>
    write(record, "---\naddress: Wren Street\nphotos:\n  - /media/a.jpg\n  - /media/b.jpg\n  - /media/c.jpg\n---\n");

  beforeAll(async () => {
    launched = await launchApp({ env: { SPAKA_IMAGES_FIXTURE: FIXTURE } });
    await w().getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => w().locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    path = (await invoke("projects:current")).path;
    mkdirSync(join(path, "media"), { recursive: true });
    for (const [name, from] of [
      ["a", "croissants"],
      ["b", "shop-front"],
      ["c", "croissants"],
      ["d", "shop-front"],
    ])
      copyFileSync(join(FIXTURE, `${from}.jpg`), join(path, `media/${name}.jpg`));
    write(
      "data/homes/_datasource.yaml",
      "label: Homes\nfields:\n  - name: address\n    kind: text\n  - name: photos\n    kind: images\n",
    );
    reset();
    write(
      "pages/homes/[homes].liquid",
      '<!doctype html><html><head><title>Home</title></head><body><h1>{{ record.address }}</h1><div class="strip" style="display:flex;gap:16px">{% for photo in record.photos %}<img src="{{ photo }}" alt="" width="160" height="120">{% endfor %}</div></body></html>',
    );
    await w().getByTestId("tab-content").click();
  }, 60_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test("in the Content tab: moved, removed, several added, dragged and replaced (Q354)", async () => {
    await until(async () => (await w().locator('[data-testid="datasource"][data-name="homes"]').count()) === 1);
    await w().locator('[data-testid="datasource"][data-name="homes"]').click();
    await w().locator('[data-testid="record"][data-id="wren"] button').first().click();
    await until(async () => (await items()) === "abc");
    const item = (i: number) => w().getByTestId("image-item").nth(i);
    await expect(item(0).getByTestId("image-earlier").isDisabled()).resolves.toBe(true);

    await item(0).getByTestId("image-later").click();
    await until(async () => photos() === "bac");
    await item(2).getByTestId("image-remove").click();
    await until(async () => photos() === "ba");

    // Several at once, in the order chosen.
    await w().getByTestId("images-add").click();
    await w().getByTestId("media-picker").waitFor();
    await w().locator('[data-testid="picker-item"][data-path="media/d.jpg"]').click();
    await w().locator('[data-testid="picker-item"][data-path="media/c.jpg"]').click();
    await expect(w().getByTestId("picker-add").textContent()).resolves.toBe("Add 2 images");
    await launched.capture("images-picker");
    await w().getByTestId("picker-add").click();
    await w().getByTestId("media-picker").waitFor({ state: "detached" });
    await until(async () => photos() === "badc");

    await item(3).dragTo(item(0));
    await until(async () => photos() === "cbad");

    await item(1).getByTestId("image-replace").click();
    await w().getByTestId("media-picker").waitFor();
    await w().locator('[data-testid="picker-item"][data-path="media/a.jpg"]').click();
    await w().getByTestId("media-picker").waitFor({ state: "detached" });
    await until(async () => photos() === "caad");
    await until(async () => (await items()) === "caad");
    await launched.capture("images-field");

    // Leaving the record makes its one version.
    await w().getByTestId("content-back").click();
    await until(async () => (await last()) === "Edited Wren Street");
  });

  test("in the preview: moved, removed, dragged and replaced in place (Q355, Q356)", async () => {
    reset();
    await invoke("preview:set-mode", "edit");
    await invoke("preview:navigate", "/homes/wren");
    const img = (n: number) => `.strip img:nth-child(${n})`;
    const srcs = () =>
      page(
        "[...document.querySelectorAll('.strip img')].map((i) => /\\/media\\/(\\w)\\.jpg/.exec(i.getAttribute('src'))?.[1]).join('')",
      );
    await until(async () => (await srcs()) === "abc");
    // Loaded, with their size: a click goes where each image is drawn.
    await until(() =>
      page("[...document.querySelectorAll('.strip img')].every((i) => i.complete && i.naturalWidth > 0)"),
    );
    const bar = (act: string) =>
      page(
        `document.querySelector('spaka-editor').shadowRoot.querySelector('[data-testid="editor-${act}"]')?.disabled`,
      );
    const select = async (n: number) => {
      // The bar keeps its last buttons while hidden: emptied, so that what is read is the new selection's.
      await page("document.querySelector('spaka-editor').shadowRoot.querySelector('.bar').innerHTML = ''");
      await click(img(n));
      await until(async () => (await bar("later")) !== undefined && (await bar("later")) !== null).catch(
        async (error) => {
          const at = await center(img(n));
          const hit = await page(
            `(() => { const e = document.elementFromPoint(${at.x}, ${at.y}); return \`\${e ? e.outerHTML.slice(0, 120) : null} in \${innerWidth}×\${innerHeight}\`; })()`,
          );
          throw new Error(`${error.message}; clicked at ${JSON.stringify(at)} on ${hit}`);
        },
      );
    };

    await select(1);
    expect(await bar("earlier")).toBe(true);
    expect(await bar("later")).toBe(false);
    expect(await bar("duplicate")).toBe(true);
    await click('[data-testid="editor-later"]', true);
    await until(async () => photos() === "bac");
    expect(await last()).toBe("Image moved in the list");
    await until(async () => (await srcs()) === "bac");

    await select(3);
    expect(await bar("later")).toBe(true);
    await click('[data-testid="editor-earlier"]', true);
    await until(async () => photos() === "bca");
    await until(async () => (await srcs()) === "bca");

    await select(1);
    await click('[data-testid="editor-remove"]', true);
    await until(async () => photos() === "ca");
    expect(await last()).toBe("Image removed from the list");
    expect(readFileSync(join(path, "media/b.jpg")).length).toBeGreaterThan(0);
    await until(async () => (await srcs()) === "ca");

    // Dragged by its handle onto the other image of the list.
    await select(2);
    const from = await center('[data-testid="editor-item-drag"]', true);
    const to = await center(img(1));
    const steps = [0.25, 0.5, 0.75, 1].map((f) => ({
      type: "mouseMove",
      x: Math.round(from.x + (to.x - from.x) * f),
      y: Math.round(from.y + (to.y - from.y) * f),
      button: "left",
      modifiers: ["leftButtonDown"],
    }));
    await input([
      { type: "mouseMove", ...from },
      { type: "mouseDown", ...from, button: "left", clickCount: 1 },
      ...steps,
    ]);
    await until(() => drawn(".hover"));
    await input([{ type: "mouseUp", ...to, button: "left", clickCount: 1 }]);
    await until(async () => photos() === "ac");
    await until(async () => (await srcs()) === "ac");

    await select(2);
    await click('[data-testid="editor-replace"]', true);
    await w().getByTestId("media-picker").waitFor();
    await w().locator('[data-testid="picker-item"][data-path="media/d.jpg"]').click();
    await w().getByTestId("media-picker").waitFor({ state: "detached" });
    await until(async () => photos() === "ad");
    expect(await last()).toBe("Image replaced");
  });
});
