// generate_image with the maker's real accounts (Q423-Q429): run only when
// asked, with the keys set in the terminal, since each image is paid for.
//
//   GEMINI_API_KEY=… pnpm exec vitest run src/main/images/generate.real.test.ts
//   OPENAI_API_KEY=… pnpm exec vitest run src/main/images/generate.real.test.ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { generateImage, type ImageCredentials } from "./generate";
import { generateIntoMedia } from "./into-media";

const gemini = process.env.GEMINI_API_KEY;
const openai = process.env.OPENAI_API_KEY;

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "upstart-generate-"));
  mkdirSync(join(root, "media"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Generates an image, then a second one from it, and checks both landed in media/ at about 2K. */
async function generatesAndRetouches(credentials: ImageCredentials, model: string, id: string) {
  const sharp = (await import("sharp")).default;
  const generate = (request: Parameters<typeof generateImage>[2]) => generateImage(credentials, id, request);
  const first = await generateIntoMedia(
    root,
    model,
    {
      prompt:
        "A small ceramic cup of espresso on a pale oak table, soft morning light from the left, photographed from above",
      aspect: "4:3",
      name: `${credentials.account} cup`,
      alt: "An espresso cup on an oak table",
    },
    generate,
  );
  const file = /\/(media\/[^ ]+\.webp)/.exec(first)?.[1];
  expect(file, first).toBeDefined();
  const meta = await sharp(readFileSync(join(root, file!))).metadata();
  expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeGreaterThanOrEqual(1500);
  expect((meta.width ?? 0) / (meta.height ?? 1)).toBeCloseTo(4 / 3, 1);
  const info = JSON.parse(readFileSync(join(root, file!.replace(/\.webp$/, ".json")), "utf8"));
  expect(info.generated).toMatchObject({ model, prompt: expect.stringContaining("espresso") });

  const second = await generateIntoMedia(
    root,
    model,
    {
      prompt: "The same cup and table, the same light, with a croissant on a plate beside the cup",
      aspect: "4:3",
      name: `${credentials.account} cup and croissant`,
      alt: "An espresso and a croissant on an oak table",
      references: [`/${file}`],
    },
    generate,
  );
  expect(second).toContain(".webp");
  const retouched = JSON.parse(readFileSync(join(root, /\/(media\/[^ ]+)\.webp/.exec(second)![1] + ".json"), "utf8"));
  expect(retouched.generated.references).toEqual([`/${file}`]);
}

test.skipIf(!gemini)(
  "a Gemini API key generates an image, then another from it",
  async () => {
    await generatesAndRetouches(
      { account: "gemini", key: gemini! },
      "gemini/gemini-nano-banana-2.1",
      "gemini-nano-banana-2.1",
    );
  },
  180_000,
);

test.skipIf(!openai)(
  "an OpenAI key generates an image, then another from it",
  async () => {
    await generatesAndRetouches({ account: "openai", key: openai! }, "openai/gpt-image-2", "gpt-image-2");
  },
  300_000,
);
