import { describe, expect, test } from "vitest";
import {
  moveRecordItem,
  newRecordText,
  RecordWriteRefused,
  readRecordFile,
  recordIdFrom,
  removeRecordItem,
  renameInOrder,
  setOrder,
  setRecordValue,
  setRecordValueAt,
  validRecordId,
} from "./records.ts";

const record = "---\n# The opening\ntitle: Hello\ndate: 2026-11-01\ntags: [news]\n---\n# Hi\n\nSome text.\n";

describe("a record written one value at a time (Q162)", () => {
  test("a field changed, the rest as it was: its order, its comments, its text", () => {
    expect(setRecordValue(record, "title", "Hello world", false)).toBe(
      "---\n# The opening\ntitle: Hello world\ndate: 2026-11-01\ntags: [news]\n---\n# Hi\n\nSome text.\n",
    );
    expect(setRecordValue(record, "tags", ["news", "shop"], false)).toContain("tags: [news, shop]");
    expect(setRecordValue(record, "price", 4.5, false)).toContain("tags: [news]\nprice: 4.5\n---");
    expect(setRecordValue(record, "featured", true, false)).toContain("featured: true");
  });

  test("an empty value left out; the body below", () => {
    expect(setRecordValue(record, "date", "", false)).toBe(
      "---\n# The opening\ntitle: Hello\ntags: [news]\n---\n# Hi\n\nSome text.\n",
    );
    expect(setRecordValue(record, "body", "New text", true)).toBe(
      "---\n# The opening\ntitle: Hello\ndate: 2026-11-01\ntags: [news]\n---\nNew text\n",
    );
    expect(setRecordValue("---\ntitle: A\n---\n", "title", "", false)).toBe("---\n---\n");
  });

  test("a text with a colon quoted; a date kept a date", () => {
    const text = setRecordValue(record, "title", "Bread: our way", false);
    expect(readRecordFile(text).values.title).toBe("Bread: our way");
    expect(readRecordFile(text).values.date).toBe("2026-11-01");
  });

  test("fields that do not read are not overwritten", () => {
    const broken = "---\ntitle: [unclosed\n---\nx\n";
    expect(() => setRecordValue(broken, "title", "x", false)).toThrow(RecordWriteRefused);
    expect(readRecordFile(broken).error).toBeTruthy();
    expect(setRecordValue(broken, "body", "y", true)).toBe("---\ntitle: [unclosed\n---\ny\n");
  });

  test("a new record, its fields in the order given", () => {
    expect(newRecordText({ title: "Opening day", date: "2026-11-01", cover: "" }, "Text")).toBe(
      "---\ntitle: Opening day\ndate: 2026-11-01\n---\nText\n",
    );
    expect(readRecordFile(newRecordText({}))).toEqual({ values: {}, body: "" });
  });
});

describe("ids and order (Q153, Q160, Q165)", () => {
  test("an id from the title, the next free one if taken", () => {
    expect(recordIdFrom("Hello world!", () => false)).toBe("hello-world");
    expect(recordIdFrom("Crème brûlée", () => false)).toBe("creme-brulee");
    expect(recordIdFrom("", () => false)).toBe("untitled");
    const taken = new Set(["hello", "hello-2"]);
    expect(recordIdFrom("Hello", (id) => taken.has(id))).toBe("hello-3");
    expect(validRecordId("hello-2")).toBe(true);
    for (const no of ["_draft", "-x", "Hello", "a b", "a/b", ""]) expect(validRecordId(no), no).toBe(false);
  });

  test("the manual order written in the definition, and kept through a rename", () => {
    const definition = "label: Team\n# Who works here\nfields:\n  - name: name\n    kind: text\n";
    const ordered = setOrder(definition, ["zoe", "adam"]);
    expect(ordered).toBe(`${definition}order: [zoe, adam]\n`);
    expect(renameInOrder(ordered, "zoe", "zoe-b")).toContain("order: [zoe-b, adam]");
    expect(renameInOrder(definition, "zoe", "x")).toBe(definition);
  });
});

describe("a list of links in a record (Q212)", () => {
  const text =
    "---\nlabel: Services # the menu\nlinks:\n  - label: Bread\n    href: /bread\n  - label: Cakes\n    href: /cakes\n---\nA menu.\n";
  test("written whole as a list of label-and-address pairs", () => {
    expect(setRecordValue("---\nlabel: Services\n---\n", "links", [{ label: "Bread", href: "/bread" }], false)).toBe(
      "---\nlabel: Services\nlinks:\n  - label: Bread\n    href: /bread\n---\n",
    );
  });
  test("one label changed, the rest of the file as it was", () => {
    expect(setRecordValueAt(text, ["links", 1, "label"], "Pastries")).toBe(
      text.replace("label: Cakes", "label: Pastries"),
    );
  });
  test("refused for a link that is not there", () => {
    expect(() => setRecordValueAt(text, ["links", 5, "label"], "x")).toThrow(RecordWriteRefused);
    expect(() => setRecordValueAt("---\nlabel: x\n---\n", ["links", 0, "label"], "x")).toThrow(RecordWriteRefused);
  });
});

describe("a list of images in a record (Q354-Q356)", () => {
  const text =
    "---\naddress: Wren # the bungalow\nphotos:\n  - /media/a.jpg\n  - /media/b.jpg\n  - /media/c.jpg\nbeds: 3\n---\nThe house.\n";
  test("one image replaced, the rest of the file as it was", () => {
    expect(setRecordValueAt(text, ["photos", 1], "/media/x.jpg")).toBe(text.replace("b.jpg", "x.jpg"));
  });
  test("one taken out, and the field left out once empty", () => {
    expect(removeRecordItem(text, "photos", 0)).toBe(text.replace("  - /media/a.jpg\n", ""));
    const one = "---\naddress: Wren\nphotos: [/media/a.jpg]\n---\n";
    expect(removeRecordItem(one, "photos", 0)).toBe("---\naddress: Wren\n---\n");
  });
  test("one moved to another place, a list on one line kept on one line", () => {
    expect(moveRecordItem(text, "photos", 2, 0)).toBe(
      text.replace("a.jpg\n  - /media/b.jpg\n  - /media/c.jpg", "c.jpg\n  - /media/a.jpg\n  - /media/b.jpg"),
    );
    expect(moveRecordItem("---\nphotos: [/media/a.jpg, /media/b.jpg]\n---\n", "photos", 0, 1)).toBe(
      "---\nphotos: [/media/b.jpg, /media/a.jpg]\n---\n",
    );
  });
  test("refused for an image that is not there", () => {
    expect(() => setRecordValueAt(text, ["photos", 3], "/media/x.jpg")).toThrow(
      "This image is not in the record any more.",
    );
    expect(() => removeRecordItem(text, "photos", 3)).toThrow(RecordWriteRefused);
    expect(() => moveRecordItem(text, "photos", 0, 3)).toThrow(RecordWriteRefused);
    expect(() => removeRecordItem("---\naddress: Wren\n---\n", "photos", 0)).toThrow(RecordWriteRefused);
  });
});
