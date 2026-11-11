// Authored datasources (ADR 0005, Q145-Q166): a folder under data/ with a
// definition, _datasource.yaml, and one Markdown file per record, its fields
// in YAML at the top and its long text below. What a template sees: each
// record's fields, checked against the definition, long text already turned
// into HTML (Q154), its id and a reference used to trace elements back to it.
//
// While the agent writes, the preview shows stand-in records until the first
// real one is complete (Q161), and a record being written as soon as its
// fields are.
import { marked } from "marked";
import { parse as parseYaml } from "yaml";
import type { Note } from "./runtime.ts";
import type { ProjectSource } from "./source.ts";

export const FIELD_KINDS = [
  "text",
  "markdown",
  "number",
  "boolean",
  "date",
  "choice",
  "image",
  "link",
  "list",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export type Field = { name: string; kind: FieldKind; label?: string; required?: boolean; choices?: string[] };

export type Definition = {
  name: string;
  label: string;
  fields: Field[];
  /** The field written below the fields, as the file's Markdown (Q152). */
  body?: string;
  /** The field records are listed by, and whether newest or largest first (Q153). */
  sort?: { field: string; desc: boolean };
  /** Without a sort: the ids in the order the maker set (Q153). */
  order?: string[];
};

/** A record as templates see it. */
export type DataRecord = { id: string; __ref: string; [field: string]: unknown };

/** What is wrong with a record, for the Content tab (Q166). */
export type RecordProblem = { id: string; file: string; problems: string[]; skipped: boolean };

export type Datasource = {
  name: string;
  definition: Definition | undefined;
  /** The records shown, in order; stand-ins while none is complete yet. */
  records: DataRecord[];
  standIns: boolean;
  problems: RecordProblem[];
  notes: Note[];
};

export const DEFINITION_FILE = "_datasource.yaml";
const STAND_INS = 3;
const LOREM = ["Lorem ipsum dolor", "Sit amet consectetur", "Adipiscing elit sed"];
const STAND_IN_IMAGE =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 10'%3E%3Crect width='16' height='10' fill='%23d4d4d8'/%3E%3C/svg%3E";

/** data/<name>/<id>.md, the file of a record. */
export function recordFile(name: string, id: string): string {
  return `data/${name}/${id}.md`;
}

/** The datasource and id a project file is the record of, if it is one. */
export function recordOf(file: string): { datasource: string; id: string } | undefined {
  const m = /^data\/([a-z0-9][\w-]*)\/([a-z0-9][\w-]*)\.md$/i.exec(file);
  return m ? { datasource: m[1]!, id: m[2]! } : undefined;
}

/** A record's file split into its fields' YAML and the Markdown below; undefined while the fields are unfinished. */
export function splitRecord(text: string): { yaml: string; body: string } | undefined {
  const src = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!src.startsWith("---\n")) return src.trim() ? { yaml: "", body: src } : undefined;
  const end = /\n---[ \t]*(\n|$)/.exec(src.slice(3));
  if (!end) return undefined;
  const yamlEnd = 3 + end.index;
  return { yaml: src.slice(4, yamlEnd + 1), body: src.slice(yamlEnd + end[0].length).replace(/^\n/, "") };
}

export type DataOptions = {
  /** Stand-in records while a datasource is being written (the preview). */
  standIns?: boolean;
};

/** The project's datasources, read from its files; parsed files are kept by content. */
export class Datasources {
  private readonly parsed = new Map<string, { text: string; value: unknown }>();

  constructor(
    private readonly source: ProjectSource,
    private readonly options: DataOptions = {},
  ) {}

  /** The names of the folders under data/ that have a definition or a record. */
  names(): string[] {
    const names = new Set<string>();
    for (const file of this.source.list("data")) {
      const m = /^data\/([a-z0-9][\w-]*)\/[^/]+$/i.exec(file);
      if (m && (file.endsWith(`/${DEFINITION_FILE}`) || file.endsWith(".md"))) names.add(m[1]!);
    }
    return [...names].sort();
  }

  definition(name: string): { definition?: Definition; problem?: string } {
    const file = `data/${name}/${DEFINITION_FILE}`;
    const text = this.source.read(file);
    if (text === undefined) return {};
    const value = this.yaml(file, text);
    if (value instanceof Error) return { problem: `${file}: ${value.message}` };
    return readDefinition(name, value);
  }

  /** A datasource with its records, stand-ins while none is complete and the project is being written. */
  get(name: string): Datasource {
    const notes: Note[] = [];
    const problems: RecordProblem[] = [];
    const { definition, problem } = this.definition(name);
    if (problem) notes.push({ file: `data/${name}/${DEFINITION_FILE}`, note: problem });
    const files = this.source.list(`data/${name}`).filter((f) => recordOf(f)?.datasource === name);
    const records: DataRecord[] = [];
    for (const file of files) {
      const id = recordOf(file)!.id;
      if (id.startsWith("_")) continue;
      const text = this.source.read(file) ?? "";
      const writing = this.source.writing?.(file) ?? false;
      const parts = splitRecord(text);
      // A record still being written appears once its fields are complete.
      if (!parts) {
        if (!writing) {
          problems.push({ id, file, problems: ["its fields are not closed by a --- line"], skipped: true });
          notes.push({ file, note: "left out: its fields are not closed by a --- line" });
        }
        continue;
      }
      const fields = parts.yaml.trim() ? this.yaml(file, parts.yaml) : {};
      if (fields instanceof Error || (fields !== null && typeof fields !== "object") || Array.isArray(fields)) {
        if (writing) continue;
        const why = fields instanceof Error ? fields.message : "its fields are not a list of names and values";
        problems.push({ id, file, problems: [why], skipped: true });
        notes.push({ file, note: `left out: ${why}` });
        continue;
      }
      const { record, wrong } = readRecord(name, id, (fields ?? {}) as Record<string, unknown>, parts.body, definition);
      if (wrong.length) {
        problems.push({ id, file, problems: wrong, skipped: false });
        if (!writing) for (const w of wrong) notes.push({ file, note: w });
      }
      records.push(record);
    }
    sortRecords(records, definition);
    const standIns = !!this.options.standIns && records.length === 0 && (this.source.writing?.() ?? false);
    return {
      name,
      definition,
      records: standIns ? standInRecords(name, definition) : records,
      standIns,
      problems,
      notes,
    };
  }

  /** A datasource that no file speaks of yet: stand-ins while the project is being written, else nothing. */
  missing(name: string): Datasource {
    const standIns = !!this.options.standIns && (this.source.writing?.() ?? false);
    return {
      name,
      definition: undefined,
      records: standIns ? standInRecords(name, undefined) : [],
      standIns,
      problems: [],
      notes: standIns ? [] : [{ file: "data", note: `no datasource named ${name}` }],
    };
  }

  private yaml(file: string, text: string): unknown {
    const kept = this.parsed.get(file);
    if (kept && kept.text === text) return kept.value;
    let value: unknown;
    try {
      value = parseYaml(text, { prettyErrors: false });
    } catch (error) {
      value = new Error(error instanceof Error ? error.message.split("\n")[0] : String(error));
    }
    this.parsed.set(file, { text, value });
    return value;
  }
}

function readDefinition(name: string, value: unknown): { definition?: Definition; problem?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { problem: "the definition is not a list of names and values" };
  const v = value as Record<string, unknown>;
  const fields: Field[] = [];
  const list = Array.isArray(v.fields) ? v.fields : [];
  for (const f of list) {
    if (!f || typeof f !== "object") continue;
    const field = f as Record<string, unknown>;
    if (typeof field.name !== "string" || !field.name) continue;
    const kind = FIELD_KINDS.includes(field.kind as FieldKind) ? (field.kind as FieldKind) : "text";
    fields.push({
      name: field.name,
      kind,
      ...(typeof field.label === "string" ? { label: field.label } : {}),
      ...(field.required === true ? { required: true } : {}),
      ...(Array.isArray(field.choices) ? { choices: field.choices.map(String) } : {}),
    });
  }
  const sortText = typeof v.sort === "string" ? v.sort.trim() : "";
  const sort = sortText ? { field: sortText.replace(/^-/, ""), desc: sortText.startsWith("-") } : undefined;
  return {
    definition: {
      name,
      label: typeof v.label === "string" && v.label ? v.label : titleOf(name),
      fields,
      ...(typeof v.body === "string" ? { body: v.body } : {}),
      ...(sort ? { sort } : {}),
      ...(Array.isArray(v.order) ? { order: v.order.map(String) } : {}),
    },
  };
}

function readRecord(
  name: string,
  id: string,
  fields: Record<string, unknown>,
  body: string,
  definition: Definition | undefined,
): { record: DataRecord; wrong: string[] } {
  const record: DataRecord = { ...fields, id, __ref: `${name}/${id}` };
  const wrong: string[] = [];
  const bodyField = definition?.body;
  if (bodyField) record[bodyField] = markdown(body);
  else if (body.trim()) record.body = markdown(body);
  for (const field of definition?.fields ?? []) {
    if (field.name === bodyField) {
      if (field.required && !body.trim()) wrong.push(`${field.name} is required`);
      continue;
    }
    const raw = fields[field.name];
    if (raw === undefined || raw === null || raw === "") {
      record[field.name] = field.kind === "list" ? [] : "";
      if (field.required) wrong.push(`${field.name} is required`);
      continue;
    }
    const value = coerce(field, raw);
    if (value === undefined) {
      record[field.name] = field.kind === "list" ? [] : "";
      wrong.push(`${field.name} is not ${kindName(field)}`);
    } else record[field.name] = value;
  }
  return { record, wrong };
}

function coerce(field: Field, raw: unknown): unknown {
  switch (field.kind) {
    case "text":
    case "link":
      return typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? String(raw) : undefined;
    case "markdown":
      return typeof raw === "string" ? markdown(raw) : undefined;
    case "number": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean":
      if (typeof raw === "boolean") return raw;
      if (typeof raw === "string" && /^(yes|true|on)$/i.test(raw)) return true;
      if (typeof raw === "string" && /^(no|false|off)$/i.test(raw)) return false;
      return undefined;
    case "date": {
      const text = raw instanceof Date ? raw.toISOString().slice(0, 10) : typeof raw === "string" ? raw : "";
      return text && !Number.isNaN(Date.parse(text)) ? text : undefined;
    }
    case "choice":
      return typeof raw === "string" && (!field.choices || field.choices.includes(raw)) ? raw : undefined;
    case "image": {
      if (typeof raw !== "string") return undefined;
      return raw.startsWith("media/") ? `/${raw}` : raw;
    }
    case "list":
      if (Array.isArray(raw)) return raw.every((x) => typeof x !== "object") ? raw.map(String) : undefined;
      return typeof raw === "string" ? [raw] : undefined;
  }
}

function kindName(field: Field): string {
  return {
    text: "a text",
    markdown: "a text",
    number: "a number",
    boolean: "yes or no",
    date: "a date",
    choice: `one of ${(field.choices ?? []).join(", ")}`,
    image: "an image's address",
    link: "an address",
    list: "a list of texts",
  }[field.kind];
}

function sortRecords(records: DataRecord[], definition: Definition | undefined) {
  const sort = definition?.sort;
  if (sort) {
    const dir = sort.desc ? -1 : 1;
    records.sort((a, b) => {
      const x = a[sort.field];
      const y = b[sort.field];
      if (x === y) return a.id.localeCompare(b.id);
      if (x === undefined || x === "") return 1;
      if (y === undefined || y === "") return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
    return;
  }
  const order = definition?.order ?? [];
  const at = (id: string) => {
    const i = order.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  records.sort((a, b) => at(a.id) - at(b.id) || a.id.localeCompare(b.id));
}

/** Three records that give the layout its shape before the real ones are written (Q161). */
function standInRecords(name: string, definition: Definition | undefined): DataRecord[] {
  return Array.from({ length: STAND_INS }, (_, i) => {
    const base: DataRecord = { id: `stand-in-${i + 1}`, __ref: "", __standIn: true };
    if (!definition) return standInProxy(base, i);
    for (const field of definition.fields) base[field.name] = standInValue(field, i);
    if (definition.body && base[definition.body] === undefined)
      base[definition.body] = `<p>${LOREM[i % LOREM.length]}.</p>`;
    return base;
  });
}

function standInValue(field: Field, i: number): unknown {
  const text = LOREM[i % LOREM.length]!;
  switch (field.kind) {
    case "text":
      return text;
    case "markdown":
      return `<p>${text}.</p>`;
    case "number":
      return i + 1;
    case "boolean":
      return false;
    case "date":
      return new Date().toISOString().slice(0, 10);
    case "choice":
      return field.choices?.[0] ?? "";
    case "image":
      return STAND_IN_IMAGE;
    case "link":
      return "#";
    case "list":
      return text.split(" ").slice(0, 2);
  }
}

/** Without a definition, any field a template asks a stand-in for is a short text. */
function standInProxy(base: DataRecord, i: number): DataRecord {
  return new Proxy(base, {
    get(target, key) {
      if (typeof key !== "string" || key in target) return Reflect.get(target, key);
      if (
        !/^[a-z][a-z0-9_]*$/i.test(key) ||
        /^(then|toLiquid|liquidMethodMissing|constructor|valueOf|toJSON)$/.test(key)
      )
        return undefined;
      return LOREM[i % LOREM.length];
    },
    has(target, key) {
      return typeof key === "string" ? /^[a-z][a-z0-9_]*$/i.test(key) || key in target : key in target;
    },
  });
}

function markdown(text: string): string {
  return text.trim() ? (marked.parse(text, { async: false, gfm: true }) as string) : "";
}

/** "blog-posts" gives "Blog posts". */
export function titleOf(name: string): string {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
