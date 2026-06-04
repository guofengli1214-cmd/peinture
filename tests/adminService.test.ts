import { describe, it, expect, vi, afterEach } from "vitest";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from "../services/adminService";

const adminUser = {
  id: 2,
  username: "alice",
  role: "user" as const,
  displayName: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const okJson = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe("adminService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("listUsers GETs /api/admin/users and returns the array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ users: [adminUser] }));
    vi.stubGlobal("fetch", fetchMock);

    const users = await listUsers();

    expect(users).toEqual([adminUser]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/users");
    expect(init.credentials).toBe("include");
  });

  it("createUser POSTs the new account and returns it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ user: adminUser }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const user = await createUser({ username: "alice", password: "pw", role: "user" });

    expect(user).toEqual(adminUser);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/users");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({ username: "alice", password: "pw", role: "user" });
  });

  it("createUser throws username_taken on 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okJson({ error: "username_taken" }, 409)),
    );
    await expect(
      createUser({ username: "alice", password: "pw" }),
    ).rejects.toThrow("username_taken");
  });

  it("updateUser PATCHes the user and returns it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ user: { ...adminUser, isActive: false } }));
    vi.stubGlobal("fetch", fetchMock);

    const user = await updateUser(2, { isActive: false });

    expect(user.isActive).toBe(false);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/users/2");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ isActive: false });
  });

  it("deleteUser DELETEs the user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteUser(2);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/users/2");
    expect(init.method).toBe("DELETE");
    expect(init.credentials).toBe("include");
  });
});
