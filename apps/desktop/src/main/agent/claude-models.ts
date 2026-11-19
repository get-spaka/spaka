// The Claude models Upstart offers (Q398): a list kept by hand in
// claude-models.json, the two latest versions of each family, newest first.
// Of them, the maker sees those the official binary says the account can use,
// with the efforts it gives. A website on a model taken off the list moves to
// the latest of its family (Q399).
import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk";
import type { ModelChoice } from "../../shared/ipc";
import listed from "./claude-models.json";

type Listed = { id: string; name: string };

export const CLAUDE_MODELS: readonly Listed[] = listed;

/** A Claude model's family: opus, sonnet, haiku, fable. */
export function familyOf(id: string): string | undefined {
  return /^claude-([a-z]+)-\d/.exec(id)?.[1];
}

/** A Claude model's name, from the list or else from its identifier: claude-opus-4-8 → Opus 4.8. */
export function claudeModelName(id: string): string {
  const known = CLAUDE_MODELS.find((m) => m.id === id);
  if (known) return known.name;
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d))?(?:-\d{8})?$/.exec(id);
  if (!m) return id;
  const family = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
  return `${family} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
}

/** The listed models the binary offers, in the list's order, with the efforts it gives each. */
export function claudeChoices(infos: ModelInfo[]): ModelChoice[] {
  return CLAUDE_MODELS.flatMap((model) => {
    const info = infos.find((i) => i.value !== "default" && (i.resolvedModel ?? i.value) === model.id);
    if (!info) return [];
    return [{ id: model.id, name: model.name, efforts: info.supportedEffortLevels ?? [], account: "claude" as const }];
  });
}

/**
 * The model a website on a Claude model taken off the list moves to: the
 * latest of its family, else the first listed. None for a listed model or
 * another account's.
 */
export function claudeReplacement(id: string): string | undefined {
  if (!id.startsWith("claude-") || CLAUDE_MODELS.some((m) => m.id === id)) return undefined;
  const family = familyOf(id);
  return (CLAUDE_MODELS.find((m) => familyOf(m.id) === family) ?? CLAUDE_MODELS[0])!.id;
}
