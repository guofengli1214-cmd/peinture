import { describe, it, expect } from "vitest";
import {
  getPublicConfig,
  applySelfUpdate,
  getProviderTokens,
  getCustomProviderWithToken,
} from "./userConfig";
import { updateSystemStorage } from "./systemStorage";
import {
  buildTestContext,
  seedUser,
  seedUserTokens,
  seedUserCustomProvider,
} from "../testing/helpers";
import type { AppContext } from "../context";

async function ctxWithUser() {
  const ctx = buildTestContext();
  const user = await seedUser(ctx, { username: "alice", password: "pw" });
  return { ctx, userId: user.id };
}

// A public config payload should never contain a raw provider token anywhere.
function assertNoRawToken(payload: unknown, token: string) {
  expect(JSON.stringify(payload)).not.toContain(token);
}

describe("userConfig", () => {
  it("seeds and returns defaults for a new user with no tokens configured", async () => {
    const { ctx, userId } = await ctxWithUser();
    const cfg = await getPublicConfig(ctx, userId);
    expect(cfg.language).toBe("en");
    expect(cfg.serviceMode).toBe("server");
    expect(cfg.textModelConfig).toEqual({
      provider: "server",
      model: "deepseek:deepseek-v4-flash",
    });
    expect(cfg.hasTokens.huggingface).toBe(false);
    expect((cfg as unknown as Record<string, unknown>).tokens).toBeUndefined();
  });

  it("persists secrets encrypted at rest", async () => {
    const { ctx, userId } = await ctxWithUser();
    await seedUserTokens(ctx, userId, { huggingface: "hf_secret_123" });
    const row = await ctx.repos.settings.get(userId);
    expect(row?.secretsEncrypted).toBeTruthy();
    expect(row?.secretsEncrypted).toContain("enc:");
    expect(row?.secretsEncrypted).not.toContain("hf_secret_123");
  });

  it("provider tokens are exposed only as a hasTokens flag, never as the raw token", async () => {
    const { ctx, userId } = await ctxWithUser();
    await seedUserTokens(ctx, userId, { huggingface: "hf_secret_123, hf_secret_456" });

    const cfg = await getPublicConfig(ctx, userId);
    expect(cfg.hasTokens.huggingface).toBe(true);
    assertNoRawToken(cfg, "hf_secret_123");

    // The proxy can still read the raw tokens server-side.
    expect(await getProviderTokens(ctx, userId, "huggingface")).toEqual([
      "hf_secret_123",
      "hf_secret_456",
    ]);
  });

  it("a normal user's self-update cannot change admin-locked tokens but can change prefs", async () => {
    const { ctx, userId } = await ctxWithUser();
    await seedUserTokens(ctx, userId, { huggingface: "hf_locked" });

    await applySelfUpdate(ctx, userId, {
      language: "zh",
      steps: 20,
      tokens: { huggingface: "hf_hacker_attempt" },
    } as Record<string, unknown>);

    expect(await getProviderTokens(ctx, userId, "huggingface")).toEqual(["hf_locked"]);
    const cfg = await getPublicConfig(ctx, userId);
    expect(cfg.language).toBe("zh");
    expect(cfg.steps).toBe(20);
  });

  it("a normal user cannot change admin-managed storage credentials", async () => {
    const { ctx, userId } = await ctxWithUser();
    await updateSystemStorage(ctx, {
      storageType: "s3",
      s3Config: {
        accessKeyId: "AK_ADMIN",
        secretAccessKey: "SK_ADMIN",
        bucket: "admin-bucket",
      },
    });

    await applySelfUpdate(ctx, userId, {
      storageType: "webdav",
      s3Config: { accessKeyId: "AK_HACK", secretAccessKey: "SK_HACK", bucket: "hacked" },
    } as Record<string, unknown>);

    const cfg = await getPublicConfig(ctx, userId);
    expect(cfg.storageType).toBe("s3");
    expect(cfg.storageConfigured).toBe(true);
    expect(cfg.s3Config.bucket).toBe("admin-bucket");
    expect(cfg.s3Config.accessKeyId).toBe("");
    expect(JSON.stringify(cfg)).not.toContain("SK_ADMIN");
    expect(JSON.stringify(cfg)).not.toContain("AK_HACK");
  });

  it("a custom provider token is hidden in the public view but readable by the proxy", async () => {
    const { ctx, userId } = await ctxWithUser();
    await seedUserCustomProvider(
      ctx,
      userId,
      { id: "p1", name: "MyServer", apiUrl: "https://x/api", models: {}, enabled: true },
      "cp_secret",
    );

    const cfg = await getPublicConfig(ctx, userId);
    expect(cfg.customProviders[0].name).toBe("MyServer");
    expect((cfg.customProviders[0] as unknown as Record<string, unknown>).token).toBeUndefined();
    expect((cfg.customProviders[0] as unknown as Record<string, unknown>).hasToken).toBe(true);
    assertNoRawToken(cfg, "cp_secret");

    const withToken = await getCustomProviderWithToken(ctx, userId, "p1");
    expect(withToken?.token).toBe("cp_secret");
  });

  it("token update preserves other providers' tokens when omitted", async () => {
    const { ctx, userId } = await ctxWithUser();
    await seedUserTokens(ctx, userId, { huggingface: "hf_x", gitee: "gi_y" });
    await seedUserTokens(ctx, userId, { huggingface: "hf_z" });
    expect(await getProviderTokens(ctx, userId, "huggingface")).toEqual(["hf_z"]);
    expect(await getProviderTokens(ctx, userId, "gitee")).toEqual(["gi_y"]);
  });
});

export type { AppContext };
