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

  it("submits image generation as a task", async () => {
    const { agent } = await setup();
    const res = await agent
      .post("/api/v1/generate")
      .send({ model: "mystery:foo", prompt: "a cat" });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("processing");
    expect(typeof res.body.taskId).toBe("string");
  });

  it("submits image edits as a task and exposes failure through task-status", async () => {
    const { agent } = await setup();
    const res = await agent
      .post("/api/v1/edit")
      .field("model", "mystery:foo")
      .field("prompt", "make it brighter")
      .attach("image", Buffer.from("png"), {
        filename: "source.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("processing");
    expect(typeof res.body.taskId).toBe("string");

    let statusRes = await agent.get(`/api/v1/task-status?taskId=${res.body.taskId}`);
    for (let i = 0; i < 10 && statusRes.body.status === "processing"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      statusRes = await agent.get(`/api/v1/task-status?taskId=${res.body.taskId}`);
    }

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("failed");
    expect(statusRes.body.error).toContain("PROVIDER_NOT_AVAILABLE");
  });

  it("rejects an unknown / inaccessible custom provider model", async () => {
    const { agent } = await setup();
    const res = await agent
      .post("/api/v1/generate-sync")
      .send({ model: "mystery:foo", prompt: "a cat" });
    expect(res.status).toBe(502);
    expect(res.text).toContain("PROVIDER_NOT_AVAILABLE");
  });

  it("rejects a builtin/unknown provider id (no longer special-cased)", async () => {
    const { agent } = await setup();
    const res = await agent
      .post("/api/v1/generate-sync")
      .send({ model: "gitee:z-image-turbo", prompt: "a cat" });
    expect(res.status).toBe(502);
    expect(res.text).toContain("PROVIDER_NOT_AVAILABLE");
  });
});
