import { promises as fs } from "node:fs";
import path from "node:path";
import type { Pool } from "mysql2/promise";

/**
 * Minimal forward-only SQL migration runner.
 *
 * Reads `*.sql` files from the migrations directory in lexical order, runs any
 * that have not yet been applied, and records applied filenames in `_migrations`.
 */

/** Split a `.sql` file into individual statements (pure; unit-tested). */
export function splitSqlStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name VARCHAR(255) NOT NULL PRIMARY KEY,
       applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
}

async function appliedMigrations(pool: Pool): Promise<Set<string>> {
  const [rows] = await pool.query("SELECT name FROM _migrations");
  return new Set((rows as Array<{ name: string }>).map((r) => r.name));
}

export async function runMigrations(pool: Pool, migrationsDir: string): Promise<string[]> {
  await ensureMigrationsTable(pool);
  const applied = await appliedMigrations(pool);

  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    for (const statement of splitSqlStatements(sql)) {
      await pool.query(statement);
    }
    await pool.query("INSERT INTO _migrations (name) VALUES (?)", [file]);
    ran.push(file);
    // eslint-disable-next-line no-console
    console.log(`[migrate] applied ${file}`);
  }
  return ran;
}
