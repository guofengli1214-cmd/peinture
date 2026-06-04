import type { AppContext } from "../context";
import { PROVIDER_IDS, getProviderTokens, type ProviderId } from "../services/userConfig";
import { adminUpdate } from "../services/customProviders";

/** Maps a legacy builtin provider id to the seeded global provider's name. */
const PROVIDER_NAME: Record<ProviderId, string> = {
  huggingface: "HuggingFace",
  gitee: "Gitee AI",
  modelscope: "ModelScope",
  a4f: "A4F",
  openai: "OpenAI",
  google: "Google",
};

/**
 * Fold existing per-user tokens into the matching seeded global provider's secret.
 * Idempotent and non-destructive: only writes when the global provider currently
 * has NO secret (so it won't clobber an admin-set or already-migrated key). Tokens
 * across all users are unioned (dedup, first-seen order) and comma-joined to reuse
 * the adapter's multi-key rotation.
 */
export async function migrateRuntimeData(ctx: AppContext): Promise<void> {
  const userIds = (await ctx.repos.users.list()).map((u) => u.id);

  for (const providerId of PROVIDER_IDS) {
    const provider = await ctx.repos.customProviders.findGlobalByName(PROVIDER_NAME[providerId]);
    if (!provider || provider.secretEncrypted) continue; // missing or already has a secret

    const seen = new Set<string>();
    const tokens: string[] = [];
    for (const uid of userIds) {
      for (const tok of await getProviderTokens(ctx, uid, providerId)) {
        if (!seen.has(tok)) { seen.add(tok); tokens.push(tok); }
      }
    }
    if (tokens.length === 0) continue;

    await adminUpdate(ctx, provider.id, { secret: tokens.join(",") });
  }
}
