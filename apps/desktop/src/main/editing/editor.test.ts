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
