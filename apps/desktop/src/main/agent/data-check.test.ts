import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { dataProblemsAfter, quoteColons } from "./data-check";

test("a record that does not read is said right after it is written; the others are not (Q170)", () => {
  const root = mkdtempSync(join(tmpdir(), "data-check-"));
  mkdirSync(join(root, "data/posts"), { recursive: true });
  writeFileSync(
    join(root, "data/posts/_datasource.yaml"),
    "fields:\n  - name: title\n    kind: text\n    required: true\n  - name: summary\n    kind: text\n",
  );
  writeFileSync(join(root, "data/posts/ok.md"), "---\ntitle: Fine\n---\n");
  writeFileSync(join(root, "data/posts/noel.md"), "---\ntitle: Noël\nsummary: [Festive loaves\n---\n");
  writeFileSync(join(root, "data/posts/untitled.md"), "---\nsummary: x\n---\n");
  const note = dataProblemsAfter(root, "Write", { file_path: join(root, "data/posts/noel.md") });
  expect(note).toMatch(/^Spaka could not use what you just wrote:\n- data\/posts\/noel\.md is left out of the site: /);
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
  mkdirSync(join(root, ".spaka/test-records/guestbook"), { recursive: true });
  writeFileSync(
    join(root, "data/guestbook/_datasource.yaml"),
    "collected: true\nfields:\n  - name: name\n    kind: text\n    required: true\n",
  );
  const file = join(root, ".spaka/test-records/guestbook/2026-11-12-0931-a7f3.md");
  writeFileSync(file, "---\nname: [Claire\n---\n");
  expect(dataProblemsAfter(root, "Write", { file_path: file })).toMatch(
    /- \.spaka\/test-records\/guestbook\/2026-11-12-0931-a7f3\.md is left out of the site: /,
  );
  writeFileSync(file, "---\nname: Claire\n---\n");
  expect(dataProblemsAfter(root, "Write", { file_path: file })).toBeUndefined();
});

test("a text holding a colon followed by a space is quoted by Spaka, and the agent is told (Q551)", () => {
  const root = mkdtempSync(join(tmpdir(), "data-check-"));
  mkdirSync(join(root, "data/conditions"), { recursive: true });
  writeFileSync(
    join(root, "data/conditions/_datasource.yaml"),
    "fields:\n  - name: label\n    kind: text\n    required: true\n  - name: phrase\n    kind: text\n",
  );
  const file = join(root, "data/conditions/pluie.md");
  writeFileSync(
    file,
    "---\nlabel: Pluie\nphrase: Il pleut pour de bon : parapluie obligatoire.\n---\nCoûte $1 : rien.\n",
  );
  const note = dataProblemsAfter(root, "Write", { file_path: file });
  expect(note).toBe(
    "Spaka put between double quotes, in data/conditions/pluie.md, the texts that held a colon followed by a space, which YAML could not read: read the file again before you change it, and quote such a text yourself next time.",
  );
  expect(readFileSync(file, "utf8")).toBe(
    '---\nlabel: Pluie\nphrase: "Il pleut pour de bon : parapluie obligatoire."\n---\nCoûte $1 : rien.\n',
  );
  // Read now, it is not quoted again.
  expect(dataProblemsAfter(root, "Write", { file_path: file })).toBeUndefined();
});

test("a record quoting does not mend is left as it was, and said as before", () => {
  const root = mkdtempSync(join(tmpdir(), "data-check-"));
  mkdirSync(join(root, "data/posts"), { recursive: true });
  writeFileSync(join(root, "data/posts/_datasource.yaml"), "fields:\n  - name: title\n    kind: text\n");
  const file = join(root, "data/posts/two.md");
  const text = "---\ntitle: Noël : le menu\nsummary: [open\n---\n";
  writeFileSync(file, text);
  const note = dataProblemsAfter(root, "Write", { file_path: file })!;
  expect(note).toMatch(/^Spaka could not use what you just wrote:\n- data\/posts\/two\.md is left out of the site: /);
  expect(readFileSync(file, "utf8")).toBe(text);
});

test("only plain values at the top of the front matter are quoted", () => {
  expect(
    quoteColons(
      '---\ntitle: A: b\nurl: https://x.y\ntime: 10:30\nq: "Déjà : cité"\nlist:\n  - x: y\n---\nBody: text\n',
    ),
  ).toBe('---\ntitle: "A: b"\nurl: https://x.y\ntime: 10:30\nq: "Déjà : cité"\nlist:\n  - x: y\n---\nBody: text\n');
  expect(quoteColons("no front matter: here\n")).toBe("no front matter: here\n");
});
