import { expect, test } from "vitest";
import { BASIC, checksFor, words } from "./changed.ts";

const CHECKS = [
  "agent-gallery.e2e.ts",
  "export.e2e.ts",
  "gallery.e2e.ts",
  "media.e2e.ts",
  "preview.e2e.ts",
  "screens-sheet.e2e.ts",
  "shell.e2e.ts",
  "skills.e2e.ts",
  "start.e2e.ts",
  "templates-again.e2e.ts",
  "theme-palettes.e2e.ts",
  "theme.e2e.ts",
];
const IMPORTS: Record<string, string[]> = {
  "gallery.e2e.ts": ["app.ts"],
  "media.e2e.ts": ["app.ts", "real-maker.ts"],
  "export.e2e.ts": ["design-variety.ts"],
  "real-maker.ts": ["sheet.ts"],
};
const imports = (file: string) => IMPORTS[file] ?? [];
const run = (...changed: string[]) => checksFor(changed, CHECKS, imports);

test("a path's words: lowercase, singular, split at capitals, dashes and dots, generic ones left out", () => {
  expect(words("apps/desktop/src/renderer/components/ThemeTab.tsx")).toEqual(["theme", "tab"]);
  expect(words("templates-again")).toEqual(["template", "again"]);
  expect(words("libraries")).toEqual(["library"]);
});

test("a block of the gallery runs the gallery's checks, not the checks its kind's name happens to share (Q446)", () => {
  expect(run("apps/desktop/gallery/hero/hero-split-screen/block.liquid")).toEqual([
    "agent-gallery.e2e.ts",
    "gallery.e2e.ts",
  ]);
  expect(run("apps/desktop/templates")).toEqual(["templates-again.e2e.ts"]);
  // The app's Markdown is the app: a skill, a block's sample records.
  expect(run("apps/desktop/skills/web-design/SKILL.md")).toEqual(["skills.e2e.ts"]);
  expect(run("apps/desktop/gallery/team/team-grid/data/ada.md")).toEqual(["agent-gallery.e2e.ts", "gallery.e2e.ts"]);
});

test("a file of the app runs the checks named after its folder or its own name", () => {
  expect(run("apps/desktop/src/renderer/components/ThemeTab.tsx")).toEqual(["theme-palettes.e2e.ts", "theme.e2e.ts"]);
  expect(run("apps/desktop/src/main/export.ts")).toEqual(["export.e2e.ts"]);
  expect(run("apps/desktop/src/main/media/library.ts")).toEqual(["media.e2e.ts"]);
});

test("a file of the app no check is named after runs the basic checks, as does a change of dependencies", () => {
  expect(run("apps/desktop/src/main/ipc.ts")).toEqual(BASIC.filter((c) => CHECKS.includes(c)).sort());
  expect(run("pnpm-lock.yaml")).toEqual(["preview.e2e.ts", "shell.e2e.ts", "start.e2e.ts"]);
});

test("a check runs when it changed, and every check importing a helper that changed, even through another helper", () => {
  expect(run("e2e/export.e2e.ts")).toEqual(["export.e2e.ts"]);
  expect(run("e2e/app.ts")).toEqual(["gallery.e2e.ts", "media.e2e.ts"]);
  expect(run("e2e/sheet.ts")).toEqual(["media.e2e.ts"]);
});

test("documents, unit tests, the CI's files and the runs' pictures run no check", () => {
  expect(
    run(
      "docs/v2.0-decisions.md",
      "apps/desktop/src/main/gallery/search.test.ts",
      "apps/desktop/gallery/README.md",
      "apps/desktop/gallery/LICENSE-HyperUI",
      ".github/workflows/ci.yml",
      "e2e/.runs/agent-design/sheet-desktop-1.png",
    ),
  ).toEqual([]);
});
