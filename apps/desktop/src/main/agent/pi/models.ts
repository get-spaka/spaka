// The models of Upstart's own harness (Q269, Q270): ChatGPT Plus or Pro
// through Sign in with ChatGPT, an OpenAI key, a Gemini key. A project's model
// id carries its account ("chatgpt/gpt-6.1-terra"); an id without one is
// Claude's, as every project had before the harness.
import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { clampThinkingLevel, getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { GOOGLE_MODELS } from "@earendil-works/pi-ai/providers/google.models";
import { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";
import { accountOf, type Effort } from "../../../shared/ipc";

export const PI_ACCOUNTS = ["chatgpt", "openai", "gemini"] as const;
export type PiAccount = (typeof PI_ACCOUNTS)[number];
/** Which instructions a model gets: Gemini writes long files in parts (Q273). */
export type PiFamily = "openai" | "gemini";

type Offered = { account: PiAccount; id: string; name: string };

/** The models Upstart offers per account, the faster one first, which is the default (Q270). */
export const PI_MODELS: Offered[] = [
  { account: "chatgpt", id: "gpt-6.1-terra", name: "GPT-6.1 Terra" },
  { account: "chatgpt", id: "gpt-6.1-sol", name: "GPT-6.1 Sol" },
  { account: "openai", id: "gpt-6.1-terra", name: "GPT-6.1 Terra" },
  { account: "openai", id: "gpt-6.1-sol", name: "GPT-6.1 Sol" },
  { account: "gemini", id: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen" },
  { account: "gemini", id: "gemini-4-carbon", name: "Gemini 4 Carbon" },
];

export const piModelId = (account: PiAccount, id: string) => `${account}/${id}`;

/** A project's model id read: its account and the provider's model id, or Claude's. */
export function parseModelId(id: string): { account: "claude"; model: string } | { account: PiAccount; model: string } {
  const account = accountOf(id);
  return account === "claude" ? { account, model: id } : { account, model: id.slice(account.length + 1) };
}

export const familyOf = (account: PiAccount): PiFamily => (account === "gemini" ? "gemini" : "openai");

/**
 * Gemini 4 Hydrogen and Carbon are not in pi-ai's catalog yet: declared here
 * after Argon, at the prices Google lists (spike 3).
 */
function geminiModel(id: string): Model<Api> | undefined {
  const argon = GOOGLE_MODELS["gemini-4-argon" as keyof typeof GOOGLE_MODELS] as Model<Api> | undefined;
  if (!argon) return undefined;
  if (id === "gemini-4-hydrogen")
    return {
      ...argon,
      id,
      name: "Gemini 4 Hydrogen",
      cost: { input: 1.5, output: 7.5, cacheRead: 0.075, cacheWrite: 0 },
    };
  if (id === "gemini-4-carbon")
    return { ...argon, id, name: "Gemini 4 Carbon", cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 0 } };
  return (GOOGLE_MODELS as Record<string, Model<Api>>)[id];
}

/** The provider's model for an account's model id. */
export function piModel(account: PiAccount, id: string): Model<Api> | undefined {
  if (account === "gemini") return geminiModel(id);
  return (OPENAI_MODELS as Record<string, Model<Api>>)[id];
}

const EFFORT_LEVELS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** The effort levels a model accepts, as Upstart names them (Q272). */
export function piEfforts(model: Model<Api>): Effort[] {
  const levels = getSupportedThinkingLevels(model) as string[];
  return EFFORT_LEVELS.filter((e) => levels.includes(e));
}

/** The thinking level for an effort; the nearest the model has. */
export function thinkingFor(model: Model<Api>, effort: Effort): ModelThinkingLevel {
  return clampThinkingLevel(model, effort as ModelThinkingLevel);
}
