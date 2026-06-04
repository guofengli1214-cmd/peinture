import { describe, it, expect } from "vitest";
import { buildTestContext, seedUser, seedUserTokens } from "../testing/helpers";
import { seedGlobalProviders } from "./seed";
import { listGlobal, resolveForUse } from "../services/customProviders";
import { migrateRuntimeData } from "./migrateData";

describe("migrateRuntimeData", () => {
  it("folds all users' per-provider tokens into the matching global provider secret (deduped), only when empty", async () => {
    const ctx = buildTestContext();
    await seedGlobalProviders(ctx);
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const bob = (await seedUser(ctx, { username: "bob", password: "pw" })).id;

    // Admin had set per-user gitee tokens (alice has two, bob shares one with alice).
    await seedUserTokens(ctx, alice, { gitee: "k1,k2" });
    await seedUserTokens(ctx, bob, { gitee: "k2,k3" });

    await migrateRuntimeData(ctx);

    const gitee = (await listGlobal(ctx)).find((g) => g.name === "Gitee AI")!;
    expect(gitee.hasSecret).toBe(true);
    const resolved = await resolveForUse(ctx, alice, gitee.id);
    // deduped union, comma-joined (order preserved by first appearance)
    expect(resolved.secret).toBe("k1,k2,k3");
  });

  it("does not overwrite a provider secret the admin already set", async () => {
    const ctx = buildTestContext();
    await seedGlobalProviders(ctx);
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    await seedUserTokens(ctx, alice, { gitee: "user-key" });

    const gitee0 = (await listGlobal(ctx)).find((g) => g.name === "Gitee AI")!;
    const { adminUpdate } = await import("../services/customProviders");
    await adminUpdate(ctx, gitee0.id, { secret: "admin-key" });

    await migrateRuntimeData(ctx);

    const resolved = await resolveForUse(ctx, alice, gitee0.id);
    expect(resolved.secret).toBe("admin-key"); // untouched
  });
});
