import { expect, test } from "vitest";
import { nameFromReply, namingModelFor } from "./naming";

const offered = ["claude-sonnet-5-5", "claude-haiku-5-5", "gemini/gemini-4-hydrogen", "gemini/gemini-3.8-flash"];

test("the setting's model names the website, else the small model of the website's account", () => {
  expect(namingModelFor("gemini/gemini-4-hydrogen", "claude-sonnet-5-5", offered)).toBe("gemini/gemini-4-hydrogen");
  expect(namingModelFor("auto", "claude-sonnet-5-5", offered)).toBe("claude-haiku-5-5");
  expect(namingModelFor("auto", "gemini/gemini-4-hydrogen", offered)).toBe("gemini/gemini-3.8-flash");
  // A chosen model no longer on offer gives way to the account's small one.
  expect(namingModelFor("openai/gpt-6.1-terra", "claude-sonnet-5-5", offered)).toBe("claude-haiku-5-5");
  // Without the small model, the website's own; without either, none.
  expect(namingModelFor("auto", "vertex/gemini-4-hydrogen", ["vertex/gemini-4-hydrogen"])).toBe(
    "vertex/gemini-4-hydrogen",
  );
  expect(namingModelFor("auto", "claude-sonnet-5-5", [])).toBeUndefined();
});

test("the name is the reply's first line, without quotes, a label or a final stop", () => {
  expect(nameFromReply("Fleur de Loire")).toBe("Fleur de Loire");
  expect(nameFromReply('  "Atelier Margot."\n\nA name for a bakery')).toBe("Atelier Margot");
  expect(nameFromReply("Nom : « Les Grimpeurs de Grenoble »")).toBe("Les Grimpeurs de Grenoble");
  expect(nameFromReply("**Terra Lenta**")).toBe("Terra Lenta");
  expect(nameFromReply("")).toBeUndefined();
  expect(nameFromReply(undefined)).toBeUndefined();
  expect(nameFromReply("Here is a name that I think would suit this website very well indeed")).toBeUndefined();
});
