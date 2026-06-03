import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { login, logout, fetchMe } from "../services/authService";

describe("authService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const adminUser = {
    id: 1,
    username: "admin",
    role: "admin" as const,
    displayName: null,
  };

  describe("login", () => {
    it("posts credentials and returns the user on success", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: adminUser }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const user = await login("admin", "secret");

      expect(user).toEqual(adminUser);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/auth/login");
      expect(init.method).toBe("POST");
      expect(init.credentials).toBe("include");
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(init.body)).toEqual({
        username: "admin",
        password: "secret",
      });
    });

    it("throws invalid_credentials on 401", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "invalid_credentials" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(login("admin", "wrong")).rejects.toThrow(
        "invalid_credentials",
      );
    });
  });

  describe("fetchMe", () => {
    it("returns the user when authenticated", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: adminUser }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const user = await fetchMe();

      expect(user).toEqual(adminUser);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/auth/me");
      expect(init.credentials).toBe("include");
    });

    it("returns null when unauthenticated (401)", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "unauthorized" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const user = await fetchMe();

      expect(user).toBeNull();
    });
  });

  describe("logout", () => {
    it("posts to the logout endpoint with credentials", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await logout();

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/auth/logout");
      expect(init.method).toBe("POST");
      expect(init.credentials).toBe("include");
    });
  });
});
