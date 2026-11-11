import { expect, test } from "vitest";
import { blocksAnswer } from "./preview-tool";

const block = {
  id: "pricing-three-tiers",
  kind: "pricing" as const,
  name: "Three tiers",
  description: "Three plans side by side.",
  tags: [],
  mood: [],
  synonyms: [],
  source: "<section>\n  <h2>Pricing</h2>\n</section>\n",
};

test("find_blocks answers with each block's template and how to use it", () => {
  const text = blocksAnswer([block], "plans");
  expect(text).toMatch(/^1 block of the gallery\. To use one, write it as a shared part/);
  expect(text).toContain("## Three tiers (pricing, id pricing-three-tiers)\nThree plans side by side.");
  expect(text).toContain("```liquid\n<section>\n  <h2>Pricing</h2>\n</section>\n```");
});

test("with nothing found, the agent is told to write the section itself", () => {
  expect(blocksAnswer([], "a map", "faq")).toBe(
    'No block of the gallery matches "a map" among the faq blocks. Write the section yourself.',
  );
});
