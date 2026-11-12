// The records a published site collects, in SQLite: node:sqlite for the Node
// export (Q176), D1 for the Cloudflare one (Q175). One table for every
// collected datasource; a record's values are kept as JSON, so changing a
// definition's fields needs no migration (ADR 0005).
import type { CollectedStore, StoredRecord } from "./collected.ts";

/** The few calls the store needs, which node:sqlite and D1 both offer once wrapped. */
export interface SqlDatabase {
  all(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
  /** Runs a statement; how many rows it changed. */
  run(sql: string, params: unknown[]): Promise<number>;
}

/** The table, created by the Node export at start and by the Cloudflare export's migration. */
export const RECORDS_SCHEMA = `CREATE TABLE IF NOT EXISTS records (
  id TEXT NOT NULL,
  datasource TEXT NOT NULL,
  fields TEXT NOT NULL,
  status TEXT NOT NULL,
  submitted TEXT NOT NULL,
  visitor TEXT,
  PRIMARY KEY (datasource, id)
);
CREATE INDEX IF NOT EXISTS records_by_time ON records (datasource, submitted);
`;

/** The table is missing: the Cloudflare export's migration was not applied. */
export class MissingTable extends Error {}

export class SqlStore implements CollectedStore {
  constructor(private readonly db: SqlDatabase) {}

  async list(datasource: string, limit: number): Promise<StoredRecord[]> {
    const rows = await this.query(
      "SELECT id, fields, status, submitted FROM records WHERE datasource = ? ORDER BY submitted DESC LIMIT ?",
      [datasource, limit],
    );
    return rows.map((row) => ({
      id: String(row.id),
      submitted: String(row.submitted),
      status: row.status === "pending" ? "pending" : "published",
      fields: parseFields(String(row.fields)),
    }));
  }

  async add(datasource: string, record: StoredRecord, visitor?: string): Promise<void> {
    await this.change(
      "INSERT INTO records (id, datasource, fields, status, submitted, visitor) VALUES (?, ?, ?, ?, ?, ?)",
      [record.id, datasource, JSON.stringify(record.fields), record.status, record.submitted, visitor ?? null],
    );
  }

  async sentSince(datasource: string, visitor: string, since: string): Promise<number> {
    const rows = await this.query(
      "SELECT COUNT(*) AS n FROM records WHERE datasource = ? AND visitor = ? AND submitted > ?",
      [datasource, visitor, since],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async approve(datasource: string, id: string): Promise<boolean> {
    return (
      (await this.change("UPDATE records SET status = 'published' WHERE datasource = ? AND id = ?", [datasource, id])) >
      0
    );
  }

  async delete(datasource: string, id: string): Promise<boolean> {
    return (await this.change("DELETE FROM records WHERE datasource = ? AND id = ?", [datasource, id])) > 0;
  }

  private async query(sql: string, params: unknown[]) {
    try {
      return await this.db.all(sql, params);
    } catch (error) {
      throw missing(error);
    }
  }

  private async change(sql: string, params: unknown[]) {
    try {
      return await this.db.run(sql, params);
    } catch (error) {
      throw missing(error);
    }
  }
}

function missing(error: unknown): unknown {
  const text = error instanceof Error ? error.message : String(error);
  return /no such table/i.test(text)
    ? new MissingTable("The records table does not exist yet: apply the database migration (see README.md).")
    : error;
}

function parseFields(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
