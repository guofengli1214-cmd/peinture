import path from "node:path";

/**
 * Application configuration, loaded from environment variables.
 *
 * Kept as a pure function (`loadConfig`) so tests can pass a custom env.
 * `dotenv` is loaded once at the process entrypoint (src/index.ts), not here.
 */

export interface AppConfig {
  port: number;
  nodeEnv: string;
  isProd: boolean;
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionLimit: number;
  };
  /** Key for AES-256-GCM at-rest encryption of secrets (tokens, storage creds). */
  encryptionKey: string;
  /** First-run admin bootstrap; skipped if password is empty. */
  admin: { username: string; password: string };
  session: {
    ttlMs: number;
    cookieName: string;
    cookieSecure: boolean;
    cookieSameSite: "lax" | "strict" | "none";
  };
  /** Absolute path to the SQL migrations directory. */
  migrationsDir: string;
}

const DEV_ENCRYPTION_KEY = "dev-only-insecure-encryption-key-change-me";

function num(value: string | undefined, fallback: number): number {
  const n = value === undefined ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV || "development";
  const isProd = nodeEnv === "production";

  let encryptionKey = env.APP_ENCRYPTION_KEY || "";
  if (!encryptionKey) {
    if (isProd) {
      throw new Error(
        "APP_ENCRYPTION_KEY is required in production (used to encrypt stored tokens).",
      );
    }
    // eslint-disable-next-line no-console
    console.warn("[config] APP_ENCRYPTION_KEY not set — using an insecure dev key.");
    encryptionKey = DEV_ENCRYPTION_KEY;
  }

  return {
    port: num(env.PORT, 3001),
    nodeEnv,
    isProd,
    db: {
      host: env.DB_HOST || "localhost",
      port: num(env.DB_PORT, 3306),
      user: env.DB_USER || "peinture",
      password: env.DB_PASSWORD || "",
      database: env.DB_NAME || "peinture",
      connectionLimit: num(env.DB_CONNECTION_LIMIT, 10),
    },
    encryptionKey,
    admin: {
      username: env.ADMIN_USERNAME || "admin",
      password: env.ADMIN_PASSWORD || "",
    },
    session: {
      ttlMs: num(env.SESSION_TTL_HOURS, 168) * 60 * 60 * 1000,
      cookieName: env.SESSION_COOKIE_NAME || "peinture_session",
      cookieSecure: bool(env.COOKIE_SECURE, isProd),
      cookieSameSite: (env.COOKIE_SAMESITE as AppConfig["session"]["cookieSameSite"]) || "lax",
    },
    // src/config.ts -> ../migrations (dev via tsx) and dist/config.js -> ../migrations both resolve to server/migrations
    migrationsDir: path.resolve(__dirname, "../migrations"),
  };
}
