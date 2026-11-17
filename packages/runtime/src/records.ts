// Writing records as the Content tab changes them (Q162-Q165): one value at a
// time, the rest of the file as it was (the order of its fields, its
// comments, its text below); a new record's id from its title; the manual
// order kept in the definition.
import { type Document, isMap, isScalar, isSeq, parseDocument, type YAMLSeq } from "yaml";
import { type DataRecord, type Definition, splitRecord } from "./data.ts";

/** The field a record is known by: the definition's first text field. */
export function titleField(definition: Definition | undefined): string {
  return definition?.fields.find((f) => f.kind === "text")?.name ?? "title";
}

/** What the maker sees a record as: its title, or its id without one. */
export function recordTitle(record: DataRecord, definition: Definition | undefined): string {
  const value = record[titleField(definition)];
  return typeof value === "string" && value.trim() ? value.trim() : record.id;
}

/** An empty value, which a record leaves out rather than writes. */
function empty(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

export class RecordWriteRefused extends Error {}

/** A record's fields as written, and its text, for the Content tab's form. */
export function readRecordFile(text: string): { values: Record<string, unknown>; body: string; error?: string } {
  const parts = splitRecord(text) ?? { yaml: "", body: "" };
  const doc = parseDocument(parts.yaml);
  if (doc.errors.length)
    return { values: {}, body: parts.body, error: doc.errors[0]!.message.split("\n")[0]!.replace(/:\s*$/, ".") };
  const values = doc.toJS() as unknown;
  return {
    values: values && typeof values === "object" && !Array.isArray(values) ? (values as Record<string, unknown>) : {},
    body: parts.body,
  };
}

/**
 * The record's file with one value changed: a field in the YAML at the top,
 * or, for the definition's body field, the text below. An empty value is
 * left out. Refused when the fields at the top do not read.
 */
export function setRecordValue(text: string, field: string, value: unknown, isBody: boolean): string {
  const parts = splitRecord(text) ?? { yaml: "", body: text };
  if (isBody) return joinRecord(parts.yaml, typeof value === "string" ? value : "");
  const doc = parseDocument(parts.yaml);
  if (doc.errors.length) throw new RecordWriteRefused("This record's fields do not read: ask the agent to fix it.");
  if (!isMap(doc.contents) && doc.contents !== null)
    throw new RecordWriteRefused("This record's fields do not read: ask the agent to fix it.");
  if (empty(value)) doc.delete(field);
  else {
    // A list of short texts reads best on one line, as the agent writes it.
    const flow = Array.isArray(value) && value.every((v) => typeof v === "string" && v.length < 40);
    doc.set(field, doc.createNode(value, { flow }));
  }
  return joinRecord(isMap(doc.contents) && doc.contents.items.length ? write(doc) : "", parts.body);
}

/**
 * A record's file with one value inside a list changed, the rest as it was:
 * `["links", 2, "label"]` is the third link's label (Q212), `["photos", 1]`
 * the second image of a list of images (Q355). Refused when that item is not
 * in the record.
 */
export function setRecordValueAt(
  text: string,
  path: [string, number] | [string, number, string],
  value: string,
): string {
  const [field, index, key] = path;
  return changeList(text, field, key === undefined ? "image" : "link", (list, doc) => {
    const item = list.items[index];
    if (key === undefined) {
      if (!isScalar(item)) return false;
      list.items[index] = doc.createNode(value);
    } else {
      if (!isMap(item)) return false;
      item.set(key, value);
    }
    return true;
  });
}

/** A record's file with an item of one of its lists taken out, the field left out once empty (Q356). */
export function removeRecordItem(text: string, field: string, index: number): string {
  return changeList(text, field, "image", (list, doc) => {
    if (index < 0 || index >= list.items.length) return false;
    list.items.splice(index, 1);
    if (!list.items.length) doc.delete(field);
    return true;
  });
}

/** A record's file with an item of one of its lists moved to another place, `to` being its place once moved (Q356). */
export function moveRecordItem(text: string, field: string, from: number, to: number): string {
  return changeList(text, field, "image", (list) => {
    const n = list.items.length;
    if (from < 0 || from >= n || to < 0 || to >= n) return false;
    const [item] = list.items.splice(from, 1);
    list.items.splice(to, 0, item);
    return true;
  });
}

/** The record's file with one of its lists changed in place, its style kept; refused when `change` finds no such item. */
function changeList(
  text: string,
  field: string,
  what: "link" | "image",
  change: (list: YAMLSeq, doc: Document) => boolean,
): string {
  const parts = splitRecord(text) ?? { yaml: "", body: text };
  const doc = parseDocument(parts.yaml);
  if (doc.errors.length || !isMap(doc.contents))
    throw new RecordWriteRefused("This record's fields do not read: ask the agent to fix it.");
  const list = doc.get(field, true);
  if (!isSeq(list) || !change(list, doc)) throw new RecordWriteRefused(`This ${what} is not in the record any more.`);
  return joinRecord(isMap(doc.contents) && doc.contents.items.length ? write(doc) : "", parts.body);
}

/**
 * A collection's definition with the fields a gallery block needs and it
 * lacks added at the end, the rest as it was (Q198). A field of the same
 * name is kept as it is, whatever its kind: those are returned, for a note.
 */
export function addDefinitionFields(
  definition: string,
  from: string,
): { text: string; added: string[]; differ: string[] } {
  const doc = parseDocument(definition);
  const theirs = parseDocument(from);
  if (doc.errors.length || !isMap(doc.contents))
    throw new RecordWriteRefused("The datasource's definition does not read: ask the agent to fix it.");
  const fields = doc.get("fields", true);
  const wanted = theirs.get("fields", true);
  if (!isSeq(wanted)) return { text: definition, added: [], differ: [] };
  const have = new Map<string, unknown>();
  if (isSeq(fields))
    for (const f of fields.items)
      if (isMap(f) && typeof f.get("name") === "string") have.set(f.get("name") as string, f.get("kind"));
  const added: string[] = [];
  const differ: string[] = [];
  for (const f of wanted.items) {
    if (!isMap(f)) continue;
    const name = f.get("name");
    if (typeof name !== "string") continue;
    if (have.has(name)) {
      if ((have.get(name) ?? "text") !== (f.get("kind") ?? "text")) differ.push(name);
      continue;
    }
    if (isSeq(fields)) fields.items.push(doc.createNode(f.toJSON()));
    else doc.set("fields", doc.createNode([f.toJSON()]));
    added.push(name);
  }
  return { text: added.length ? write(doc) : definition, added, differ };
}

/** A new record's file, its fields in the definition's order. */
export function newRecordText(values: Record<string, unknown>, body = ""): string {
  let text = joinRecord("", body);
  for (const [field, value] of Object.entries(values)) text = setRecordValue(text, field, value, false);
  return text;
}

function joinRecord(yaml: string, body: string): string {
  const top = yaml.trim() ? `${yaml.trimEnd()}\n` : "";
  const text = body.replace(/^\n+/, "");
  return `---\n${top}---\n${text}${text && !text.endsWith("\n") ? "\n" : ""}`;
}

/**
 * An id from a title, as the record's file name and its page's address:
 * "Hello world!" gives hello-world, the next free one if taken (Q165). An
 * id never starts with an underscore (Q160).
 */
export function recordIdFrom(title: string, taken: (id: string) => boolean): string {
  const base =
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "untitled";
  if (!taken(base)) return base;
  for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
}

/** Whether an id can name a record: lowercase letters, digits and dashes, not first a dash. */
export function validRecordId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(id);
}

/** The definition with its manual order set to `ids` (Q153). */
export function setOrder(definition: string, ids: string[]): string {
  const doc = parseDocument(definition);
  if (doc.errors.length)
    throw new RecordWriteRefused("The datasource's definition does not read: ask the agent to fix it.");
  doc.set("order", doc.createNode(ids, { flow: true }));
  return write(doc);
}

/** The definition with a record's id renamed in its manual order, if it has one. */
export function renameInOrder(definition: string, from: string, to: string): string {
  const doc = parseDocument(definition);
  const order = doc.get("order");
  if (doc.errors.length || !isSeq(order)) return definition;
  const ids = (order.toJSON() as unknown[]).map((id) => (id === from ? to : id));
  doc.set("order", doc.createNode(ids, { flow: true }));
  return write(doc);
}

/** YAML as the agent writes it: [a, b], no padding. */
function write(doc: Document): string {
  return doc.toString({ flowCollectionPadding: false, lineWidth: 0 });
}
