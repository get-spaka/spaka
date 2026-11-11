import { expect, test } from "vitest";
import { AgentNotes } from "./notes";

test("the agent is told once what the maker changed by hand, and of a return to an earlier version", () => {
  const notes = new AgentNotes();
  expect(notes.take()).toBeUndefined();
  notes.changed({ label: "Text changed", files: ["pages/index.liquid"] });
  notes.changed({ label: "Section moved", files: ["pages/index.liquid"] });
  expect(notes.take()).toBe(
    "[Upstart: since your last turn the maker changed by hand: text changed (pages/index.liquid); section moved (pages/index.liquid). The files may differ from what you remember: read a file again before editing it.]",
  );
  expect(notes.take()).toBeUndefined();
  notes.changed({ label: "Deleted", files: ["parts/hero.liquid"] });
  notes.restored("A bakery");
  notes.changed({ label: "Duplicated", files: ["pages/index.liquid", "parts/hero-2.liquid"] });
  expect(notes.take()).toContain(
    `back to an earlier version (the one after "A bakery"); since then the maker changed by hand: duplicated (pages/index.liquid, parts/hero-2.liquid).`,
  );
});
