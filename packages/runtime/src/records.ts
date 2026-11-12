// Writing records as the Content tab changes them (Q162-Q165): one value at a
// time, the rest of the file as it was (the order of its fields, its
// comments, its text below); a new record's id from its title; the manual
// order kept in the definition.
import { type Document, isMap, isSeq, parseDocument } from "yaml";
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
 * `["links", 2, "label"]` is the third link's label (Q212). Refused when that
 * item is not in the record.
 */
export function setRecordValueAt(text: string, path: [string, number, string], value: string): string {
  const parts = splitRecord(text) ?? { yaml: "", body: text };
  const doc = parseDocument(parts.yaml);
  if (doc.errors.length || !isMap(doc.contents))
    throw new RecordWriteRefused("This record's fields do not read: ask the agent to fix it.");
  const [field, index] = path;
  const list = doc.get(field, true);
  if (!isSeq(list) || !isMap(list.items[index]))
    throw new RecordWriteRefused("This link is not in the record any more.");
  doc.setIn(path, value);
  return joinRecord(write(doc), parts.body);
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
