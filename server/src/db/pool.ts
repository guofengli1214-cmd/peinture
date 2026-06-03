import mysql, { type Pool } from "mysql2/promise";
import { loadConfig, type AppConfig } from "../config";

/**
 * MySQL connection pool. `createPool` is explicit (for tests / DI); `getPool`
 * returns a lazily-created process-wide singleton for the running app.
 */

export function createPool(cfg: AppConfig = loadConfig()): Pool {
  return mysql.createPool({
    host: cfg.db.host,
    port: cfg.db.port,
    user: cfg.db.user,
    password: cfg.db.password,
    database: cfg.db.database,
    connectionLimit: cfg.db.connectionLimit,
    waitForConnections: true,
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "Z",
  });
}

let singleton: Pool | null = null;

export function getPool(): Pool {
  if (!singleton) {
    singleton = createPool();
  }
  return singleton;
}
