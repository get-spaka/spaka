// What runs a site's server modules on Node (ADR 0014), in the preview's
// process and in the Node export's server: the modules found in server/, the
// site's database for their SQL (node:sqlite), and its migrations, applied in
// order and noted in a table of Spaka's.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { modulesAmong, type SqlApi } from "../server.ts";

/** The server modules in a folder, by name: server/weather.ts is `weather`. */
export function moduleFiles(dir: string): Record<string, string> {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return {};
  }
  return Object.fromEntries(Object.entries(modulesAmong(names)).map(([name, file]) => [name, join(dir, file)]));
}

/** The table where Spaka notes each migration applied. */
export const MIGRATIONS_TABLE = "spaka_migrations";

export type Migration = { name: string; sql: string };

/** The migrations of server/migrations/, in the order of their names (0001-bookings.sql…). */
export function migrationsIn(dir: string): Migration[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

export type MigrationsApplied = { applied: string[]; error?: { name: string; message: string } };

/**
 * Applies the migrations not applied yet, each in a transaction of its own,
 * and stops at the first that fails: the next start tries it again.
 */
export function applyMigrations(db: DatabaseSync, migrations: Migration[], now = () => new Date()): MigrationsApplied {
  db.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name TEXT PRIMARY KEY, applied TEXT NOT NULL)`);
  const done = new Set(
    (db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`).all() as { name: string }[]).map((row) => row.name),
  );
  const applied: string[] = [];
  for (const { name, sql } of migrations) {
    if (done.has(name)) continue;
    try {
      db.exec("BEGIN");
      db.exec(sql);
      db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name, applied) VALUES (?, ?)`).run(name, now().toISOString());
      db.exec("COMMIT");
      applied.push(name);
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      return { applied, error: { name, message: error instanceof Error ? error.message : String(error) } };
    }
  }
  return { applied };
}

/** A value as SQLite takes it: true as 1, a date as its ISO text, undefined as null. */
function input(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "string") return value;
  if (value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}

/** SQL on a node:sqlite database, as modules call it (Q514). */
export function sqlApi(db: DatabaseSync): SqlApi {
  return {
    all: async (query, ...params) => db.prepare(query).all(...params.map(input)) as Record<string, unknown>[],
    get: async (query, ...params) => db.prepare(query).get(...params.map(input)) as Record<string, unknown> | undefined,
    run: async (query, ...params) => ({ changes: Number(db.prepare(query).run(...params.map(input)).changes) }),
  };
}
