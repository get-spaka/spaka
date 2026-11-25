import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { findGitBash } from "../git-bash";
import { instructionsFor } from "../instructions";
import { spakaTools } from "../spaka-tools";
import { canonicalTool, type HarnessTool, piFileTools, piSpakaTools } from "./tools";
import { pageMarkdown } from "./web-fetch";

let dir: string;
let root: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "spaka-tools-"));
  root = join(dir, "site");
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(dir, "skills/spaka/skills/datasources"), { recursive: true });
  writeFileSync(join(dir, "skills/spaka/skills/datasources/SKILL.md"), "# Datasources\n");
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
  expect(await call("Read", { file_path: "pages/menu.liquid", offset: 2 })).toBe("     2\t<p>Tarte</p>");
  expect(await call("Read", { file_path: join(dir, "skills/spaka/skills/datasources/SKILL.md") })).toBe(
    "     1\t# Datasources\n     2\t",
  );
  await expect(call("Read", { file_path: "../secret.txt" })).rejects.toThrow(/outside the project/);
  await expect(call("Write", { file_path: join(dir, "skills/spaka/x.md"), content: "x" })).rejects.toThrow(
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
  await call("Read", { file_path: "pages/index.liquid" });
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
  expect(await call("Grep", { pattern: "\\$&B", glob: "*.liquid", output_mode: "content" })).toBe(
    "pages/index.liquid:3:<p>$&B</p>",
  );
  expect(await call("Grep", { pattern: "\\$&B" })).toBe("Found 1 file\npages/index.liquid");
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
  const spaka = piSpakaTools(
    spakaTools({
      look: async () => ({ route: "/", errors: [], notes: [] }),
      findBlocks: () => [],
      findImages: async () => "",
      useImage: async () => "",
      useBlocks: () => "",
      choosePages: async () => "",
    }),
  );
  expect(Object.fromEntries(spaka.map((t) => [t.name, t.executionMode]))).toMatchObject({
    find_images: "parallel",
    use_image: "sequential",
    use_block: "sequential",
  });
});

test("Spaka's tools keep their short names for the model, and the SDK's names for the app", async () => {
  const defs = spakaTools({
    look: async () => ({ route: "/", errors: [], notes: [] }),
    findBlocks: () => [],
    findImages: async (q) => `images of ${q}`,
    useImage: async () => "",
    useBlocks: () => "",
    choosePages: async () => "",
  });
  const harness = piSpakaTools(defs);
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
  // A look takes a screen and steps (Q315, Q317), each step read before the look.
  const look = harness.find((t) => t.name === "look_at_preview")!;
  const props = (look.parameters as { properties: Record<string, { enum?: string[]; items?: unknown }> }).properties;
  expect(Object.keys(props)).toEqual(["route", "screen", "steps", "at", "fresh"]);
  expect(props.screen!.enum).toEqual(["desktop", "tablet", "phone"]);
  expect(props.steps!.items).toMatchObject({
    properties: { action: { enum: ["hover", "click", "scroll", "press", "type"] } },
    required: ["action"],
  });
  expect((await look.execute("id", { steps: [{ action: "press", key: "F13" }] })).content).toEqual([
    { type: "text", text: 'Step 1: the key "F13" is not one Spaka can press.' },
  ]);
  expect((await look.execute("id", { route: "/" })).content).toEqual([
    { type: "text", text: "Page: /.\n\nNo errors in the page." },
  ]);
  const spaka = new Set(defs.map((d) => d.name));
  expect(canonicalTool("look_at_preview", spaka)).toBe("mcp__spaka__look_at_preview");
  expect(canonicalTool("Write", spaka)).toBe("Write");
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
  // A provider without a search of its own: WebFetch alone is named (Q417).
  const without = instructionsFor("short", "openai", [], false);
  expect(without).not.toContain("WebSearch");
  expect(without).toContain("WebFetch reads it (this model has no web search)");
  expect(without).toContain("never another site's texts");
});

test("a page as rough Markdown: its title, headings, links and lists, without its scripts", () => {
  expect(
    pageMarkdown(
      '<html><head><title>Fleur &amp; Loire</title></head><body><script>x()</script><h1>Bouquets</h1><p>Du <b>jour</b>, <a href="/carte">la carte</a></p><ul><li>Roses</li><li>Pivoines</li></ul></body></html>',
      new URL("https://fleur.example/"),
    ),
  ).toBe(
    "# Fleur & Loire\n\n# Bouquets\n\nDu **jour**, [la carte](https://fleur.example/carte)\n\n- Roses\n- Pivoines",
  );
});

/** Git Bash on Windows (on CI's runners too); bash elsewhere, to run the same way. */
const bash = process.platform === "win32" ? findGitBash() : "/bin/bash";

test.skipIf(!bash)(
  "with Git Bash and its gate (Q382): file commands run at once, others wait for the maker",
  async () => {
    const asked: string[] = [];
    let refusal: string | undefined = "The maker did not run this command.";
    const list = piFileTools({
      root,
      readable: [],
      family: "openai",
      shell: {
        place: { projectDir: root, readable: [], bash },
        env: () => ({ ...process.env }) as Record<string, string>,
        gate: async (_id, command) => {
          asked.push(command);
          return refusal;
        },
      },
    });
    const run = async (command: string) => {
      const result = await list.find((t) => t.name === "Bash")!.execute("id", { command });
      return result.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    };
    writeFileSync(join(root, "pages/old.liquid"), "x");
    expect(await run("rm -f pages/old.liquid && ls pages")).toBe("(no output)");
    expect(asked).toEqual([]);
    await expect(run("echo hi > pages/new.liquid")).rejects.toThrow("The maker did not run this command.");
    expect(asked).toEqual(["echo hi > pages/new.liquid"]);
    refusal = undefined;
    expect(await run("echo hi > pages/new.liquid && cat pages/new.liquid")).toBe("hi");
    expect(asked).toHaveLength(2);
  },
);

test("generate_image is among Spaka's tools only with an account that generates images, and plan mode refuses it (Q423)", async () => {
  const base = {
    look: async () => ({ route: "/", errors: [], notes: [] }),
    findBlocks: () => [],
    findImages: async () => "",
    useImage: async () => "",
    useBlocks: () => "",
    choosePages: async () => "",
  };
  expect(spakaTools(base).map((d) => d.name)).not.toContain("generate_image");
  const asked: unknown[] = [];
  const defs = spakaTools({
    ...base,
    generateImage: async (input) => {
      asked.push(input);
      return "Generated and added as /media/linen.webp";
    },
  });
  const tool = piSpakaTools(defs).find((t) => t.name === "generate_image")!;
  expect(tool.executionMode).toBe("sequential");
  const result = await tool.execute("id", { prompt: "Linen", aspect: "16:9", name: "linen", alt: "Lin" });
  expect(result.content).toEqual([{ type: "text", text: "Generated and added as /media/linen.webp" }]);
  expect(asked).toEqual([{ prompt: "Linen", aspect: "16:9", name: "linen", alt: "Lin" }]);
  await expect(tool.execute("id", { prompt: "x", aspect: "2:1", name: "a", alt: "" })).rejects.toThrow();
  const { PLAN_WRITERS, readsOnly } = await import("../questions");
  expect(PLAN_WRITERS.has("mcp__spaka__generate_image")).toBe(true);
  expect(readsOnly("mcp__spaka__generate_image")).toBe(false);
});
