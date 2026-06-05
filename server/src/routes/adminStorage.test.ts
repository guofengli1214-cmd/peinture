import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { buildTestContext, seedUser } from "../testing/helpers";

async function setup() {
  const ctx = buildTestContext();
  await seedUser(ctx, { username: "boss", password: "pw", role: "admin" });
  await seedUser(ctx, { username: "alice", password: "pw", role: "user" });
  const app = createApp(ctx);
  return { app };
}

async function agentFor(app: ReturnType<typeof createApp>, username: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username, password: "pw" });
  return agent;
}

describe("admin storage routes", () => {
  it("blocks anonymous and non-admin access", async () => {
    const { app } = await setup();
    expect((await request(app).get("/api/admin/storage")).status).toBe(401);

    const alice = await agentFor(app, "alice");
    expect((await alice.get("/api/admin/storage")).status).toBe(403);
    expect((await alice.put("/api/admin/storage").send({ storageType: "s3" })).status).toBe(403);
  });

  it("lets an admin save system storage without returning raw secrets", async () => {
    const { app } = await setup();
    const admin = await agentFor(app, "boss");

    const save = await admin.put("/api/admin/storage").send({
      storageType: "s3",
      s3Config: {
        accessKeyId: "AK_ADMIN",
        secretAccessKey: "SK_ADMIN",
        bucket: "admin-bucket",
        region: "ap-southeast-1",
        endpoint: "https://admin-bucket.s3.ap-southeast-1.qiniucs.com",
        publicDomain: "https://cdn.example.com",
        prefix: "peinture/",
      },
    });

    expect(save.status).toBe(200);
    expect(save.body.storage.storageType).toBe("s3");
    expect(save.body.storage.storageConfigured).toBe(true);
    expect(save.body.storage.s3Config.accessKeyId).toBe("AK_ADMIN");
    expect(save.body.storage.s3Config.secretAccessKey).toBe("");
    expect(save.body.storage.hasS3Secret).toBe(true);
    expect(JSON.stringify(save.body)).not.toContain("SK_ADMIN");

    const current = await admin.get("/api/admin/storage");
    expect(current.status).toBe(200);
    expect(current.body.storage.s3Config.bucket).toBe("admin-bucket");
    expect(current.body.storage.hasS3Secret).toBe(true);
    expect(JSON.stringify(current.body)).not.toContain("SK_ADMIN");
  });

  it("public config uses admin storage metadata and never exposes storage secrets", async () => {
    const { app } = await setup();
    const admin = await agentFor(app, "boss");
    await admin.put("/api/admin/storage").send({
      storageType: "s3",
      s3Config: {
        accessKeyId: "AK_ADMIN",
        secretAccessKey: "SK_ADMIN",
        bucket: "admin-bucket",
      },
    });

    const alice = await agentFor(app, "alice");
    const res = await alice.get("/api/config");
    expect(res.status).toBe(200);
    expect(res.body.config.storageType).toBe("s3");
    expect(res.body.config.storageConfigured).toBe(true);
    expect(res.body.config.s3Config.bucket).toBe("admin-bucket");
    expect(res.body.config.s3Config.accessKeyId).toBe("");
    expect(res.body.config.s3Config.secretAccessKey).toBe("");
    expect(JSON.stringify(res.body)).not.toContain("AK_ADMIN");
    expect(JSON.stringify(res.body)).not.toContain("SK_ADMIN");
  });

  it("storage proxy routes require authentication", async () => {
    const { app } = await setup();
    expect((await request(app).get("/api/storage/files")).status).toBe(401);
    expect((await request(app).get("/api/storage/blob?keyOrUrl=x")).status).toBe(401);
    expect((await request(app).post("/api/storage/rename").send({})).status).toBe(401);
  });
});
