import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { dataProblemsAfter } from "./data-check";

test("a record that does not read is said right after it is written; the others are not (Q170)", () => {
  const root = mkdtempSync(join(tmpdir(), "data-check-"));
  mkdirSync(join(root, "data/posts"), { recursive: true });
  writeFileSync(
    join(root, "data/posts/_datasource.yaml"),
    "fields:\n  - name: title\n    kind: text\n    required: true\n  - name: summary\n    kind: text\n",
  );
  writeFileSync(join(root, "data/posts/ok.md"), "---\ntitle: Fine\n---\n");
  writeFileSync(join(root, "data/posts/noel.md"), "---\ntitle: Noël\nsummary: Festive loaves: the menu is here\n---\n");
  writeFileSync(join(root, "data/posts/untitled.md"), "---\nsummary: x\n---\n");
  const note = dataProblemsAfter(root, "Write", { file_path: join(root, "data/posts/noel.md") });
  expect(note).toMatch(
    /^Upstart could not use what you just wrote:\n- data\/posts\/noel\.md is left out of the site: /,
  );
  expect(note).not.toContain("untitled");
  expect(dataProblemsAfter(root, "Write", { file_path: join(root, "data/posts/ok.md") })).toBeUndefined();
  expect(dataProblemsAfter(root, "Edit", { file_path: join(root, "pages/index.liquid") })).toBeUndefined();
  // A command may have touched any of them.
  const all = dataProblemsAfter(root, "Bash", { command: "sed -i '' s/a/b/ data/posts/*.md" })!;
  expect(all).toContain("data/posts/noel.md is left out");
  expect(all).toContain("- data/posts/untitled.md: title is required");
  writeFileSync(join(root, "data/posts/_datasource.yaml"), "fields: [unclosed\n");
  expect(dataProblemsAfter(root, "Write", { file_path: join(root, "data/posts/_datasource.yaml") })).toContain(
    "data/posts/_datasource.yaml does not read:",
  );
});

test("a test record that does not read is said too (Q172)", () => {
  const root = mkdtempSync(join(tmpdir(), "data-check-"));
  mkdirSync(join(root, "data/guestbook"), { recursive: true });
  mkdirSync(join(root, ".upstart/test-records/guestbook"), { recursive: true });
  writeFileSync(
    join(root, "data/guestbook/_datasource.yaml"),
    "collected: true\nfields:\n  - name: name\n    kind: text\n    required: true\n",
  );
  const file = join(root, ".upstart/test-records/guestbook/2026-11-12-0931-a7f3.md");
  writeFileSync(file, "---\nname: Claire: from Lyon\n---\n");
  expect(dataProblemsAfter(root, "Write", { file_path: file })).toMatch(
    /- \.upstart\/test-records\/guestbook\/2026-11-12-0931-a7f3\.md is left out of the site: /,
  );
  writeFileSync(file, "---\nname: Claire\n---\n");
  expect(dataProblemsAfter(root, "Write", { file_path: file })).toBeUndefined();
});
