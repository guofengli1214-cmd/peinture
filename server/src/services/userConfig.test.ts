import { describe, it, expect } from "vitest";
import {
  getPublicConfig,
  applySelfUpdate,
  applyAdminUpdate,
  getProviderTokens,
  getCustomProviderWithToken,
} from "./userConfig";
import { buildTestContext, seedUser } from "../testing/helpers";
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
    expect(cfg.hasTokens.huggingface).toBe(false);
    expect((cfg as unknown as Record<string, unknown>).tokens).toBeUndefined();
  });

  it("persists secrets encrypted at rest", async () => {
    const { ctx, userId } = await ctxWithUser();
    await applyAdminUpdate(ctx, userId, { tokens: { huggingface: "hf_secret_123" } });
    const row = await ctx.repos.settings.get(userId);
    expect(row?.secretsEncrypted).toBeTruthy();
    expect(row?.secretsEncrypted).toContain("enc:");
    expect(row?.secretsEncrypted).not.toContain("hf_secret_123");
  });

  it("admin can set provider tokens; public view exposes only a hasTokens flag, never the raw token", async () => {
    const { ctx, userId } = await ctxWithUser();
    await applyAdminUpdate(ctx, userId, { tokens: { huggingface: "hf_secret_123, hf_secret_456" } });

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
    await applyAdminUpdate(ctx, userId, { tokens: { huggingface: "hf_locked" } });

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

  it("a normal user can set their own storage credentials and read them back", async () => {
    const { ctx, userId } = await ctxWithUser();
    await applySelfUpdate(ctx, userId, {
      s3Config: { accessKeyId: "AKIA", secretAccessKey: "shh", bucket: "b" },
    } as Record<string, unknown>);
    const cfg = await getPublicConfig(ctx, userId);
    expect(cfg.s3Config.accessKeyId).toBe("AKIA");
  });

  it("admin can set a custom provider with a token; public view hides the token, proxy can read it", async () => {
    const { ctx, userId } = await ctxWithUser();
    await applyAdminUpdate(ctx, userId, {
      customProviders: [
        { id: "p1", name: "MyServer", apiUrl: "https://x/api", token: "cp_secret", models: {}, enabled: true },
      ],
    });

    const cfg = await getPublicConfig(ctx, userId);
    expect(cfg.customProviders[0].name).toBe("MyServer");
    expect((cfg.customProviders[0] as unknown as Record<string, unknown>).token).toBeUndefined();
    expect((cfg.customProviders[0] as unknown as Record<string, unknown>).hasToken).toBe(true);
    assertNoRawToken(cfg, "cp_secret");

    const withToken = await getCustomProviderWithToken(ctx, userId, "p1");
    expect(withToken?.token).toBe("cp_secret");
  });

  it("admin token update preserves other providers' tokens when omitted", async () => {
    const { ctx, userId } = await ctxWithUser();
    await applyAdminUpdate(ctx, userId, { tokens: { huggingface: "hf_x", gitee: "gi_y" } });
    await applyAdminUpdate(ctx, userId, { tokens: { huggingface: "hf_z" } });
    expect(await getProviderTokens(ctx, userId, "huggingface")).toEqual(["hf_z"]);
    expect(await getProviderTokens(ctx, userId, "gitee")).toEqual(["gi_y"]);
  });
});

export type { AppContext };
