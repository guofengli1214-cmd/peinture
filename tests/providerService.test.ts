import { describe, it, expect, vi, afterEach } from "vitest";
import {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  listGlobalProviders,
  createUserProvider,
} from "../services/providerService";

const prov = {
  id: "cp1",
  scope: "user",
  managedBy: "self",
  ownerUserId: 2,
  name: "Relay",
  apiUrl: "https://relay",
  format: "openai",
  models: [],
  enabled: true,
  hasSecret: true,
  editable: true,
};
const ok = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body });

describe("providerService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("listProviders GETs /api/providers with credentials", async () => {
    const f = vi.fn().mockResolvedValue(ok({ providers: [prov] }));
    vi.stubGlobal("fetch", f);
    const list = await listProviders();
    expect(list).toEqual([prov]);
    expect(f.mock.calls[0][0]).toBe("/api/providers");
    expect(f.mock.calls[0][1].credentials).toBe("include");
  });

  it("createProvider POSTs the input", async () => {
    const f = vi.fn().mockResolvedValue(ok({ provider: prov }, 201));
    vi.stubGlobal("fetch", f);
    const input = { name: "Relay", apiUrl: "https://relay", format: "openai" as const, models: [], secret: "sk" };
    const created = await createProvider(input);
    expect(created.id).toBe("cp1");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/providers");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it("updateProvider PATCHes /api/providers/:id", async () => {
    const f = vi.fn().mockResolvedValue(ok({ provider: prov }));
    vi.stubGlobal("fetch", f);
    await updateProvider("cp1", { name: "X" });
    expect(f.mock.calls[0][0]).toBe("/api/providers/cp1");
    expect(f.mock.calls[0][1].method).toBe("PATCH");
  });

  it("deleteProvider DELETEs /api/providers/:id", async () => {
    const f = vi.fn().mockResolvedValue(ok({ ok: true }));
    vi.stubGlobal("fetch", f);
    await deleteProvider("cp1");
    expect(f.mock.calls[0][0]).toBe("/api/providers/cp1");
    expect(f.mock.calls[0][1].method).toBe("DELETE");
  });

  it("admin endpoints hit the right URLs", async () => {
    const f = vi.fn().mockResolvedValue(ok({ providers: [] }));
    vi.stubGlobal("fetch", f);
    await listGlobalProviders();
    expect(f.mock.calls[0][0]).toBe("/api/admin/providers");

    const f2 = vi.fn().mockResolvedValue(ok({ provider: prov }, 201));
    vi.stubGlobal("fetch", f2);
    await createUserProvider(5, { name: "n", apiUrl: "u", format: "gemini", models: [] });
    expect(f2.mock.calls[0][0]).toBe("/api/admin/users/5/providers");
    expect(f2.mock.calls[0][1].method).toBe("POST");
  });

  it("throws username_taken-style error code from the body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ error: "forbidden" }, 403)));
    await expect(updateProvider("cp1", { name: "x" })).rejects.toThrow("forbidden");
  });
});
