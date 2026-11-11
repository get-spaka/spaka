import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { Editor } from "./editor";
import { EditRefused } from "./edits";

function project() {
  const root = mkdtempSync(join(tmpdir(), "editor-"));
  mkdirSync(join(root, "pages"));
  writeFileSync(join(root, "pages/index.liquid"), "<h1>Home</h1>");
  writeFileSync(join(root, "pages/menu.liquid"), "<h1>Menu</h1>");
  writeFileSync(join(root, "pages/menu-2.liquid"), "<h1>Menu again</h1>");
  const changes: { label: string; files: string[] }[] = [];
  let busy = false;
  const editor = new Editor({
    root: () => root,
    busy: () => busy,
    before: () => {},
    changed: (c) => changes.push(c),
    block: () => undefined,
  });
  return { root, editor, changes, setBusy: (b: boolean) => (busy = b) };
}

test("a page is duplicated at the next free address, told to the agent", () => {
  const { root, editor, changes } = project();
  const result = editor.duplicatePage("pages/menu.liquid");
  expect(result.file).toBe("pages/menu-3.liquid");
  expect(readFileSync(join(root, "pages/menu-3.liquid"), "utf8")).toBe("<h1>Menu</h1>");
  expect(changes).toEqual([{ label: "Page duplicated", files: ["pages/menu-3.liquid"] }]);
});

test("a page is deleted; the home page is kept; nothing while the agent works", () => {
  const { root, editor, changes, setBusy } = project();
  editor.deletePage("pages/menu.liquid", false);
  expect(existsSync(join(root, "pages/menu.liquid"))).toBe(false);
  expect(changes).toEqual([{ label: "Page deleted", files: ["pages/menu.liquid"] }]);
  expect(() => editor.deletePage("pages/index.liquid", true)).toThrow(EditRefused);
  expect(existsSync(join(root, "pages/index.liquid"))).toBe(true);
  expect(() => editor.deletePage("parts/header.liquid", false)).toThrow(EditRefused);
  setBusy(true);
  expect(() => editor.duplicatePage("pages/menu-2.liquid")).toThrow(EditRefused);
});

function withPosts() {
  const p = project();
  mkdirSync(join(p.root, "data/posts"), { recursive: true });
  writeFileSync(
    join(p.root, "data/posts/_datasource.yaml"),
    "label: Posts\nfields:\n  - name: title\n    kind: text\n  - name: date\n    kind: date\n  - name: body\n    kind: markdown\nbody: body\norder: [first, second]\n",
  );
  writeFileSync(join(p.root, "data/posts/first.md"), "---\ntitle: First post\n---\nHello.\n");
  writeFileSync(join(p.root, "data/posts/second.md"), "---\ntitle: Second post\n---\n");
  return p;
}

test("a record's values written at once, one version when the maker leaves it (Q162)", () => {
  const { root, editor, changes, setBusy } = withPosts();
  editor.setRecordValue("data/posts/first.md", "title", "First of all", false);
  editor.setRecordValue("data/posts/first.md", "date", "2026-11-02", false);
  editor.setRecordValue("data/posts/first.md", "body", "New text.", true);
  expect(readFileSync(join(root, "data/posts/first.md"), "utf8")).toBe(
    "---\ntitle: First of all\ndate: 2026-11-02\n---\nNew text.\n",
  );
  expect(changes).toEqual([]);
  // Another record: the first gets its version.
  editor.setRecordValue("data/posts/second.md", "title", "Second", false);
  expect(changes).toEqual([{ label: "Edited First of all", files: ["data/posts/first.md"] }]);
  // Any other edit gives the record being written its version first.
  editor.duplicatePage("pages/menu.liquid");
  expect(changes.map((c) => c.label)).toEqual(["Edited First of all", "Edited Second", "Page duplicated"]);
  expect(editor.leaveRecord()).toBeUndefined();
  setBusy(true);
  expect(() => editor.setRecordValue("data/posts/first.md", "title", "x", false)).toThrow(EditRefused);
  expect(() => editor.setRecordValue("pages/menu.liquid", "title", "x", false)).toThrow(EditRefused);
});

test("a record added with an id from its title, its fields in the definition's order (Q165)", () => {
  const { root, editor, changes } = withPosts();
  const added = editor.addRecord("posts", { date: "2026-11-09", title: "First post", body: "Text." });
  expect(added).toEqual({ file: "data/posts/first-post.md", id: "first-post" });
  expect(readFileSync(join(root, added.file), "utf8")).toBe("---\ntitle: First post\ndate: 2026-11-09\n---\nText.\n");
  editor.setRecordValue(added.file, "title", "First post!", false);
  expect(editor.leaveRecord()).toEqual({ label: "Added First post!", files: ["data/posts/first-post.md"] });
  expect(changes).toHaveLength(1);
  expect(editor.addRecord("posts", {}).id).toBe("untitled");
});

test("records reordered and renamed, the manual order kept", () => {
  const { root, editor, changes } = withPosts();
  editor.reorderRecords("posts", ["second", "first"]);
  expect(readFileSync(join(root, "data/posts/_datasource.yaml"), "utf8")).toContain("order: [second, first]");
  const renamed = editor.renameRecord("data/posts/first.md", "hello");
  expect(renamed.file).toBe("data/posts/hello.md");
  expect(existsSync(join(root, "data/posts/first.md"))).toBe(false);
  expect(readFileSync(join(root, "data/posts/hello.md"), "utf8")).toContain("First post");
  expect(readFileSync(join(root, "data/posts/_datasource.yaml"), "utf8")).toContain("order: [second, hello]");
  expect(changes.map((c) => c.label)).toEqual(["Records reordered", "Record renamed"]);
  expect(() => editor.renameRecord("data/posts/hello.md", "second")).toThrow("Another record already has this id.");
  expect(() => editor.renameRecord("data/posts/hello.md", "_draft")).toThrow(EditRefused);
});
