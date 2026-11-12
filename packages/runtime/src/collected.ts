// What visitors send (ADR 0005, Q171-Q189): a form posts to /_data/<name>,
// what it sent is read against the collected datasource's definition, and a
// store keeps the record: test records in the preview, SQLite once published
// (node:sqlite on Node, D1 on Cloudflare).
import { type Definition, type Field, type FormMessages, type StoredRecord, titleOf } from "./data.ts";
import { escapeHtml } from "./escape.ts";

export type { StoredRecord };

/** Where the records a published site collects are kept. */
export interface CollectedStore {
  /** A datasource's records, newest first, at most `limit`, those waiting for review included. */
  list(datasource: string, limit: number): Promise<StoredRecord[]>;
  /** Keeps a record; `visitor` is the sender's fingerprint, for the per-visitor limit. */
  add(datasource: string, record: StoredRecord, visitor?: string): Promise<void>;
  /** How many records a visitor sent to a datasource since a moment (ISO). */
  sentSince(datasource: string, visitor: string, since: string): Promise<number>;
  /** Shows a record that was waiting for review; false when there is no such record. */
  approve(datasource: string, id: string): Promise<boolean>;
  /** Deletes a record for good; false when there is no such record. */
  delete(datasource: string, id: string): Promise<boolean>;
}

/** The route prefix of form submissions (Q188). */
export const DATA_ROUTE = "/_data/";
/** The route prefix of the management API (token-protected). */
export const MANAGEMENT_ROUTE = "/_upstart/";
/** How many records of each collected datasource a page can show. */
export const SHOWN_RECORDS = 500;
/** At most this many records per visitor and datasource in the window below (Q157's rate limit). */
export const VISITOR_LIMIT = 5;
export const VISITOR_WINDOW_MS = 10 * 60 * 1000;

/** The hidden field that only robots fill (Q180). */
export const TRAP_FIELD = "_website";

const MAX_TEXT = 1000;
const MAX_LONG_TEXT = 10_000;

const DEFAULT_MESSAGES: Required<FormMessages> = {
  required: "{field} is required.",
  invalid: "{field} is not valid.",
  too_many: "Too many messages were sent from here. Please try again in a few minutes.",
  sent: "Thank you, it was sent.",
};

export function message(definition: Definition, key: keyof FormMessages, field?: Field): string {
  const text = definition.messages?.[key] ?? DEFAULT_MESSAGES[key];
  return field ? text.replaceAll("{field}", field.label ?? titleOf(field.name)) : text;
}

/** A form's values by name; a name sent several times (checkboxes) keeps them all. */
export type FormValues = Map<string, string[]>;

export async function formValues(request: Request): Promise<FormValues> {
  const values: FormValues = new Map();
  const type = request.headers.get("content-type") ?? "";
  if (!/application\/x-www-form-urlencoded|multipart\/form-data/i.test(type)) return values;
  const form = await request.formData();
  for (const [name, value] of form.entries()) {
    // Visitors cannot send files (Q179).
    if (typeof value !== "string") continue;
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  return values;
}

/**
 * What a visitor sent, as the definition says: the values of its fields, or
 * the problems found, worded as the definition says (Q189). Names the
 * definition does not have are ignored.
 */
export function readSubmission(
  definition: Definition,
  values: FormValues,
): { fields: Record<string, unknown> } | { problems: string[] } {
  const fields: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const field of definition.fields) {
    const sent = (values.get(field.name) ?? []).map((v) => v.trim()).filter(Boolean);
    if (!sent.length) {
      // An unchecked box sends nothing: it is "no", never missing.
      if (field.kind === "boolean") fields[field.name] = false;
      else if (field.required) problems.push(message(definition, "required", field));
      continue;
    }
    const value = submitted(field, sent);
    if (value === undefined) problems.push(message(definition, "invalid", field));
    else fields[field.name] = value;
  }
  return problems.length ? { problems } : { fields };
}

function submitted(field: Field, sent: string[]): unknown {
  const one = sent[0]!;
  const max = field.kind === "markdown" ? MAX_LONG_TEXT : MAX_TEXT;
  if (sent.some((v) => v.length > max)) return undefined;
  switch (field.kind) {
    case "text":
    case "markdown":
      return one;
    case "number": {
      const n = Number(one.replace(",", "."));
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean":
      return /^(on|yes|true|1)$/i.test(one);
    case "date":
      return /^\d{4}-\d{2}-\d{2}/.test(one) && !Number.isNaN(Date.parse(one)) ? one : undefined;
    case "choice":
      return !field.choices || field.choices.includes(one) ? one : undefined;
    case "link":
      return /^https?:\/\/\S+$/i.test(one) ? one : undefined;
    case "email":
      return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(one) ? one : undefined;
    case "phone":
      return /^\+?[\d\s()./-]{6,24}$/.test(one) && (one.match(/\d/g) ?? []).length >= 6 ? one : undefined;
    case "list":
      return field.choices && sent.some((v) => !field.choices!.includes(v)) ? undefined : sent;
    case "image":
      return undefined;
  }
}

/** A new record's id: when it was sent, and four random characters ("2026-11-12-0931-a7f3"). */
export function submissionId(now: Date, random: () => number = Math.random): string {
  const iso = now.toISOString();
  const tail = Math.floor(random() * 0x10000)
    .toString(16)
    .padStart(4, "0");
  return `${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}-${tail}`;
}

/** A visitor's fingerprint for the per-visitor limit: the address hashed with a secret, never the address. */
export async function fingerprint(address: string, secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${secret}\u0000${address}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...hash.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The built-in alert listing what is wrong (Q173), in the site's theme. */
export function problemsAlert(problems: string[]): string {
  const items = problems.map((p) => `<li>${escapeHtml(p)}</li>`).join("");
  return `<div role="alert" class="alert alert-error alert-soft" data-up-problems><ul class="list-disc ps-4">${items}</ul></div>`;
}

/** What a valid submission is answered with when the definition names no fragment. */
export function sentAlert(text: string): string {
  return `<div role="status" class="alert alert-success alert-soft" data-up-sent>${escapeHtml(text)}</div>`;
}

/**
 * Adds the hidden trap field to every form that posts to /_data/<name>
 * (Q180), right after its opening tag. Visitors never see or reach it.
 */
export function addTrapFields(html: string): string {
  if (!html.includes(DATA_ROUTE)) return html;
  return html.replace(/<form\b[^>]*>/gi, (tag) => {
    if (!/\s(?:hx-post|action)\s*=\s*["']?\/_data\//i.test(tag)) return tag;
    return `${tag}<div aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden"><input type="text" name="${TRAP_FIELD}" tabindex="-1" autocomplete="off" value=""></div>`;
  });
}

/** Constant-time comparison of a token sent with the expected one. */
export function sameToken(sent: string, expected: string): boolean {
  const a = new TextEncoder().encode(sent);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0 && b.length > 0;
}
