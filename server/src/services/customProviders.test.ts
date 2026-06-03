import { describe, it, expect } from "vitest";
import { buildTestContext, seedUser } from "../testing/helpers";
import {
  createSelfProvider,
  createGlobalProvider,
  createForUser,
  listSelf,
  updateSelf,
  deleteSelf,
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
  it("self-create yields a user-scoped, self-managed, encrypted provider", async () => {
    const { ctx, alice } = await ctxWithUsers();
    const p = await createSelfProvider(ctx, alice, sample);

    expect(p.scope).toBe("user");
    expect(p.managedBy).toBe("self");
    expect(p.ownerUserId).toBe(alice);
    expect(p.hasSecret).toBe(true);
    expect(p.editable).toBe(true);
    expect((p as Record<string, unknown>).secret).toBeUndefined();

    // stored encrypted, not plaintext
    const row = await ctx.repos.customProviders.findById(p.id);
    expect(row?.secretEncrypted).toBeTruthy();
    expect(row?.secretEncrypted).not.toContain("sk-secret-123");
  });

  it("admin global create is global/admin-managed", async () => {
    const { ctx } = await ctxWithUsers();
    const p = await createGlobalProvider(ctx, sample);
    expect(p.scope).toBe("global");
    expect(p.managedBy).toBe("admin");
    expect(p.ownerUserId).toBeNull();
  });

  it("admin create-for-user is user-scoped/admin-managed", async () => {
    const { ctx, alice } = await ctxWithUsers();
    const p = await createForUser(ctx, alice, sample);
    expect(p.scope).toBe("user");
    expect(p.managedBy).toBe("admin");
    expect(p.ownerUserId).toBe(alice);
  });

  it("listSelf returns global + own, with correct editable flags", async () => {
    const { ctx, alice, bob } = await ctxWithUsers();
    const glob = await createGlobalProvider(ctx, { ...sample, name: "Global" });
    const assigned = await createForUser(ctx, alice, { ...sample, name: "Assigned" });
    const own = await createSelfProvider(ctx, alice, { ...sample, name: "Own" });
    await createSelfProvider(ctx, bob, { ...sample, name: "BobOwn" }); // must not leak

    const list = await listSelf(ctx, alice);
    const byName = Object.fromEntries(list.map((p) => [p.name, p]));

    expect(Object.keys(byName).sort()).toEqual(["Assigned", "Global", "Own"]);
    expect(byName["Global"].editable).toBe(false);
    expect(byName["Assigned"].editable).toBe(false); // admin-managed → user can't edit
    expect(byName["Own"].editable).toBe(true);
    expect(byName["Own"].id).toBe(own.id);
    expect(byName["Global"].id).toBe(glob.id);
    expect(byName["Assigned"].id).toBe(assigned.id);
  });

  it("self-update/delete only works on own self-managed providers", async () => {
    const { ctx, alice, bob } = await ctxWithUsers();
    const own = await createSelfProvider(ctx, alice, sample);
    const assigned = await createForUser(ctx, alice, sample);
    const bobOwn = await createSelfProvider(ctx, bob, sample);

    // own self-managed: allowed
    const updated = await updateSelf(ctx, alice, own.id, { name: "Renamed" });
    expect(updated.name).toBe("Renamed");

    // admin-assigned: forbidden
    await expect(updateSelf(ctx, alice, assigned.id, { name: "x" })).rejects.toThrow("FORBIDDEN");
    await expect(deleteSelf(ctx, alice, assigned.id)).rejects.toThrow("FORBIDDEN");

    // another user's: forbidden (treated as not found / not theirs)
    await expect(updateSelf(ctx, alice, bobOwn.id, { name: "x" })).rejects.toThrow();

    await deleteSelf(ctx, alice, own.id);
    expect(await ctx.repos.customProviders.findById(own.id)).toBeNull();
  });

  it("secret update: omit keeps, null clears, string replaces", async () => {
    const { ctx, alice } = await ctxWithUsers();
    const p = await createSelfProvider(ctx, alice, sample);

    // omit -> unchanged
    await updateSelf(ctx, alice, p.id, { name: "n" });
    expect((await ctx.repos.customProviders.findById(p.id))?.secretEncrypted).toBeTruthy();

    // replace
    await updateSelf(ctx, alice, p.id, { secret: "sk-new" });
    const resolved = await resolveForUse(ctx, alice, p.id);
    expect(resolved.secret).toBe("sk-new");

    // clear
    await updateSelf(ctx, alice, p.id, { secret: null });
    expect((await ctx.repos.customProviders.findById(p.id))?.secretEncrypted).toBeNull();
  });

  it("resolveForUse enforces access (global or owner only) and decrypts", async () => {
    const { ctx, alice, bob } = await ctxWithUsers();
    const own = await createSelfProvider(ctx, alice, sample);
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
    const own = await createSelfProvider(ctx, alice, sample);
    const updated = await adminUpdate(ctx, own.id, { enabled: false });
    expect(updated.enabled).toBe(false);
  });
});
