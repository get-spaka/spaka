import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { instructionsFor } from "../instructions";
import { upstartTools } from "../upstart-tools";
import { canonicalTool, type HarnessTool, pageText, piFileTools, piUpstartTools } from "./tools";

let dir: string;
let root: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "upstart-tools-"));
  root = join(dir, "site");
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(dir, "skills/upstart/skills/datasources"), { recursive: true });
  writeFileSync(join(dir, "skills/upstart/skills/datasources/SKILL.md"), "# Datasources\n");
  writeFileSync(join(dir, "secret.txt"), "not yours");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function tools(family: "openai" | "gemini" = "openai") {
  const list = piFileTools({ root, readable: [join(dir, "skills")], family });
  const byName = new Map(list.map((t) => [t.name, t]));
  const call = async (name: string, input: Record<string, unknown>) => {
    const tool = byName.get(name) as HarnessTool;
    const result = await tool.execute("id", input);
    return result.content.map((c) => (c.type === "text" ? c.text : `[${c.mimeType}]`)).join("");
  };
  return { names: list.map((t) => t.name), call };
}

test("the file tools reach the project, and Read the skills too; nothing else", async () => {
  const { names, call } = tools();
  expect(names).toEqual(["Read", "Write", "Edit", "Glob", "Grep", "WebFetch"]);
  expect(await call("Write", { file_path: "pages/menu.liquid", content: "<h1>Menu</h1>\n<p>Tarte</p>" })).toBe(
    "Wrote pages/menu.liquid (2 lines).",
  );
  expect(await call("Write", { file_path: join(root, "data/team/emma.md"), content: "---\n---\n" })).toMatch(
    /data\/team\/emma\.md/,
  );
  expect(await call("Read", { file_path: "pages/menu.liquid", offset: 2 })).toBe("<p>Tarte</p>");
  expect(await call("Read", { file_path: join(dir, "skills/upstart/skills/datasources/SKILL.md") })).toBe(
    "# Datasources\n",
  );
  await expect(call("Read", { file_path: "../secret.txt" })).rejects.toThrow(/outside the project/);
  await expect(call("Write", { file_path: join(dir, "skills/upstart/x.md"), content: "x" })).rejects.toThrow(
    /outside the project/,
  );
  await expect(call("Write", { file_path: "/etc/x", content: "x" })).rejects.toThrow(/outside the project/);
  // A link that leads out of the project leads nowhere.
  symlinkSync(dir, join(root, "out"));
  await expect(call("Read", { file_path: "out/secret.txt" })).rejects.toThrow(/outside the project/);
});

test("Edit replaces a text found once; Glob and Grep search the project", async () => {
  const { call } = tools();
  writeFileSync(join(root, "pages/index.liquid"), "<p>A</p>\n<p>A</p>\n<p>B</p>\n");
  await expect(
    call("Edit", { file_path: "pages/index.liquid", old_string: "<p>A</p>", new_string: "<p>C</p>" }),
  ).rejects.toThrow(/appears 2 times/);
  await expect(
    call("Edit", { file_path: "pages/index.liquid", old_string: "<p>Z</p>", new_string: "" }),
  ).rejects.toThrow(/not in/);
  await call("Edit", { file_path: "pages/index.liquid", old_string: "<p>B</p>", new_string: "<p>$&B</p>" });
  await call("Edit", {
    file_path: "pages/index.liquid",
    old_string: "<p>A</p>",
    new_string: "<p>C</p>",
    replace_all: true,
  });
  expect(readFileSync(join(root, "pages/index.liquid"), "utf8")).toBe("<p>C</p>\n<p>C</p>\n<p>$&B</p>\n");
  expect(await call("Glob", { pattern: "pages/*.liquid" })).toBe("pages/index.liquid");
  expect(await call("Grep", { pattern: "\\$&B", glob: "*.liquid" })).toBe("pages/index.liquid:3: <p>$&B</p>");
});

test("Gemini's Append adds the next part of a long file", async () => {
  const { names, call } = tools("gemini");
  expect(names).toContain("Append");
  await call("Write", { file_path: "pages/index.liquid", content: "<header></header>\n" });
  await call("Append", { file_path: "pages/index.liquid", content: "<footer></footer>\n" });
  expect(readFileSync(join(root, "pages/index.liquid"), "utf8")).toBe("<header></header>\n<footer></footer>\n");
});

test("WebSearch is the provider's search, when the model's provider has one", async () => {
  const asked: string[] = [];
  const list = piFileTools({
    root,
    readable: [],
    family: "openai",
    search: async (query) => {
      asked.push(query);
      return "Ouvert de 8 h 30 à 18 h.\n\nSources:\n- nantes.fr: https://nantes.fr/jardin";
    },
  });
  expect(list.map((t) => t.name)).toEqual(["Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch"]);
  const search = list.find((t) => t.name === "WebSearch")!;
  expect(search.executionMode).toBe("parallel");
  const result = await search.execute("id", { query: " horaires du Jardin des Plantes de Nantes " });
  expect(asked).toEqual(["horaires du Jardin des Plantes de Nantes"]);
  expect(result.content).toEqual([{ type: "text", text: expect.stringContaining("Sources:\n- nantes.fr") }]);
  await expect(search.execute("id", { query: " " })).rejects.toThrow(/what to search for/);
});

test("reads run together; a reply that changes the project runs in order", () => {
  const modes = Object.fromEntries(
    piFileTools({ root, readable: [], family: "gemini" }).map((t) => [t.name, t.executionMode]),
  );
  expect(modes).toMatchObject({ Read: "parallel", Grep: "parallel", Write: "sequential", Append: "sequential" });
  const upstart = piUpstartTools(
    upstartTools({
      look: async () => ({ route: "/", errors: [], notes: [] }),
      findBlocks: () => [],
      findImages: async () => "",
      useImage: async () => "",
      useBlocks: () => "",
      choosePages: async () => "",
    }),
  );
  expect(Object.fromEntries(upstart.map((t) => [t.name, t.executionMode]))).toMatchObject({
    find_images: "parallel",
    use_image: "sequential",
    use_block: "sequential",
  });
});

test("Upstart's tools keep their short names for the model, and the SDK's names for the app", async () => {
  const defs = upstartTools({
    look: async () => ({ route: "/", errors: [], notes: [] }),
    findBlocks: () => [],
    findImages: async (q) => `images of ${q}`,
    useImage: async () => "",
    useBlocks: () => "",
    choosePages: async () => "",
  });
  const harness = piUpstartTools(defs);
  expect(harness.map((t) => t.name)).toEqual([
    "find_blocks",
    "use_block",
    "find_images",
    "use_image",
    "choose_pages",
    "look_at_preview",
  ]);
  const images = harness.find((t) => t.name === "find_images")!;
  expect((images.parameters as { required: string[] }).required).toEqual(["query"]);
  expect((await images.execute("id", { query: "roses" })).content).toEqual([{ type: "text", text: "images of roses" }]);
  const upstart = new Set(defs.map((d) => d.name));
  expect(canonicalTool("look_at_preview", upstart)).toBe("mcp__upstart__look_at_preview");
  expect(canonicalTool("Write", upstart)).toBe("Write");
});

test("the harness's instructions: Claude's rules with its own tools, long files in parts for Gemini, skills as files", () => {
  const claude = instructionsFor("short");
  expect(claude).toContain("never MultiEdit");
  const openai = instructionsFor("short", "openai", [
    { name: "datasources", description: "The format.", file: "/s/SKILL.md" },
  ]);
  expect(openai).not.toContain("MultiEdit");
  expect(openai).toContain("WebSearch and WebFetch read it");
  expect(openai).not.toContain("Writing long files");
  expect(openai).toContain("- datasources: The format. (/s/SKILL.md)");
  const gemini = instructionsFor("short", "gemini");
  expect(gemini).toContain("# Writing long files");
  expect(gemini).toContain("then Append with each following 25 lines");
  expect(gemini).not.toContain("# Skills");
});

test("a page's text, without its scripts and tags", () => {
  expect(pageText("<html><script>x()</script><h1>Fleur &amp; Loire</h1><p>Bouquets</p></html>")).toBe(
    "Fleur & Loire\n Bouquets",
  );
});
