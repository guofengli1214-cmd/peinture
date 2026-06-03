import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { buildTestContext, seedUser } from "../testing/helpers";

async function appWithUser(opts: {
  username: string;
  password: string;
  role?: "user" | "admin";
  isActive?: boolean;
}) {
  const ctx = buildTestContext();
  await seedUser(ctx, opts);
  return { app: createApp(ctx), ctx };
}

describe("auth routes", () => {
  it("rejects bad credentials with 401", async () => {
    const { app } = await appWithUser({ username: "alice", password: "pw" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "alice", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed login body", async () => {
    const { app } = await appWithUser({ username: "alice", password: "pw" });
    const res = await request(app).post("/api/auth/login").send({ username: "alice" });
    expect(res.status).toBe(400);
  });

  it("logs in, sets an httpOnly cookie, returns the user without the password hash", async () => {
    const { app } = await appWithUser({ username: "alice", password: "pw" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "alice", password: "pw" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: "alice", role: "user" });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0];
    expect(cookie).toContain("peinture_session=");
    expect(cookie).toContain("HttpOnly");
  });

  it("GET /me is 401 without a session and 200 with one", async () => {
    const { app } = await appWithUser({ username: "alice", password: "pw" });
    expect((await request(app).get("/api/auth/me")).status).toBe(401);

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: "alice", password: "pw" });
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("alice");
  });

  it("logout clears the session", async () => {
    const { app } = await appWithUser({ username: "alice", password: "pw" });
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: "alice", password: "pw" });
    await agent.post("/api/auth/logout");
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("rejects login for a deactivated user", async () => {
    const { app } = await appWithUser({ username: "ghost", password: "pw", isActive: false });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "ghost", password: "pw" });
    expect(res.status).toBe(401);
  });
});
