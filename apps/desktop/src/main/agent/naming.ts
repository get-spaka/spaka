// A new website's name (Q407, Q408), asked of a small model once the website is
// created: the name drawn from the maker's first sentence shows at once, and
// this one takes its place when it comes, unless the maker renamed the website
// meanwhile. The model is the settings' choice, by default the small model of
// the account the website runs on.
import { type AgentAccount, accountOf } from "../../shared/ipc";

/** The small model of each account: the one that names a website by default. */
export const NAMING_DEFAULTS: Record<AgentAccount, string> = {
  claude: "claude-haiku-5-5",
  gemini: "gemini/gemini-3.8-flash",
  vertex: "vertex/gemini-3.8-flash",
  openai: "openai/gpt-6.1-terra",
  chatgpt: "chatgpt/gpt-6.1-terra",
};

export const NAMING_INSTRUCTIONS =
  "You name websites. Given what a maker wrote about the website they want, answer with a name for it, and nothing else: " +
  "two to five words, in the language they wrote in, the business's or the person's own name if they gave one. " +
  "No quotes, no punctuation at the end, no explanation.";

/**
 * The model that names a website on `websiteModel`, of the models on offer: the
 * settings' choice, else the small model of the website's account, else the
 * website's own model.
 */
export function namingModelFor(setting: string, websiteModel: string, offered: string[]): string | undefined {
  if (setting !== "auto" && offered.includes(setting)) return setting;
  const small = NAMING_DEFAULTS[accountOf(websiteModel)];
  if (offered.includes(small)) return small;
  return offered.includes(websiteModel) ? websiteModel : undefined;
}

/** The name in a model's reply: its first line, without quotes, a label or a final stop; none if it is not a name. */
export function nameFromReply(reply: string | undefined): string | undefined {
  const line = reply
    ?.split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return undefined;
  const name = line
    .replace(/^(name|nom)\s*:\s*/i, "")
    .replace(/^[\s"'“”«»*_`]+|[\s"'“”«»*_`]+$/g, "")
    .replace(/[.!?,;:]+$/, "")
    .trim();
  if (!name || name.length > 60 || name.split(/\s+/).length > 8) return undefined;
  return name;
}
