import { expect, test } from "vitest";
import { type AgentStatus, type ModelChoice, usableModel } from "./ipc";

const model = (id: string, account: ModelChoice["account"], isDefault = false): ModelChoice => ({
  id,
  name: id,
  efforts: ["low", "medium", "high"],
  account,
  ...(isDefault ? { default: true } : {}),
});

const status = (auth: AgentStatus["auth"], accounts: Partial<AgentStatus["accounts"]>, models: ModelChoice[]) =>
  ({
    auth,
    hasApiKey: false,
    accounts: { chatgpt: false, openai: false, gemini: false, vertex: false, ...accounts },
    models,
  }) as AgentStatus;

const claude = [model("claude-opus-5-5", "claude"), model("claude-sonnet-5-5", "claude")];
const openai = [model("openai/gpt-6.1-terra", "openai"), model("openai/gpt-6.2-sol", "openai", true)];
const gemini = [model("gemini/gemini-4-hydrogen", "gemini"), model("gemini/gemini-4-neon", "gemini", true)];

test("a new website gets the model asked for when its account is connected", () => {
  expect(usableModel(status("signed-in", {}, claude), "claude-opus-5-5")).toBe("claude-opus-5-5");
  expect(usableModel(status("signed-out", { openai: true }, openai), "openai/gpt-6.1-terra")).toBe(
    "openai/gpt-6.1-terra",
  );
});

test("otherwise the default of the first connected account, else its first model (Q413-Q414)", () => {
  expect(usableModel(status("signed-out", { openai: true }, openai), "claude-opus-5-5")).toBe("openai/gpt-6.2-sol");
  expect(usableModel(status("signed-out", { gemini: true }, gemini), "claude-opus-5-5")).toBe("gemini/gemini-4-neon");
  expect(usableModel(status("signed-out", { openai: true, gemini: true }, [...openai, ...gemini]), "claude-x")).toBe(
    "openai/gpt-6.2-sol",
  );
  expect(usableModel(status("signed-in", {}, claude), "gemini/gemini-4-neon")).toBe("claude-opus-5-5");
  expect(usableModel(status("signed-out", {}, []), "claude-opus-5-5")).toBe("claude-opus-5-5");
});
