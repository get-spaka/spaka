// The models of Upstart's own harness (Q269, Q270, Q280): ChatGPT Plus or Pro
// through Sign in with ChatGPT, an OpenAI key, a Gemini key, and Vertex AI on
// a key of its express mode or gcloud's sign-in. A project's model
// id carries its account ("chatgpt/gpt-6.1-terra"); an id without one is
// Claude's, as every project had before the harness.
import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { clampThinkingLevel, getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { GOOGLE_MODELS } from "@earendil-works/pi-ai/providers/google.models";
import { GOOGLE_VERTEX_MODELS } from "@earendil-works/pi-ai/providers/google-vertex.models";
import { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";
import { accountOf, type Effort } from "../../../shared/ipc";
import config from "./models.json";

export const PI_ACCOUNTS = ["chatgpt", "openai", "gemini", "vertex"] as const;
export type PiAccount = (typeof PI_ACCOUNTS)[number];
/** Which instructions a model gets: Gemini writes long files in parts (Q273). */
export type PiFamily = "openai" | "gemini";

/**
 * One model of models.json. One that pi-ai's catalog does not have yet is
 * declared `like` one it has: that one's API, address and thinking levels,
 * with the prices models.dev lists for it.
 */
type Configured = { id: string; name: string; like?: string; cost?: Model<Api>["cost"] };
type Offered = Configured & { account: PiAccount };

/**
 * The models Upstart offers per account, from models.json, in its order: the
 * first of an account is its default (Q270, Q383-Q386).
 */
export const PI_MODELS: Offered[] = PI_ACCOUNTS.flatMap((account) =>
  (config as Record<PiAccount, Configured[]>)[account].map((m) => ({ ...m, account })),
);

export const piModelId = (account: PiAccount, id: string) => `${account}/${id}`;

/** A project's model id read: its account and the provider's model id, or Claude's. */
export function parseModelId(id: string): { account: "claude"; model: string } | { account: PiAccount; model: string } {
  const account = accountOf(id);
  return account === "claude" ? { account, model: id } : { account, model: id.slice(account.length + 1) };
}

/**
 * Gemini on a Gemini API key writes long files in parts; on Vertex AI its
 * call's arguments stream to the preview as OpenAI's do, so it gets OpenAI's
 * instructions and tools (Q280).
 */
export const familyOf = (account: PiAccount): PiFamily => (account === "gemini" ? "gemini" : "openai");

const CATALOGS: Record<PiAccount, Record<string, Model<Api>>> = {
  chatgpt: OPENAI_MODELS as Record<string, Model<Api>>,
  openai: OPENAI_MODELS as Record<string, Model<Api>>,
  gemini: GOOGLE_MODELS as Record<string, Model<Api>>,
  vertex: GOOGLE_VERTEX_MODELS as Record<string, Model<Api>>,
};

/**
 * The provider's model for an account's model id: as models.json declares it,
 * or, for a model no longer offered that a project still names, as pi-ai has it.
 */
export function piModel(account: PiAccount, id: string): Model<Api> | undefined {
  const catalog = CATALOGS[account];
  const offered = PI_MODELS.find((m) => m.account === account && m.id === id);
  if (!offered) return catalog[id];
  const base = catalog[offered.like ?? id];
  if (!base) return undefined;
  return { ...base, id, name: offered.name, ...(offered.cost ? { cost: offered.cost } : {}) };
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
