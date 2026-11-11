import { expect, test } from "vitest";
import { matchesBlock } from "./block-filter";
import type { GalleryBlock } from "./ipc";

const pricing: GalleryBlock = {
  id: "pricing-three-tiers",
  kind: "pricing",
  name: "Three pricing tiers",
  description: "Three cards, the middle one highlighted.",
  tags: ["plans"],
  synonyms: ["tarifs", "abonnements"],
  mood: ["clean"],
};

test("every word typed begins a word of the block, in either language, accents and case aside", () => {
  expect(matchesBlock(pricing, "")).toBe(true);
  expect(matchesBlock(pricing, "pri")).toBe(true);
  expect(matchesBlock(pricing, "Tarif")).toBe(true);
  expect(matchesBlock(pricing, "three plans")).toBe(true);
  expect(matchesBlock(pricing, "three faq")).toBe(false);
  expect(matchesBlock(pricing, "iers")).toBe(false);
  expect(matchesBlock(pricing, "prix", ["Prix"])).toBe(true);
  expect(matchesBlock({ ...pricing, synonyms: ["thème épuré"] }, "epure")).toBe(true);
});
