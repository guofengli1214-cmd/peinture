import { describe, it, expect } from "vitest";
import { generateSessionId, createSession, resolveSession } from "./sessions";
import { buildTestContext, seedUser } from "../testing/helpers";

describe("generateSessionId", () => {
  it("returns 64 hex chars and is unique per call", () => {
    const a = generateSessionId();
    const b = generateSessionId();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe("createSession / resolveSession", () => {
  it("creates a session that resolves back to the active user", async () => {
    const ctx = buildTestContext();
    const user = await seedUser(ctx, { username: "alice", password: "pw" });
    const { id } = await createSession(ctx.repos, user.id, 60_000);

    const resolved = await resolveSession(ctx.repos, id);
    expect(resolved?.id).toBe(user.id);
    expect(resolved?.username).toBe("alice");
  });

  it("returns null for an unknown session id", async () => {
    const ctx = buildTestContext();
    expect(await resolveSession(ctx.repos, "nope")).toBeNull();
  });

  it("returns null and deletes the session when expired", async () => {
    const ctx = buildTestContext();
    const user = await seedUser(ctx, { username: "bob", password: "pw" });
    const { id } = await createSession(ctx.repos, user.id, -1000); // already expired

    expect(await resolveSession(ctx.repos, id)).toBeNull();
    expect(await ctx.repos.sessions.find(id)).toBeNull();
  });

  it("returns null when the user has been deactivated", async () => {
    const ctx = buildTestContext();
    const user = await seedUser(ctx, { username: "carol", password: "pw" });
    const { id } = await createSession(ctx.repos, user.id, 60_000);

    await ctx.repos.users.update(user.id, { isActive: false });
    expect(await resolveSession(ctx.repos, id)).toBeNull();
  });
});
