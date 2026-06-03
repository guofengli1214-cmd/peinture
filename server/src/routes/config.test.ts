import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { buildTestContext, seedUser } from "../testing/helpers";

async function setup() {
  const ctx = buildTestContext();
  await seedUser(ctx, { username: "alice", password: "pw" });
  const app = createApp(ctx);
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username: "alice", password: "pw" });
  return { ctx, app, agent };
}

describe("config routes", () => {
  it("requires authentication", async () => {
    const { app } = await setup();
    expect((await request(app).get("/api/config")).status).toBe(401);
    expect((await request(app).put("/api/config").send({ language: "zh" })).status).toBe(401);
  });

  it("returns the current user's config with hasTokens flags and no raw tokens", async () => {
    const { agent } = await setup();
    const res = await agent.get("/api/config");
    expect(res.status).toBe(200);
    expect(res.body.config.hasTokens.huggingface).toBe(false);
    expect(res.body.config.tokens).toBeUndefined();
  });

  it("applies an allowed self-update and reflects it on the next GET", async () => {
    const { agent } = await setup();
    await agent.put("/api/config").send({ language: "zh", steps: 22 });
    const res = await agent.get("/api/config");
    expect(res.body.config.language).toBe("zh");
    expect(res.body.config.steps).toBe(22);
  });

  it("ignores attempts to set admin-locked tokens via self-update", async () => {
    const { agent } = await setup();
    await agent.put("/api/config").send({ tokens: { huggingface: "hf_hack" } });
    const res = await agent.get("/api/config");
    expect(res.body.config.hasTokens.huggingface).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain("hf_hack");
  });
});
