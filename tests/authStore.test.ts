import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/authService", () => ({
  login: vi.fn(),
  logout: vi.fn(),
  fetchMe: vi.fn(),
}));

import { login as loginApi, logout as logoutApi, fetchMe } from "../services/authService";
import { useAuthStore } from "../store/authStore";

const adminUser = {
  id: 1,
  username: "admin",
  role: "admin" as const,
  displayName: null,
};

describe("authStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to a known baseline before each test.
    useAuthStore.setState({ user: null, status: "loading" });
  });

  it("starts in the loading state with no user", () => {
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().status).toBe("loading");
  });

  it("checkSession marks authenticated and stores the user", async () => {
    vi.mocked(fetchMe).mockResolvedValue(adminUser);

    await useAuthStore.getState().checkSession();

    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().user).toEqual(adminUser);
  });

  it("checkSession marks anonymous when there is no session", async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);

    await useAuthStore.getState().checkSession();

    expect(useAuthStore.getState().status).toBe("anonymous");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("login stores the user and marks authenticated", async () => {
    vi.mocked(loginApi).mockResolvedValue(adminUser);

    await useAuthStore.getState().login("admin", "secret");

    expect(loginApi).toHaveBeenCalledWith("admin", "secret");
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().user).toEqual(adminUser);
  });

  it("login rethrows and stays anonymous on failure", async () => {
    useAuthStore.setState({ status: "anonymous" });
    vi.mocked(loginApi).mockRejectedValue(new Error("invalid_credentials"));

    await expect(
      useAuthStore.getState().login("admin", "wrong"),
    ).rejects.toThrow("invalid_credentials");

    expect(useAuthStore.getState().status).toBe("anonymous");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("logout clears the user and marks anonymous", async () => {
    useAuthStore.setState({ user: adminUser, status: "authenticated" });
    vi.mocked(logoutApi).mockResolvedValue(undefined);

    await useAuthStore.getState().logout();

    expect(logoutApi).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe("anonymous");
    expect(useAuthStore.getState().user).toBeNull();
  });
});
