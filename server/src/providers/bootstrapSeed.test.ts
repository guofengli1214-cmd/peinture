import { describe, it, expect } from "vitest";
import { buildTestContext, seedUser, seedUserTokens } from "../testing/helpers";
import { seedGlobalProviders } from "./seed";
import { migrateRuntimeData } from "./migrateData";
import { listGlobal, resolveForUse } from "../services/customProviders";

// Mirrors the startup order in index.ts (after bootstrapAdmin): seed then migrate.
describe("startup seed + migrate sequence", () => {
  it("seeds providers then migrates existing tokens, end to end", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    await seedUserTokens(ctx, alice, { openai: "sk-real" });

    await seedGlobalProviders(ctx);
    await migrateRuntimeData(ctx);

    const openai = (await listGlobal(ctx)).find((g) => g.name === "OpenAI")!;
    expect((await resolveForUse(ctx, alice, openai.id)).secret).toBe("sk-real");
  });
});
