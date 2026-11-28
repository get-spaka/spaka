import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ignorePackages, prepareProject } from "./project";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "spaka-project-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const read = (name: string) => readFileSync(join(dir, name), "utf8");

test("a project without package.json gets one, an ES module, and an .ignore for its packages, with nothing to tell", () => {
  expect(prepareProject(dir)).toEqual([]);
  expect(JSON.parse(read("package.json"))).toEqual({ private: true, type: "module" });
  expect(read(".ignore")).toMatch(/^node_modules\/$/m);
});

test("the project's .npmrc is removed and devEngines taken out, and the agent is told", () => {
  writeFileSync(join(dir, ".npmrc"), "//registry.npmjs.org/:_authToken=x\n");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "site",
      devEngines: { runtime: { name: "node", version: "18.0.0" } },
      dependencies: { motion: "12.0.0" },
    }),
  );
  const notes = prepareProject(dir);
  expect(notes).toHaveLength(3);
  expect(notes[0]).toMatch(/Removed the project's \.npmrc/);
  expect(notes[1]).toMatch(/Removed "devEngines"/);
  expect(notes[2]).toMatch(/"type": "module"/);
  expect(existsSync(join(dir, ".npmrc"))).toBe(false);
  // The maker's order kept, type added at the end.
  expect(Object.keys(JSON.parse(read("package.json")))).toEqual(["name", "dependencies", "type"]);
});

test("a package.json already right is left as it is", () => {
  const text = '{ "type": "module", "dependencies": {} }';
  writeFileSync(join(dir, "package.json"), text);
  expect(prepareProject(dir)).toEqual([]);
  expect(read("package.json")).toBe(text);
});

test("a package.json that is not a JSON object stops the install, saying why", () => {
  writeFileSync(join(dir, "package.json"), "{ nope");
  expect(() => prepareProject(dir)).toThrow(/package\.json is not valid JSON/);
  writeFileSync(join(dir, "package.json"), "[]");
  expect(() => prepareProject(dir)).toThrow(/does not hold a JSON object/);
});

test("node_modules is added to an .ignore of the maker's once, keeping what it lists", () => {
  writeFileSync(join(dir, ".ignore"), "drafts/");
  ignorePackages(dir);
  ignorePackages(dir);
  expect(read(".ignore")).toBe("drafts/\nnode_modules/\n");
  writeFileSync(join(dir, ".ignore"), "/node_modules\n");
  ignorePackages(dir);
  expect(read(".ignore")).toBe("/node_modules\n");
});
