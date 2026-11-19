import { describe, expect, test } from "vitest";
import type { Effort } from "../../shared/ipc";
import { CLAUDE_MODELS, claudeChoices, claudeModelName, claudeReplacement, familyOf } from "./claude-models";

const info = (id: string, efforts: Effort[] = ["low", "medium", "high"]) => ({
  value: id,
  resolvedModel: id,
  displayName: id,
  description: "",
  supportedEffortLevels: efforts,
});

describe("the Claude models offered (Q398)", () => {
  test("the two latest versions of each family, newest first", () => {
    const families = [...new Set(CLAUDE_MODELS.map((m) => familyOf(m.id)))];
    expect(families).toEqual(["opus", "sonnet", "haiku", "fable"]);
    for (const family of families) expect(CLAUDE_MODELS.filter((m) => familyOf(m.id) === family)).toHaveLength(2);
  });

  test("of those listed, the ones the binary offers, in the list's order, with its efforts", () => {
    const choices = claudeChoices([
      { value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default", description: "" },
      info("claude-sonnet-5-5", ["low", "max"]),
      info("claude-opus-4-8"),
      info("claude-opus-5-5"),
      info("claude-haiku-4-5-20251001", []),
    ]);
    expect(choices).toEqual([
      { id: "claude-opus-5-5", name: "Opus 5.5", efforts: ["low", "medium", "high"], account: "claude" },
      { id: "claude-sonnet-5-5", name: "Sonnet 5.5", efforts: ["low", "max"], account: "claude" },
      { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5", efforts: [], account: "claude" },
    ]);
  });

  test("names, from the list or the identifier", () => {
    expect(claudeModelName("claude-fable-5-2")).toBe("Fable 5.2");
    expect(claudeModelName("claude-opus-4-8")).toBe("Opus 4.8");
    expect(claudeModelName("claude-opus-5")).toBe("Opus 5");
    expect(claudeModelName("claude-haiku-3-5-20241022")).toBe("Haiku 3.5");
  });
});

describe("a model taken off the list (Q399)", () => {
  test("gives way to the latest of its family", () => {
    expect(claudeReplacement("claude-opus-4-8")).toBe("claude-opus-5-5");
    expect(claudeReplacement("claude-sonnet-4-6")).toBe("claude-sonnet-5-5");
    expect(claudeReplacement("claude-fable-5")).toBe("claude-fable-5-2");
    expect(claudeReplacement("claude-mystery-9")).toBe("claude-opus-5-5");
  });

  test("a listed model, or another account's, stays", () => {
    expect(claudeReplacement("claude-opus-5")).toBeUndefined();
    expect(claudeReplacement("openai/gpt-6.1-sol")).toBeUndefined();
  });
});
