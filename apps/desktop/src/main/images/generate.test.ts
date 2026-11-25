import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, expect, test } from "vitest";
import { IMAGE_MODELS, imageModelFor } from "../../shared/image-models";
import { generateImage, OPENAI_SIZES, splitImageModel } from "./generate";
import { generateIntoMedia, readReferences } from "./into-media";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "spaka-images-"));
  mkdirSync(join(root, "media"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#c08552" } })
    .png()
    .toBuffer();

test("the model for images: the setting's if its account is connected, else the website's account's, else the first connected (Q427)", () => {
  expect(imageModelFor("auto", "claude-opus-5-5", [])).toBeUndefined();
  expect(imageModelFor("auto", "claude-opus-5-5", ["openai", "gemini"])).toBe("gemini/gemini-nano-banana-2.1");
  expect(imageModelFor("auto", "openai/gpt-6.2-sol", ["openai", "gemini"])).toBe("openai/gpt-image-2");
  expect(imageModelFor("auto", "chatgpt/gpt-6.2-sol", ["chatgpt"])).toBeUndefined();
  expect(imageModelFor("gemini/gemini-3.1-flash-image", "openai/gpt-6.2-sol", ["openai", "gemini"])).toBe(
    "gemini/gemini-3.1-flash-image",
  );
  // A setting whose account is no longer connected reads as Automatic.
  expect(imageModelFor("vertex/gemini-3.1-flash-image", "gemini/gemini-4-neon", ["gemini"])).toBe(
    "gemini/gemini-nano-banana-2.1",
  );
  expect(splitImageModel("vertex/gemini-nano-banana-2.1")).toEqual({
    account: "vertex",
    model: "gemini-nano-banana-2.1",
  });
  expect(IMAGE_MODELS.filter((m) => m.default).map((m) => m.account)).toEqual(["gemini", "vertex", "openai"]);
});

test("OpenAI: a generation from the prompt at about 2K, an edit when there are references", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const image = (await png(8, 8)).toString("base64");
  const get = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ data: [{ b64_json: image }] }), { status: 200 });
  }) as typeof fetch;
  const made = await generateImage(
    { account: "openai", key: "k" },
    "gpt-image-2",
    { prompt: "Linen", aspect: "16:9", references: [] },
    undefined,
    get,
  );
  expect(made.mimeType).toBe("image/png");
  expect(calls[0]!.url).toBe("https://api.openai.com/v1/images/generations");
  expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
    model: "gpt-image-2",
    prompt: "Linen",
    size: "2048x1152",
    quality: "medium",
    n: 1,
  });
  await generateImage(
    { account: "openai", key: "k" },
    "gpt-image-2",
    { prompt: "Warmer", aspect: "4:3", references: [{ data: await png(4, 3), mimeType: "image/png" }] },
    undefined,
    get,
  );
  expect(calls[1]!.url).toBe("https://api.openai.com/v1/images/edits");
  const form = calls[1]!.init.body as FormData;
  expect(form.get("size")).toBe(OPENAI_SIZES["4:3"]);
  expect(form.getAll("image[]")).toHaveLength(1);
  const refused = (async () =>
    new Response(JSON.stringify({ error: { message: "Your request was rejected" } }), {
      status: 400,
    })) as unknown as typeof fetch;
  await expect(
    generateImage(
      { account: "openai", key: "k" },
      "gpt-image-2",
      { prompt: "x", aspect: "1:1", references: [] },
      undefined,
      refused,
    ),
  ).rejects.toThrow(/OpenAI answered 400: Your request was rejected/);
});

test("a generated image goes into media/ as WebP, with its alt and how it was made, and no credit (Q428)", async () => {
  writeFileSync(
    join(root, "media/shop.jpg"),
    await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#222" } })
      .jpeg()
      .toBuffer(),
  );
  let asked: { prompt: string; aspect: string; references: number } | undefined;
  const answer = await generateIntoMedia(
    root,
    "gemini/gemini-nano-banana-2.1",
    {
      prompt: " A linen texture, soft daylight ",
      aspect: "16:9",
      name: "Linen texture",
      alt: "Toile de lin",
      references: ["/media/shop.jpg"],
    },
    async (request) => {
      asked = { prompt: request.prompt, aspect: request.aspect, references: request.references.length };
      return { data: await png(160, 90), mimeType: "image/png" };
    },
    () => new Date("2026-11-21T10:00:00Z"),
  );
  expect(asked).toEqual({ prompt: "A linen texture, soft daylight", aspect: "16:9", references: 1 });
  expect(answer).toMatch(/^Generated and added as \/media\/linen-texture\.webp \(160×90\)/);
  expect(JSON.parse(readFileSync(join(root, "media/linen-texture.json"), "utf8"))).toEqual({
    alt: "Toile de lin",
    generated: {
      model: "gemini/gemini-nano-banana-2.1",
      prompt: "A linen texture, soft daylight",
      date: "2026-11-21T10:00:00.000Z",
      references: ["/media/shop.jpg"],
    },
  });
  // The reference went at 1536 px at most.
  const [ref] = await readReferences(root, ["media/shop.jpg"]);
  expect((await sharp(ref!.data).metadata()).width).toBe(1536);
});

test("what is not an image of the project, or a failed generation, is said to the agent", async () => {
  const never = async () => {
    throw new Error("should not run");
  };
  expect(
    await generateIntoMedia(
      root,
      "m",
      { prompt: "x", aspect: "1:1", name: "a", alt: "", references: ["/etc/passwd"] },
      never,
    ),
  ).toMatch(/is not an image of the project's media/);
  expect(
    await generateIntoMedia(
      root,
      "m",
      {
        prompt: "x",
        aspect: "1:1",
        name: "a",
        alt: "",
        references: ["/media/a.png", "/media/b.png", "/media/c.png", "/media/d.png", "/media/e.png"],
      },
      never,
    ),
  ).toMatch(/At most 4 references/);
  expect(
    await generateIntoMedia(root, "m", { prompt: "x", aspect: "1:1", name: "a", alt: "" }, async () => {
      throw new Error("No image came back (SAFETY).");
    }),
  ).toBe("The image was not generated: No image came back (SAFETY).");
  expect(await generateIntoMedia(root, "m", { prompt: " ", aspect: "1:1", name: "a", alt: "" }, never)).toMatch(
    /Say what the image shows/,
  );
});
