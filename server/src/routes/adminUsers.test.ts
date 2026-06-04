import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { buildTestContext, seedUser } from "../testing/helpers";
import type { AppContext } from "../context";

async function setup() {
  const ctx = buildTestContext();
  await seedUser(ctx, { username: "boss", password: "pw", role: "admin" });
  await seedUser(ctx, { username: "alice", password: "pw", role: "user" });
  const app = createApp(ctx);
  return { ctx, app };
}

async function agentFor(app: ReturnType<typeof createApp>, username: string, password = "pw") {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username, password });
  return agent;
}

describe("admin user routes", () => {
  it("blocks anonymous (401) and non-admin (403) access", async () => {
    const { app } = await setup();
    expect((await request(app).get("/api/admin/users")).status).toBe(401);
    const alice = await agentFor(app, "alice");
    expect((await alice.get("/api/admin/users")).status).toBe(403);
  });

  it("lists users without password hashes", async () => {
    const { app } = await setup();
    const admin = await agentFor(app, "boss");
    const res = await admin.get("/api/admin/users");
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBe(2);
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
    expect(res.body.users.every((u: Record<string, unknown>) => u.passwordHash === undefined)).toBe(true);
  });

  it("creates a user that can then log in", async () => {
    const { app } = await setup();
    const admin = await agentFor(app, "boss");
    const res = await admin
      .post("/api/admin/users")
      .send({ username: "carol", password: "carolpw", role: "user" });
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe("carol");

    const carol = request.agent(app);
    expect((await carol.post("/api/auth/login").send({ username: "carol", password: "carolpw" })).status).toBe(200);
  });

  it("rejects duplicate usernames with 409", async () => {
    const { app } = await setup();
    const admin = await agentFor(app, "boss");
    const res = await admin.post("/api/admin/users").send({ username: "alice", password: "x" });
    expect(res.status).toBe(409);
  });

  it("deactivating a user revokes their active sessions", async () => {
    const { ctx, app } = await setup();
    const admin = await agentFor(app, "boss");
    const aliceAgent = await agentFor(app, "alice");
    expect((await aliceAgent.get("/api/config")).status).toBe(200);

    const alice = (await ctx.repos.users.findByUsername("alice"))!;
    await admin.patch(`/api/admin/users/${alice.id}`).send({ isActive: false });

    expect((await aliceAgent.get("/api/config")).status).toBe(401);
  });

  it("prevents an admin from deleting their own account", async () => {
    const { ctx, app } = await setup();
    const admin = await agentFor(app, "boss");
    const boss = (await ctx.repos.users.findByUsername("boss"))!;
    const res = await admin.delete(`/api/admin/users/${boss.id}`);
    expect(res.status).toBe(400);
  });
});

export type { AppContext };
