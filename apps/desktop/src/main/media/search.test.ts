import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { addImage, freeName, replaceUses, slug, useFoundImage, usesLabel, usesOf, webpCopies } from "./library";
import {
  commonsThumb,
  FixtureImages,
  freeLicense,
  fromCommons,
  fromOpenverse,
  ImageSearch,
  imagesAnswer,
  USER_AGENT,
} from "./search";

// Shaped like the answers recorded on 2026-11-11, cut down.
const commons = {
  query: {
    pages: [
      {
        pageid: 2,
        title: "File:Croissants.jpg",
        index: 2,
        imageinfo: [
          {
            width: 4000,
            height: 3000,
            mime: "image/jpeg",
            url: "https://upload.wikimedia.org/c/croissants.jpg?utm_source=commons.wikimedia.org&utm_content=original",
            thumburl: "https://upload.wikimedia.org/thumb/c/croissants.jpg/2400px-croissants.jpg?utm_source=x",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:Croissants.jpg",
            extmetadata: {
              ObjectName: { value: "Croissants" },
              ImageDescription: { value: "Croissants on a <b>bakery</b> counter &amp; bread" },
              Artist: { value: '<bdi><a href="https://example.org/jane">Jane Doe</a></bdi>' },
              LicenseShortName: { value: "CC BY-SA 4.0" },
              LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
            },
          },
        ],
      },
      {
        pageid: 1,
        title: "File:Buns.jpg",
        index: 1,
        imageinfo: [
          {
            width: 1200,
            height: 800,
            mime: "image/jpeg",
            url: "https://upload.wikimedia.org/b/buns.jpg",
            extmetadata: { LicenseShortName: { value: "Public domain" } },
          },
        ],
      },
      {
        pageid: 3,
        title: "File:Kitchen.jpg",
        index: 3,
        imageinfo: [
          {
            width: 4130,
            height: 2607,
            mime: "image/jpeg",
            url: "x",
            extmetadata: { LicenseShortName: { value: "GFDL 1.2" } },
          },
        ],
      },
      {
        pageid: 4,
        title: "File:Logo.svg",
        index: 4,
        imageinfo: [
          {
            width: 100,
            height: 100,
            mime: "image/svg+xml",
            url: "y",
            extmetadata: { LicenseShortName: { value: "CC0" } },
          },
        ],
      },
    ],
  },
};

const openverse = {
  results: [
    {
      id: "abc",
      title: "Bakery window",
      url: "https://live.staticflickr.com/1/window.jpg",
      width: 1024,
      height: 768,
      creator: "sam",
      creator_url: "https://flickr.com/sam",
      license: "by",
      license_version: "2.0",
      license_url: "https://creativecommons.org/licenses/by/2.0/",
      foreign_landing_url: "https://flickr.com/photos/sam/1",
      source: "flickr",
      filetype: "jpg",
    },
    { id: "nc", title: "No", url: "z", license: "by-nc", license_version: "2.0", source: "flickr" },
    { id: "pd", title: "Old print", url: "https://example.org/print.png", license: "pdm", source: "smithsonian" },
  ],
};

describe("licences", () => {
  test("only those free for commercial use, named the same way", () => {
    expect(freeLicense("CC BY-SA 4.0")?.license).toBe("CC BY-SA 4.0");
    expect(freeLicense("cc by 2.0")).toEqual({
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    });
    expect(freeLicense("CC-BY-SA-3.0-migrated")?.license).toBe("CC BY-SA 3.0");
    expect(freeLicense("CC0")?.license).toBe("CC0 1.0");
    expect(freeLicense("Public domain")?.license).toBe("Public domain");
    expect(freeLicense("pdm")?.license).toBe("Public domain");
    for (const no of [
      "CC BY-NC 4.0",
      "CC BY-ND 2.0",
      "cc by-nc-sa 3.0",
      "GFDL 1.2",
      "All rights reserved",
      "",
      undefined,
    ])
      expect(freeLicense(no), String(no)).toBeUndefined();
  });
});

describe("the sources' answers", () => {
  test("Commons: in its order, free bitmaps only, the author and description as text, a copy 2400 px wide", () => {
    const images = fromCommons(commons);
    expect(images.map((i) => i.id)).toEqual(["commons:1", "commons:2"]);
    expect(images[1]).toEqual({
      id: "commons:2",
      title: "Croissants",
      description: "Croissants on a bakery counter & bread",
      width: 4000,
      height: 3000,
      url: "https://upload.wikimedia.org/thumb/c/croissants.jpg/2400px-croissants.jpg",
      thumb: "https://upload.wikimedia.org/c/croissants.jpg",
      credit: {
        title: "Croissants",
        author: "Jane Doe",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        source: "Wikimedia Commons",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Croissants.jpg",
      },
    });
    expect(images[0]!.url).toBe("https://upload.wikimedia.org/b/buns.jpg");
  });

  test("Openverse: free licences only, the provider named", () => {
    const images = fromOpenverse(openverse);
    expect(images.map((i) => i.id)).toEqual(["openverse:abc", "openverse:pd"]);
    expect(images[0]!.credit).toMatchObject({ license: "CC BY 2.0", author: "sam", source: "Openverse (Flickr)" });
    expect(images[1]!.credit).toMatchObject({ license: "Public domain", source: "Openverse (Smithsonian)" });
  });

  test("both asked at once with a generic User-Agent; one that fails or is slow leaves the other's", async () => {
    const asked: { url: string; agent?: string }[] = [];
    const search = new ImageSearch({
      openverseTimeout: 50,
      fetch: async (url, init) => {
        asked.push({ url, agent: init?.headers?.["User-Agent"] });
        if (url.includes("openverse"))
          await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("timeout"))));
        return new Response(JSON.stringify(commons));
      },
    });
    const result = await search.search("croissants bakery", 10);
    expect(result.failed).toEqual(["Openverse"]);
    expect(result.images.map((i) => i.id)).toEqual(["commons:1", "commons:2"]);
    expect(asked.map((a) => a.agent)).toEqual([USER_AGENT, USER_AGENT]);
    expect(asked[0]!.url).toContain("gsrsearch=croissants%20bakery%20filetype:bitmap");
    expect(asked[1]!.url).toContain("license=cc0,pdm,by,by-sa");
    expect(search.found("commons:2")?.title).toBe("Croissants");
    // Both answering: one from each in turn.
    const both = new ImageSearch({
      fetch: async (url) => new Response(JSON.stringify(url.includes("openverse") ? openverse : commons)),
    });
    expect((await both.search("bakery", 3)).images.map((i) => i.id)).toEqual([
      "commons:1",
      "openverse:abc",
      "commons:2",
    ]);
  });

  test("the answer to the agent: text, each image with its id, licence and author", () => {
    const text = imagesAnswer("croissants", { images: fromCommons(commons), failed: ["Openverse"] });
    expect(text).toContain("(Openverse did not answer; these come from the others.)");
    expect(text).toContain("## 2. Croissants (id commons:2)");
    expect(text).toContain("4000×3000, CC BY-SA 4.0, by Jane Doe, from Wikimedia Commons");
    expect(imagesAnswer("x", { images: [], failed: [] })).toContain('No free image found for "x"');
  });
});

describe("the media library", () => {
  const project = () => mkdtempSync(join(tmpdir(), "media-"));
  const jpeg = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: "#c8a27a" } })
      .jpeg()
      .toBuffer();

  test("names: a slug, never one taken", () => {
    expect(slug("Croissants à la crème.JPG")).toBe("croissants-a-la-creme");
    expect(slug("!!!")).toBe("image");
    const root = project();
    writeFileSync(join(root, "cafe.png"), "");
    writeFileSync(join(root, "cafe-2.json"), "");
    expect(freeName(root, "cafe")).toBe("cafe-3");
    expect(freeName(root, "shop")).toBe("shop");
  });

  test("an image made 2400 px wide at most, with its alt text and credits beside it", async () => {
    const root = project();
    const credit = { license: "CC BY 4.0", author: "Jane" };
    const added = await addImage(root, "Bakery front", await jpeg(3000, 2000), { alt: "The front", credit });
    expect(added).toEqual({ path: "media/bakery-front.jpg", width: 2400, height: 1600 });
    expect((await sharp(join(root, added.path)).metadata()).width).toBe(2400);
    expect(JSON.parse(readFileSync(join(root, "media/bakery-front.json"), "utf8"))).toEqual({
      alt: "The front",
      credit,
    });
    // A small one is kept as it is; the name already taken gets a number.
    const small = await jpeg(800, 600);
    const second = await addImage(root, "bakery front", small, {});
    expect(second.path).toBe("media/bakery-front-2.jpg");
    expect(readFileSync(join(root, second.path)).equals(small)).toBe(true);
    await expect(addImage(root, "x", Buffer.from("not an image"), {})).rejects.toThrow();
    expect(readdirSync(join(root, "media")).sort()).toEqual([
      "bakery-front-2.jpg",
      "bakery-front-2.json",
      "bakery-front.jpg",
      "bakery-front.json",
    ]);
  });

  test("use_image: the image found, downloaded, added, and how to use it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "images-"));
    writeFileSync(join(dir, "croissants.jpg"), await jpeg(2600, 1300));
    const image = fromCommons(commons)[1]!;
    writeFileSync(join(dir, "images.json"), JSON.stringify([{ ...image, url: "croissants.jpg" }]));
    const finder = new FixtureImages(dir);
    const root = project();
    const text = await useFoundImage(finder, root, "commons:2", "croissants", "Croissants on a counter");
    expect(text).toContain("Added as /media/croissants.jpg (2400×1200)");
    expect(text).toContain("media/croissants.json");
    expect(JSON.parse(readFileSync(join(root, "media/croissants.json"), "utf8")).credit.author).toBe("Jane Doe");
    expect(await useFoundImage(finder, root, "commons:9", "x", "y")).toContain("No image with the id commons:9");
    // The same image again: the file kept, its alt text replaced, nothing added.
    const again = await useFoundImage(finder, root, "commons:2", "croissants-again", "Fresh croissants");
    expect(again).toContain("already in the project as /media/croissants.jpg");
    expect(readdirSync(join(root, "media")).sort()).toEqual(["croissants.jpg", "croissants.json"]);
    expect(JSON.parse(readFileSync(join(root, "media/croissants.json"), "utf8")).alt).toBe("Fresh croissants");
  });
});

test("Commons' small copy: 330 px wide, or the image itself when it is narrower", () => {
  const url = "https://upload.wikimedia.org/wikipedia/commons/d/d4/Lviv_Croissants.jpg";
  expect(commonsThumb(url, 1427)).toBe(
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Lviv_Croissants.jpg/330px-Lviv_Croissants.jpg",
  );
  expect(commonsThumb(url, 300)).toBe(url);
});

describe("where a media file is used (Q168)", () => {
  const files = {
    "pages/index.liquid": '<img src="/media/cafe.jpg"><img src="/media/cafe.jpg.old">',
    "parts/hero.liquid": "<div style=\"background:url('/media/cafe-2.jpg')\"></div>",
    "data/posts/a.md": "---\ncover: media/cafe.jpg\n---\n",
    "data/posts/b.md": "---\ncover: /media/cafe.jpg\n---\n",
  };
  test("its uses, and nothing longer that starts the same", () => {
    expect(usesOf("media/cafe.jpg", files)).toEqual(["pages/index.liquid", "data/posts/a.md", "data/posts/b.md"]);
    expect(usesLabel(usesOf("media/cafe.jpg", files), (n) => (n === "posts" ? "Posts" : n))).toBe("1 page, Posts (2)");
    expect(usesLabel(["parts/a.liquid", "parts/b.liquid"])).toBe("2 shared parts");
  });
  test("renamed in every file that uses it, the leading slash kept as it was", () => {
    expect(replaceUses("media/cafe.jpg", "media/shop.jpg", files)).toEqual({
      "pages/index.liquid": '<img src="/media/shop.jpg"><img src="/media/cafe.jpg.old">',
      "data/posts/a.md": "---\ncover: media/shop.jpg\n---\n",
      "data/posts/b.md": "---\ncover: /media/shop.jpg\n---\n",
    });
  });
});

test("an image's WebP copies at the widths it reaches, at its own when narrower; none for a drawing (Q156)", async () => {
  const photo = readFileSync(join(import.meta.dirname, "../../../../../e2e/fixtures/images/croissants.jpg"));
  const copies = await webpCopies("media/croissants.jpg", photo, [480, 960, 1600, 2400]);
  expect(copies?.map((c) => c.width)).toEqual([480, 960, 1600, 2400]);
  const meta = await sharp(copies![1]!.data).metadata();
  expect([meta.format, meta.width]).toEqual(["webp", 960]);
  const small = await sharp({ create: { width: 700, height: 400, channels: 3, background: "#c96" } })
    .png()
    .toBuffer();
  expect((await webpCopies("media/small.png", small, [480, 960, 1600, 2400]))?.map((c) => c.width)).toEqual([480, 700]);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  expect(await webpCopies("media/logo.svg", svg, [480])).toBeUndefined();
});
