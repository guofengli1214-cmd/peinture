import { loadConfig, type AppConfig } from "../config";
import { createCrypto } from "../crypto";
import { createMemoryRepositories } from "../repositories/memory";
import { hashPassword } from "../auth/passwords";
import type { AppContext } from "../context";
import type { Role, UserRecord, ProviderFormat } from "../repositories/types";
import {
  loadRaw,
  saveRaw,
  type CustomProviderMeta,
  type ProviderId,
} from "../services/userConfig";
import type { ProviderModelDef } from "../services/customProviders";

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

function normalizeTokenList(value: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
  }
  return value
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** Test helper: write per-user provider tokens into the user's secret bundle. */
export async function seedUserTokens(
  ctx: AppContext,
  userId: number,
  tokens: Partial<Record<ProviderId, string | string[]>>,
): Promise<void> {
  const { config, secrets } = await loadRaw(ctx, userId);
  for (const id of Object.keys(tokens) as ProviderId[]) {
    const value = tokens[id];
    if (value !== undefined) secrets.tokens[id] = normalizeTokenList(value);
  }
  await saveRaw(ctx, userId, config, secrets);
}

/** Test helper: write a custom-provider meta (+ optional token) into the user's bundle. */
export async function seedUserCustomProvider(
  ctx: AppContext,
  userId: number,
  meta: CustomProviderMeta,
  token?: string,
): Promise<void> {
  const { config, secrets } = await loadRaw(ctx, userId);
  config.customProviders = [
    ...config.customProviders.filter((p) => p.id !== meta.id),
    meta,
  ];
  if (token !== undefined) secrets.customProviderTokens[meta.id] = token;
  await saveRaw(ctx, userId, config, secrets);
}

interface SeedProviderInput {
  name: string;
  apiUrl: string;
  format: ProviderFormat;
  models: ProviderModelDef[];
  secret?: string | null;
  enabled?: boolean;
}

/**
 * Test helper: create a user-scoped, admin-managed custom provider via the repo
 * (mirrors the old createForUser service path for access/ownership tests).
 * Returns the provider id.
 */
export async function seedUserProvider(
  ctx: AppContext,
  ownerUserId: number,
  input: SeedProviderInput,
): Promise<string> {
  const rec = await ctx.repos.customProviders.create({
    id: crypto.randomUUID(),
    scope: "user",
    ownerUserId,
    managedBy: "admin",
    name: input.name,
    apiUrl: input.apiUrl,
    format: input.format,
    modelsJson: JSON.stringify(input.models ?? []),
    secretEncrypted: input.secret ? ctx.crypto.encryptString(input.secret) : null,
    enabled: input.enabled ?? true,
  });
  return rec.id;
}
