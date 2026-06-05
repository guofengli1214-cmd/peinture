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

describe("v1 generation proxy", () => {
  it("requires authentication", async () => {
    const { app } = await setup();
    expect((await request(app).get("/api/v1/models")).status).toBe(401);
    expect((await request(app).post("/api/v1/generate").send({})).status).toBe(401);
  });

  it("returns a flat array of models from DB-driven providers (empty when none seeded)", async () => {
    const { agent } = await setup();
    const res = await agent.get("/api/v1/models");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // No custom/global providers seeded for this user -> empty list.
    expect(res.body).toEqual([]);
  });

  it("validates the generate request body", async () => {
    const { agent } = await setup();
    const res = await agent.post("/api/v1/generate").send({ prompt: "" });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown / inaccessible custom provider model", async () => {
    const { agent } = await setup();
    const res = await agent
      .post("/api/v1/generate")
      .send({ model: "mystery:foo", prompt: "a cat" });
    expect(res.status).toBe(502);
    expect(res.text).toContain("PROVIDER_NOT_AVAILABLE");
  });

  it("rejects a builtin/unknown provider id (no longer special-cased)", async () => {
    const { agent } = await setup();
    const res = await agent
      .post("/api/v1/generate")
      .send({ model: "gitee:z-image-turbo", prompt: "a cat" });
    expect(res.status).toBe(502);
    expect(res.text).toContain("PROVIDER_NOT_AVAILABLE");
  });
});
