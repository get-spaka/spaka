// The models that generate images (Q423, Q427), listed by hand like the
// agent's: an account's default first. ChatGPT by its plan is left out until a
// third-party app is known to be allowed; a Claude account has none.
import { type AgentAccount, accountOf } from "./ipc";

export type ImageAccount = Extract<AgentAccount, "gemini" | "vertex" | "openai">;
export const IMAGE_ACCOUNTS: readonly ImageAccount[] = ["gemini", "vertex", "openai"];

/** A model that generates images: its id is its account's, then its own ("gemini/gemini-nano-banana-2.1"). */
export type ImageModelChoice = { id: string; name: string; account: ImageAccount; default?: boolean };

export const IMAGE_MODELS: ImageModelChoice[] = [
  { id: "gemini/gemini-nano-banana-2.1", name: "Nano Banana 2.1", account: "gemini", default: true },
  { id: "gemini/gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image", account: "gemini" },
  { id: "vertex/gemini-nano-banana-2.1", name: "Nano Banana 2.1", account: "vertex", default: true },
  { id: "vertex/gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image", account: "vertex" },
  { id: "openai/gpt-image-2", name: "GPT Image 2", account: "openai", default: true },
];

/** The shapes an image is generated in: square, landscape, portrait, wide, tall, banner. */
export const IMAGE_ASPECTS = ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"] as const;
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

/** Whether an account generates images. */
export const generatesImages = (account: string): account is ImageAccount =>
  (IMAGE_ACCOUNTS as readonly string[]).includes(account);

/**
 * The model that generates a website's images (Q427): the settings' choice if
 * its account is connected; else, Automatic, the default of the website's own
 * account if it generates images, else of the first connected account that
 * does. None when no such account is connected.
 */
export function imageModelFor(setting: string, websiteModel: string, connected: string[]): string | undefined {
  const offered = IMAGE_MODELS.filter((m) => connected.includes(m.account));
  if (setting !== "auto" && offered.some((m) => m.id === setting)) return setting;
  const own = accountOf(websiteModel);
  const account = generatesImages(own) && connected.includes(own) ? own : offered[0]?.account;
  if (!account) return undefined;
  return (offered.find((m) => m.account === account && m.default) ?? offered.find((m) => m.account === account))?.id;
}
