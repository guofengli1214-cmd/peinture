import { describe, it, expect } from "vitest";
import { bootstrapAdmin } from "./bootstrap";
import { verifyPassword } from "./passwords";
import { buildTestContext, seedUser } from "../testing/helpers";

describe("bootstrapAdmin", () => {
  it("creates an admin when there are no users and a password is configured", async () => {
    const ctx = buildTestContext({ ADMIN_USERNAME: "root", ADMIN_PASSWORD: "s3cret" });
    const created = await bootstrapAdmin(ctx);

    expect(created?.username).toBe("root");
    expect(created?.role).toBe("admin");
    expect(await ctx.repos.users.count()).toBe(1);
    const user = await ctx.repos.users.findByUsername("root");
    expect(await verifyPassword("s3cret", user!.passwordHash)).toBe(true);
  });

  it("does nothing when users already exist", async () => {
    const ctx = buildTestContext({ ADMIN_USERNAME: "root", ADMIN_PASSWORD: "s3cret" });
    await seedUser(ctx, { username: "existing", password: "pw" });

    expect(await bootstrapAdmin(ctx)).toBeNull();
    expect(await ctx.repos.users.count()).toBe(1);
  });

  it("does nothing when no admin password is configured", async () => {
    const ctx = buildTestContext({ ADMIN_USERNAME: "root", ADMIN_PASSWORD: "" });
    expect(await bootstrapAdmin(ctx)).toBeNull();
    expect(await ctx.repos.users.count()).toBe(0);
  });
});
