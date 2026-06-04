import { describe, it, expect, vi, afterEach } from "vitest";
import {
  listGlobalProviders,
  createGlobalProvider,
  adminUpdateProvider,
} from "../services/providerService";

const prov = {
  id: "cp1",
  scope: "global",
  managedBy: "admin",
  ownerUserId: null,
  name: "Relay",
  apiUrl: "https://relay",
  format: "openai",
  models: [],
  enabled: true,
  hasSecret: true,
  editable: true,
};
const ok = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body });

describe("providerService (admin)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("admin endpoints hit the right URLs", async () => {
    const f = vi.fn().mockResolvedValue(ok({ providers: [] }));
    vi.stubGlobal("fetch", f);
    await listGlobalProviders();
    expect(f.mock.calls[0][0]).toBe("/api/admin/providers");

    const f2 = vi.fn().mockResolvedValue(ok({ provider: prov }, 201));
    vi.stubGlobal("fetch", f2);
    await createGlobalProvider({ name: "n", apiUrl: "u", format: "gemini", models: [] });
    expect(f2.mock.calls[0][0]).toBe("/api/admin/providers");
    expect(f2.mock.calls[0][1].method).toBe("POST");
  });

  it("throws the error code from the response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ error: "forbidden" }, 403)));
    await expect(adminUpdateProvider("cp1", { name: "x" })).rejects.toThrow("forbidden");
  });
});
