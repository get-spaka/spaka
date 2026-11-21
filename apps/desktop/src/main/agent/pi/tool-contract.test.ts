// The harness's file tools hold to what the official binary's do (Q433), case
// by case: Claude's are the reference, so that an agent behaves alike
// whatever its provider.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type HarnessTool, numbered, pagesOf, piFileTools } from "./tools";
import { fetchPage, forgetPages } from "./web-fetch";

let dir: string;
let root: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "upstart-contract-"));
  root = join(dir, "site");
  mkdirSync(join(root, "pages"), { recursive: true });
  forgetPages();
});
afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

function tools(over: Partial<Parameters<typeof piFileTools>[0]> = {}) {
  const list = piFileTools({ root, readable: [], family: "openai", ...over });
  const byName = new Map(list.map((t) => [t.name, t]));
  const result = (name: string, input: Record<string, unknown>) =>
    (byName.get(name) as HarnessTool).execute("id", input);
  const call = async (name: string, input: Record<string, unknown>) =>
    (await result(name, input)).content.map((c) => (c.type === "text" ? c.text : `[${c.mimeType}]`)).join("");
  return { byName, call, result };
}

test("Read numbers its lines as cat -n does, cuts a long line, says where to read on", async () => {
  const { call } = tools();
  writeFileSync(join(root, "pages/a.liquid"), ["<h1>A</h1>", "x".repeat(2500), "<p>end</p>"].join("\n"));
  const all = await call("Read", { file_path: "pages/a.liquid" });
  expect(all.split("\n")[0]).toBe("     1\t<h1>A</h1>");
  expect(all.split("\n")[1]).toMatch(/^ {5}2\tx{2000}… \[line cut\]$/);
  expect(await call("Read", { file_path: "pages/a.liquid", limit: 1 })).toBe(
    "     1\t<h1>A</h1>\n[2 more lines: read on with offset 2]",
  );
  expect(await call("Read", { file_path: "pages/a.liquid", offset: 9 })).toMatch(/offset 9 is past its end/);
  writeFileSync(join(root, "pages/empty.liquid"), "");
  expect(await call("Read", { file_path: "pages/empty.liquid" })).toBe("(pages/empty.liquid is empty.)");
  expect(numbered(["a", "b"], 41)).toBe("    41\ta\n    42\tb");
});

test("Read shows a large image brought to 1568 pixels, a small one as it is", async () => {
  const { result } = tools();
  await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#88aa66" } })
    .png()
    .toFile(join(root, "big.png"));
  const big = (await result("Read", { file_path: "big.png" })).content[0] as { data: string; mimeType: string };
  expect(big.mimeType).toBe("image/jpeg");
  expect(await sharp(Buffer.from(big.data, "base64")).metadata()).toMatchObject({ width: 1568, height: 1045 });
  await sharp({ create: { width: 40, height: 30, channels: 4, background: "#0000" } })
    .png()
    .toFile(join(root, "small.png"));
  const small = (await result("Read", { file_path: "small.png" })).content[0] as { data: string; mimeType: string };
  expect(small.mimeType).toBe("image/png");
  expect(Buffer.from(small.data, "base64").equals(readFileSync(join(root, "small.png")))).toBe(true);
});

test("Read reads a PDF's text page by page", async () => {
  const { call } = tools();
  writeFileSync(join(root, "menu.pdf"), pdf(["Menu du jour", "Tarte aux pommes"]));
  const text = await call("Read", { file_path: "menu.pdf" });
  expect(text).toMatch(/--- Page 1 of 2 ---\nMenu du jour/);
  expect(text).toMatch(/--- Page 2 of 2 ---\nTarte aux pommes/);
  expect(await call("Read", { file_path: "menu.pdf", pages: "2" })).toBe("--- Page 2 of 2 ---\nTarte aux pommes");
  expect(pagesOf("1-3,5", 4)).toEqual([1, 2, 3]);
  expect(() => pagesOf("x", 4)).toThrow(/pages reads as/);
});

test("a file is read before it is changed, and read again once someone else changed it (Q294)", async () => {
  const { call } = tools();
  const file = join(root, "pages/index.liquid");
  writeFileSync(file, "<h1>Bakery</h1>\n");
  // Never read: neither replaced nor edited.
  await expect(call("Write", { file_path: "pages/index.liquid", content: "x" })).rejects.toThrow(
    /Read pages\/index.liquid before changing it/,
  );
  await expect(
    call("Edit", { file_path: "pages/index.liquid", old_string: "Bakery", new_string: "Bread" }),
  ).rejects.toThrow(/Read pages\/index.liquid before/);
  // Read: edited, then edited again (its own change is known).
  await call("Read", { file_path: "pages/index.liquid" });
  await call("Edit", { file_path: "pages/index.liquid", old_string: "Bakery", new_string: "Bread" });
  await call("Edit", { file_path: "pages/index.liquid", old_string: "Bread", new_string: "Loaf" });
  // The maker changes it by hand: read again first.
  writeFileSync(file, "<h1>Loaf &amp; Co</h1>\n");
  utimesSync(file, new Date(), new Date(Date.now() + 5000));
  await expect(
    call("Edit", { file_path: "pages/index.liquid", old_string: "Loaf", new_string: "Bun" }),
  ).rejects.toThrow(/changed since you read it[\s\S]*read it again/);
  await call("Read", { file_path: "pages/index.liquid" });
  await call("Edit", { file_path: "pages/index.liquid", old_string: "Loaf", new_string: "Bun" });
  expect(readFileSync(file, "utf8")).toBe("<h1>Bun &amp; Co</h1>\n");
  // A new file needs no read; once written, it is known.
  await call("Write", { file_path: "pages/about.liquid", content: "<p>Hi</p>\n" });
  await call("Edit", { file_path: "pages/about.liquid", old_string: "Hi", new_string: "Hello" });
  await expect(call("Edit", { file_path: "pages/about.liquid", old_string: "x", new_string: "x" })).rejects.toThrow(
    /the same/,
  );
});

test("Gemini's Append continues a file it wrote, not one it has not read", async () => {
  const { call } = tools({ family: "gemini" });
  writeFileSync(join(root, "pages/old.liquid"), "<p>old</p>\n");
  await expect(call("Append", { file_path: "pages/old.liquid", content: "x" })).rejects.toThrow(/Read pages/);
  await call("Write", { file_path: "pages/new.liquid", content: "<header></header>\n" });
  await call("Append", { file_path: "pages/new.liquid", content: "<main></main>\n" });
  await call("Append", { file_path: "pages/new.liquid", content: "<footer></footer>\n" });
  expect(readFileSync(join(root, "pages/new.liquid"), "utf8")).toBe(
    "<header></header>\n<main></main>\n<footer></footer>\n",
  );
});

test("Glob: the most recently changed first, at most 100, .upstart/ when named", async () => {
  const { call } = tools();
  const old = join(root, "pages/old.liquid");
  writeFileSync(old, "");
  utimesSync(old, new Date(2020, 0, 1), new Date(2020, 0, 1));
  writeFileSync(join(root, "pages/new.liquid"), "");
  expect(await call("Glob", { pattern: "pages/*.liquid" })).toBe("pages/new.liquid\npages/old.liquid");
  mkdirSync(join(root, ".upstart/test-records/rsvps"), { recursive: true });
  writeFileSync(join(root, ".upstart/test-records/rsvps/1.md"), "");
  expect(await call("Glob", { pattern: ".upstart/test-records/**/*.md" })).toBe(".upstart/test-records/rsvps/1.md");
  mkdirSync(join(root, "data/many"), { recursive: true });
  for (let i = 0; i < 120; i++) writeFileSync(join(root, `data/many/${i}.md`), "");
  const many = await call("Glob", { pattern: "data/many/*.md" });
  expect(many.split("\n")).toHaveLength(101);
  expect(many).toMatch(/\[20 more: narrow the pattern\]$/);
});

test("Grep: files by default, lines with context, counts, case, types, spans and limits", async () => {
  const { call } = tools();
  writeFileSync(join(root, "pages/index.liquid"), "<h1>Bakery</h1>\n<p>Bread</p>\n<p>bakery hours</p>\n<p>end</p>\n");
  writeFileSync(join(root, "theme.css"), ":root { --bakery: 1 }\n");
  expect(await call("Grep", { pattern: "Bakery" })).toBe("Found 1 file\npages/index.liquid");
  expect(await call("Grep", { pattern: "bakery", "-i": true, output_mode: "count" })).toMatch(
    /^3 matches in 2 files\n/,
  );
  expect(await call("Grep", { pattern: "bakery", "-i": true, type: "css" })).toBe("Found 1 file\ntheme.css");
  expect(await call("Grep", { pattern: "Bread", output_mode: "content", "-C": 1 })).toBe(
    "pages/index.liquid-1-<h1>Bakery</h1>\npages/index.liquid:2:<p>Bread</p>\npages/index.liquid-3-<p>bakery hours</p>",
  );
  expect(await call("Grep", { pattern: "Bread</p>\\s*<p>bakery", multiline: true, output_mode: "content" })).toBe(
    "pages/index.liquid:2:<p>Bread</p>\npages/index.liquid:3:<p>bakery hours</p>",
  );
  expect(await call("Grep", { pattern: "<p>", output_mode: "content", head_limit: 2, "-n": false })).toBe(
    "pages/index.liquid:<p>Bread</p>\npages/index.liquid:<p>bakery hours</p>\n[1 more: narrow the search, or raise head_limit]",
  );
  await expect(call("Grep", { pattern: "(" })).rejects.toThrow(/does not read/);
  await expect(call("Grep", { pattern: "a", type: "cobol" })).rejects.toThrow(/type is one of/);
});

test("Bash takes a timeout of up to 10 minutes", () => {
  const { byName } = tools({ shell: { place: {} as never, env: () => ({}) } });
  const schema = byName.get("Bash")!.parameters as { properties: Record<string, { maximum?: number }> };
  expect(schema.properties.timeout?.maximum).toBe(600_000);
});

test("WebFetch answers its prompt from the page, with the account's small model", async () => {
  const fetched: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    fetched.push(url);
    return new Response("<html><body><h1>Horaires</h1><p>8 h 30 à 18 h</p></body></html>", {
      headers: { "content-type": "text/html" },
    });
  });
  const asked: { page: string; prompt: string }[] = [];
  const { call } = tools({
    summarize: async (page, prompt) => {
      asked.push({ page: page.markdown, prompt });
      return "Ouvert de 8 h 30 à 18 h.";
    },
  });
  expect(await call("WebFetch", { url: "http://jardin.example/horaires", prompt: "Les horaires ?" })).toBe(
    "Ouvert de 8 h 30 à 18 h.\n\n(From https://jardin.example/horaires)",
  );
  expect(fetched).toEqual(["https://jardin.example/horaires"]);
  expect(asked).toEqual([{ page: "# Horaires\n\n8 h 30 à 18 h", prompt: "Les horaires ?" }]);
  // Read again within 15 minutes: not fetched again.
  await call("WebFetch", { url: "https://jardin.example/horaires", prompt: "Le dimanche ?" });
  expect(fetched).toHaveLength(1);
  // Without a small model, the page itself.
  forgetPages();
  expect(await tools().call("WebFetch", { url: "https://jardin.example/horaires", prompt: "?" })).toBe(
    "# Horaires\n\n8 h 30 à 18 h",
  );
});

test("a page that sends to another site is not followed; one that stays on its site is", async () => {
  const pages: Record<string, Response | (() => Response)> = {
    "https://a.example/old": () => new Response(null, { status: 301, headers: { location: "/new" } }),
    "https://a.example/new": () => new Response("plain", { headers: { "content-type": "text/plain" } }),
    "https://a.example/away": () => new Response(null, { status: 302, headers: { location: "https://b.example/x" } }),
  };
  const get = (async (url: string) => (pages[url] as () => Response)()) as typeof fetch;
  expect(await fetchPage("https://a.example/old", undefined, get)).toEqual({
    url: "https://a.example/new",
    markdown: "plain",
  });
  expect(await fetchPage("https://a.example/away", undefined, get)).toEqual({ redirect: "https://b.example/x" });
  await expect(fetchPage("ftp://a.example/", undefined, get)).rejects.toThrow(/https/);
});

/** A small PDF of one line of text a page. */
function pdf(pages: string[]): Buffer {
  const objects: string[] = [];
  const kids = pages.map((_p, i) => `${3 + i * 2} 0 R`).join(" ");
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  const font = 3 + pages.length * 2;
  pages.forEach((text, i) => {
    const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
