// The app's side of a published site's management API (Q177, Q183): the
// token the app generates for each website, kept encrypted by the system
// keychain on this machine, never in the project; and the calls that read,
// approve and delete the records the site has collected.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredRecord } from "@spaka/runtime";
import type { Vault } from "../connectors/connectors";

export class ManagementTokens {
  private readonly file: string;

  constructor(
    userData: string,
    private readonly vault: Vault,
  ) {
    this.file = join(userData, "management-tokens.bin");
  }

  get(projectId: string): string | undefined {
    return this.read()[key(projectId)];
  }

  /** A new token for a website, replacing the old one: the site must be given it again. */
  create(projectId: string): string {
    const token = randomBytes(24).toString("base64url");
    this.write({ ...this.read(), [key(projectId)]: token });
    return token;
  }

  /** The website's token, made the first time it is needed. */
  ensure(projectId: string): string {
    return this.get(projectId) ?? this.create(projectId);
  }

  private read(): Record<string, string> {
    if (!existsSync(this.file)) return {};
    try {
      return JSON.parse(this.vault.decrypt(readFileSync(this.file))) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private write(tokens: Record<string, string>) {
    writeFileSync(this.file, this.vault.encrypt(JSON.stringify(tokens)));
  }
}

const key = (projectId: string) => `project:${projectId}:management-token`;

/** Why a published site could not be reached, worded for the maker. */
export class SiteUnavailable extends Error {
  constructor(
    readonly reason: "no-address" | "no-token" | "unreachable" | "wrong-token" | "not-spaka" | "failed",
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES = {
  "no-address": "Give the published site's address in this website's settings to see what visitors sent.",
  "no-token": "This website has no management token yet: make one in its settings, then give it to the site.",
  unreachable: "The published site does not answer. Check its address, and that it is online.",
  "wrong-token":
    "The published site does not accept this website's management token: give it the token shown in its settings.",
  "not-spaka": "This address is not a website published with Spaka on a server (Docker or Node.js) or on Cloudflare.",
  failed: "The published site could not do it.",
} as const;

/** One call to a published site's management API. */
export async function callSite<T>(
  siteUrl: string | undefined,
  token: string | undefined,
  path: string,
  method: "GET" | "POST" | "DELETE" = "GET",
): Promise<T> {
  if (!siteUrl) throw new SiteUnavailable("no-address", MESSAGES["no-address"]);
  if (!token) throw new SiteUnavailable("no-token", MESSAGES["no-token"]);
  let response: Response;
  try {
    response = await fetch(new URL(`/_spaka/${path}`, siteUrl), {
      method,
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SiteUnavailable("unreachable", MESSAGES.unreachable);
  }
  if (response.status === 401) throw new SiteUnavailable("wrong-token", MESSAGES["wrong-token"]);
  const json = (await response.json().catch(() => undefined)) as (T & { error?: string }) | undefined;
  if (response.status === 404 && path === "ping") throw new SiteUnavailable("not-spaka", MESSAGES["not-spaka"]);
  if (!response.ok || json === undefined) {
    if (json === undefined && path === "ping") throw new SiteUnavailable("not-spaka", MESSAGES["not-spaka"]);
    throw new SiteUnavailable("failed", json?.error ? `${MESSAGES.failed} ${json.error}` : MESSAGES.failed);
  }
  return json;
}

export async function publishedRecords(siteUrl?: string, token?: string, datasource = ""): Promise<StoredRecord[]> {
  const { records } = await callSite<{ records: StoredRecord[] }>(
    siteUrl,
    token,
    `records/${encodeURIComponent(datasource)}`,
  );
  return records;
}

/** A row of the CSV: a published record, or a test record (status "test"). */
export type CsvRecord = Omit<StoredRecord, "status"> & { status: StoredRecord["status"] | "test" };

/**
 * The records as the Content tab lists them (Q190), as CSV: one column per
 * field, with when each was sent and its status (published, pending or test).
 */
export function recordsCsv(fields: string[], records: CsvRecord[]): string {
  const cell = (value: unknown) => {
    const text = Array.isArray(value) ? value.join(", ") : value === undefined || value === null ? "" : String(value);
    // A cell a spreadsheet would read as a formula is written as text.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  const head = ["id", "submitted", "status", ...fields];
  const rows = records.map((r) => [r.id, r.submitted, r.status, ...fields.map((f) => r.fields[f])].map(cell).join(","));
  return `${[head.map(cell).join(","), ...rows].join("\r\n")}\r\n`;
}
