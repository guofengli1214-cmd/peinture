import { describe, it, expect } from "vitest";
import { buildTestContext, seedUser, seedUserProvider } from "../testing/helpers";
import {
  createGlobalProvider,
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

  it("admin secret update: omit keeps, null clears, string replaces", async () => {
    const { ctx, alice } = await ctxWithUsers();
    const id = await seedUserProvider(ctx, alice, sample);

    // omit -> unchanged
    await adminUpdate(ctx, id, { name: "n" });
    expect((await ctx.repos.customProviders.findById(id))?.secretEncrypted).toBeTruthy();

    // replace
    await adminUpdate(ctx, id, { secret: "sk-new" });
    const resolved = await resolveForUse(ctx, alice, id);
    expect(resolved.secret).toBe("sk-new");

    // clear
    await adminUpdate(ctx, id, { secret: null });
    expect((await ctx.repos.customProviders.findById(id))?.secretEncrypted).toBeNull();
  });

  it("resolveForUse enforces access (global or owner only) and decrypts", async () => {
    const { ctx, alice, bob } = await ctxWithUsers();
    const ownId = await seedUserProvider(ctx, alice, sample);
    const glob = await createGlobalProvider(ctx, sample);

    const r1 = await resolveForUse(ctx, alice, ownId);
    expect(r1.secret).toBe("sk-secret-123");
    expect(r1.apiUrl).toBe("https://relay.example.com");
    expect(r1.format).toBe("openai");

    // global usable by anyone
    expect((await resolveForUse(ctx, bob, glob.id)).secret).toBe("sk-secret-123");

    // bob cannot use alice's private provider
    await expect(resolveForUse(ctx, bob, ownId)).rejects.toThrow("PROVIDER_NOT_AVAILABLE");
  });

  it("admin can update any provider", async () => {
    const { ctx, alice } = await ctxWithUsers();
    const ownId = await seedUserProvider(ctx, alice, sample);
    const updated = await adminUpdate(ctx, ownId, { enabled: false });
    expect(updated.enabled).toBe(false);
  });
});
