import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { History, published, tracked } from "./history";

let project: string;
let data: string;
const write = (path: string, content: string) => {
  mkdirSync(join(project, path, ".."), { recursive: true });
  writeFileSync(join(project, path), content);
};
const read = (path: string) => readFileSync(join(project, path), "utf8");

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "spaka-history-p-"));
  data = mkdtempSync(join(tmpdir(), "spaka-history-d-"));
});
afterEach(() => {
  rmSync(project, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
});

test("a snapshot after each turn, only when something changed, each content stored once", () => {
  const history = new History(data, project);
  expect(history.snapshot("start", "")).toBeUndefined();
  write("theme.css", ":root{}");
  write("pages/index.liquid", "<h1>A</h1>");
  write(".spaka/project.json", "{}");
  const first = history.snapshot("turn", "A bakery")!;
  expect(Object.keys(first.files).sort()).toEqual(["pages/index.liquid", "theme.css"]);
  expect(history.snapshot("turn", "nothing")).toBeUndefined();
  write("pages/index.liquid", "<h1>B</h1>");
  write("pages/copy.liquid", ":root{}");
  history.snapshot("turn", "B");
  expect(history.list().map((s) => s.label)).toEqual(["A bakery", "B"]);
  // ":root{}" twice, two versions of the page: three contents.
  expect(readdirSync(join(data, "history/objects"))).toHaveLength(3);
  // Kept across launches.
  expect(new History(data, project).list()).toHaveLength(2);
});

test("going back restores the files and adds a snapshot; undo goes to the one before", () => {
  const history = new History(data, project);
  write("pages/index.liquid", "<h1>A</h1>");
  const a = history.snapshot("turn", "A")!;
  write("pages/index.liquid", "<h1>B</h1>");
  write("pages/menu/index.liquid", "<h1>Menu</h1>");
  history.snapshot("turn", "B");
  expect(history.undoTarget()?.id).toBe(a.id);

  const back = history.restore(a.id);
  expect(read("pages/index.liquid")).toBe("<h1>A</h1>");
  expect(existsSync(join(project, "pages/menu"))).toBe(false);
  expect(back).toMatchObject({ kind: "restore", label: "A", from: a.id });
  expect(history.list().map((s) => s.kind)).toEqual(["turn", "turn", "restore"]);
  // Undoing the restore brings B back.
  history.restore(history.undoTarget()!.id);
  expect(read("pages/menu/index.liquid")).toBe("<h1>Menu</h1>");
});

test("changes made by hand are kept before going back", () => {
  const history = new History(data, project);
  write("theme.css", "a");
  const a = history.snapshot("turn", "A")!;
  write("theme.css", "by hand");
  expect(history.undoTarget()?.id).toBe(a.id);
  history.restore(a.id);
  expect(history.list().map((s) => s.kind)).toEqual(["turn", "outside", "restore"]);
  expect(read("theme.css")).toBe("a");
  expect(tracked("node_modules/x.js")).toBe(false);
  expect(tracked(".git/HEAD")).toBe(false);
  // The preview's test records are kept; the rest of Spaka's folder is not (Q172).
  expect(tracked(".spaka/test-records/guestbook/2026-11-12-0931-a7f3.md")).toBe(true);
  expect(tracked(".spaka")).toBe(true);
  expect(tracked(".spaka/project.json")).toBe(false);
  expect(tracked(".spaka/test-records/guestbook/.x.spaka-tmp")).toBe(false);
  expect(published(".spaka/test-records/guestbook/a.md")).toBe(false);
  expect(published(".spaka")).toBe(false);
  expect(published("pages/index.liquid")).toBe(true);
});

test("a file as the agent first wrote it, whatever came after", () => {
  const history = new History(data, project);
  write("pages/index.liquid", "<h1>A</h1>");
  history.snapshot("turn", "A bakery");
  expect(history.firstByAgent("theme.css")).toBeUndefined();
  write("theme.css", ":root{--a:1}");
  history.snapshot("turn", "Colours");
  write("theme.css", ":root{--a:2}");
  history.snapshot("hand", "Theme changed");
  write("theme.css", ":root{--a:3}");
  history.snapshot("turn", "Darker");
  expect(history.firstByAgent("theme.css")).toBe(":root{--a:1}");
});
