import { expect, test } from "vitest";
import { searchSettings } from "./settings-search";

const ids = (query: string) => searchSettings(query)?.map((e) => `${e.page}/${e.id}`);

test("nothing typed finds no filter at all", () => {
  expect(searchSettings("  ")).toBeNull();
});

test("a setting is found by the start of its words, in English or French, accents aside", () => {
  expect(ids("mode")).toEqual(["agent/vertex-key", "agent/model"]);
  expect(ids("cle")).toEqual(["agent/api-key", "agent/openai-key", "agent/gemini-key", "agent/vertex-key"]);
  expect(ids("gemini")).toEqual(["agent/gemini-key", "agent/vertex-key", "agent/vertex-gcloud", "agent/model"]);
  expect(ids("gcloud")).toEqual(["agent/vertex-gcloud"]);
  expect(ids("statist")).toEqual(["privacy/statistics"]);
  expect(ids("finder")).toEqual(["general/folder"]);
  expect(ids("font")).toEqual(["general/text-size"]);
  expect(ids("verbose")).toEqual(["general/output-style"]);
  expect(ids("MCP")).toEqual(["connectors/connectors-app"]);
});

test("a category's name finds all its settings; every word typed must match", () => {
  expect(ids("agent")).toEqual([
    "general/output-style",
    "general/notify",
    "agent/reply-style",
    "agent/account",
    "agent/api-key",
    "agent/chatgpt",
    "agent/openai-key",
    "agent/gemini-key",
    "agent/vertex-key",
    "agent/vertex-gcloud",
    "agent/model",
    "agent/effort",
  ]);
  expect(ids("accounts")).toEqual(ids("agent")?.filter((id) => id.startsWith("agent/")));
  expect(ids("agent opus")).toEqual(["agent/model"]);
  expect(ids("zzz")).toEqual([]);
});
