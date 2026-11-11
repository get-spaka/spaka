import { expect, test } from "vitest";
import { searchSettings } from "./settings-search";

const ids = (query: string) => searchSettings(query)?.map((e) => `${e.page}/${e.id}`);

test("nothing typed finds no filter at all", () => {
  expect(searchSettings("  ")).toBeNull();
});

test("a setting is found by the start of its words, in English or French, accents aside", () => {
  expect(ids("mod")).toEqual(["agent/model"]);
  expect(ids("cle")).toEqual(["agent/api-key"]);
  expect(ids("statist")).toEqual(["privacy/statistics"]);
  expect(ids("finder")).toEqual(["general/folder"]);
});

test("a category's name finds all its settings; every word typed must match", () => {
  expect(ids("agent")).toEqual(["agent/account", "agent/api-key", "agent/model", "agent/effort"]);
  expect(ids("agent opus")).toEqual(["agent/model"]);
  expect(ids("zzz")).toEqual([]);
});
