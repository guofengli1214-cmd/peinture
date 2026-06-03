import { loadConfig, type AppConfig } from "../config";
import { createCrypto } from "../crypto";
import { createMemoryRepositories } from "../repositories/memory";
import { hashPassword } from "../auth/passwords";
import type { AppContext } from "../context";
import type { Role, UserRecord } from "../repositories/types";

/** Build an AppContext backed by in-memory repositories for tests. */
export function buildTestContext(env: NodeJS.ProcessEnv = {}): AppContext {
  const config: AppConfig = loadConfig({
    NODE_ENV: "test",
    APP_ENCRYPTION_KEY: "test-encryption-key",
    ...env,
  });
  return {
    config,
    crypto: createCrypto(config.encryptionKey),
    repos: createMemoryRepositories(),
  };
}

export async function seedUser(
  ctx: AppContext,
  opts: { username: string; password: string; role?: Role; isActive?: boolean },
): Promise<UserRecord> {
  const passwordHash = await hashPassword(opts.password);
  const user = await ctx.repos.users.create({
    username: opts.username,
    passwordHash,
    role: opts.role ?? "user",
  });
  if (opts.isActive === false) {
    await ctx.repos.users.update(user.id, { isActive: false });
  }
  return (await ctx.repos.users.findById(user.id))!;
}
