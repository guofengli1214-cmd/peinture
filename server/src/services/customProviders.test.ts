import { describe, it, expect } from "vitest";
import { buildTestContext, seedUser } from "../testing/helpers";
import {
  createGlobalProvider,
  createForUser,
  adminUpdate,
  resolveForUse,
} from "./customProviders";

async function ctxWithUsers() {
  const ctx = buildTestContext();
  const alice = await seedUser(ctx, { username: "alice", password: "pw" });
  const bob = await seedUser(ctx, { username: "bob", password: "pw" });
  return { ctx, alice: alice.id, bob: bob.id };
}

const sample = {
  name: "My Relay",
  apiUrl: "https://relay.example.com",
  format: "openai" as const,
  models: [{ modelId: "gpt-image-1", name: "GPT Image", capabilities: ["image" as const] }],
  secret: "sk-secret-123",
  enabled: true,
};

describe("custom provider service", () => {
  it("admin global create is global/admin-managed and encrypts the secret", async () => {
    const { ctx } = await ctxWithUsers();
    const p = await createGlobalProvider(ctx, sample);

    expect(p.scope).toBe("global");
    expect(p.managedBy).toBe("admin");
    expect(p.ownerUserId).toBeNull();
    expect(p.hasSecret).toBe(true);
    expect((p as Record<string, unknown>).secret).toBeUndefined();

    // stored encrypted, not plaintext
    const row = await ctx.repos.customProviders.findById(p.id);
    expect(row?.secretEncrypted).toBeTruthy();
    expect(row?.secretEncrypted).not.toContain("sk-secret-123");
  });

  it("admin create-for-user is user-scoped/admin-managed", async () => {
    const { ctx, alice } = await ctxWithUsers();
    const p = await createForUser(ctx, alice, sample);
    expect(p.scope).toBe("user");
    expect(p.managedBy).toBe("admin");
    expect(p.ownerUserId).toBe(alice);
  });

  it("admin secret update: omit keeps, null clears, string replaces", async () => {
    const { ctx, alice } = await ctxWithUsers();
    const p = await createForUser(ctx, alice, sample);

    // omit -> unchanged
    await adminUpdate(ctx, p.id, { name: "n" });
    expect((await ctx.repos.customProviders.findById(p.id))?.secretEncrypted).toBeTruthy();

    // replace
    await adminUpdate(ctx, p.id, { secret: "sk-new" });
    const resolved = await resolveForUse(ctx, alice, p.id);
    expect(resolved.secret).toBe("sk-new");

    // clear
    await adminUpdate(ctx, p.id, { secret: null });
    expect((await ctx.repos.customProviders.findById(p.id))?.secretEncrypted).toBeNull();
  });

  it("resolveForUse enforces access (global or owner only) and decrypts", async () => {
    const { ctx, alice, bob } = await ctxWithUsers();
    const own = await createForUser(ctx, alice, sample);
    const glob = await createGlobalProvider(ctx, sample);

    const r1 = await resolveForUse(ctx, alice, own.id);
    expect(r1.secret).toBe("sk-secret-123");
    expect(r1.apiUrl).toBe("https://relay.example.com");
    expect(r1.format).toBe("openai");

    // global usable by anyone
    expect((await resolveForUse(ctx, bob, glob.id)).secret).toBe("sk-secret-123");

    // bob cannot use alice's private provider
    await expect(resolveForUse(ctx, bob, own.id)).rejects.toThrow("PROVIDER_NOT_AVAILABLE");
  });

  it("admin can update any provider", async () => {
    const { ctx, alice } = await ctxWithUsers();
    const own = await createForUser(ctx, alice, sample);
    const updated = await adminUpdate(ctx, own.id, { enabled: false });
    expect(updated.enabled).toBe(false);
  });
});
