import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { buildTestContext, seedUser } from "../testing/helpers";

async function setup() {
  const ctx = buildTestContext();
  await seedUser(ctx, { username: "admin1", password: "pw", role: "admin" });
  await seedUser(ctx, { username: "alice", password: "pw" });
  const app = createApp(ctx);

  const admin = request.agent(app);
  await admin.post("/api/auth/login").send({ username: "admin1", password: "pw" });
  const alice = request.agent(app);
  await alice.post("/api/auth/login").send({ username: "alice", password: "pw" });

  return { ctx, app, admin, alice };
}

const sample = {
  name: "My Relay",
  apiUrl: "https://relay.example.com",
  format: "openai",
  models: [{ modelId: "img-1", name: "Img", capabilities: ["image"] }],
  secret: "sk-secret",
};

describe("custom provider routes", () => {
  it("requires auth / admin", async () => {
    const { app, alice } = await setup();
    expect((await request(app).get("/api/providers")).status).toBe(401);
    expect((await alice.get("/api/admin/providers")).status).toBe(403);
  });

  it("user self-create returns hasSecret, never the raw key, and is editable", async () => {
    const { alice } = await setup();
    const res = await alice.post("/api/providers").send(sample);
    expect(res.status).toBe(201);
    expect(res.body.provider.hasSecret).toBe(true);
    expect(res.body.provider.editable).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("sk-secret");
  });

  it("user can edit own but not admin-assigned/global", async () => {
    const { admin, alice, ctx } = await setup();
    const aliceId = (await ctx.repos.users.findByUsername("alice"))!.id;

    const own = (await alice.post("/api/providers").send(sample)).body.provider;
    const glob = (await admin.post("/api/admin/providers").send({ ...sample, name: "Global" })).body.provider;
    const assigned = (await admin.post(`/api/admin/users/${aliceId}/providers`).send({ ...sample, name: "Assigned" })).body.provider;

    expect((await alice.patch(`/api/providers/${own.id}`).send({ name: "Renamed" })).status).toBe(200);
    expect((await alice.patch(`/api/providers/${glob.id}`).send({ name: "x" })).status).toBe(403);
    expect((await alice.patch(`/api/providers/${assigned.id}`).send({ name: "x" })).status).toBe(403);

    // alice sees all three, with correct editable flags
    const list = (await alice.get("/api/providers")).body.providers as { name: string; editable: boolean }[];
    const byName = Object.fromEntries(list.map((p) => [p.name, p.editable]));
    expect(byName["Renamed"]).toBe(true);
    expect(byName["Global"]).toBe(false);
    expect(byName["Assigned"]).toBe(false);
  });

  it("a custom image provider appears in /api/v1/models", async () => {
    const { alice } = await setup();
    const own = (await alice.post("/api/providers").send(sample)).body.provider;
    const models = (await alice.get("/api/v1/models")).body as { id: string; type: string[] }[];
    const m = models.find((x) => x.id === `${own.id}:img-1`);
    expect(m).toBeTruthy();
    expect(m!.type).toContain("text2image");
  });

  it("admin can delete any provider", async () => {
    const { admin, alice } = await setup();
    const own = (await alice.post("/api/providers").send(sample)).body.provider;
    expect((await admin.delete(`/api/admin/providers/${own.id}`)).status).toBe(200);
    const list = (await alice.get("/api/providers")).body.providers;
    expect(list.length).toBe(0);
  });
});
