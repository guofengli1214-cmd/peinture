import "dotenv/config";
import { loadConfig } from "./config";
import { createPool } from "./db/pool";
import { runMigrations } from "./db/migrate";
import { createCrypto } from "./crypto";
import { createMysqlRepositories } from "./repositories/mysql";
import { bootstrapAdmin } from "./auth/bootstrap";
import { createApp } from "./app";
import type { AppContext } from "./context";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);

  await runMigrations(pool, config.migrationsDir);

  const ctx: AppContext = {
    config,
    crypto: createCrypto(config.encryptionKey),
    repos: createMysqlRepositories(pool),
  };

  await bootstrapAdmin(ctx);

  const app = createApp(ctx);
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[peinture-server] listening on :${config.port} (${config.nodeEnv})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[peinture-server] fatal startup error:", err);
  process.exit(1);
});
