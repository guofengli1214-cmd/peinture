import { describe, it, expect, vi, afterEach } from "vitest";
import { buildTestContext, seedUser } from "../testing/helpers";
import { createSelfProvider, createGlobalProvider } from "../services/customProviders";
import { dispatchGenerate, dispatchText } from "./index";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => "" });

afterEach(() => vi.restoreAllMocks());

describe("generation dispatch — custom providers", () => {
  it("routes a custom OpenAI-format provider's model to the OpenAI adapter", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const p = await createSelfProvider(ctx, alice, {
      name: "Relay",
      apiUrl: "https://relay.example.com",
      format: "openai",
      models: [{ modelId: "img-1", name: "Img", capabilities: ["image"] }],
      secret: "sk-1",
    });

    const fetchMock = vi.fn().mockResolvedValue(ok({ data: [{ url: "https://img/out.png" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await dispatchGenerate(ctx, alice, `${p.id}:img-1`, { prompt: "a cat", aspectRatio: "1:1" });

    expect(res.url).toBe("https://img/out.png");
    expect(fetchMock.mock.calls[0][0]).toBe("https://relay.example.com/v1/images/generations");
    // the encrypted key was decrypted server-side and sent as Bearer
    expect(fetchMock.mock.calls[0][1].headers["Authorization"]).toBe("Bearer sk-1");
  });

  it("denies a custom provider the user cannot access", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const bob = (await seedUser(ctx, { username: "bob", password: "pw" })).id;
    const p = await createSelfProvider(ctx, alice, {
      name: "Relay", apiUrl: "https://relay", format: "openai",
      models: [{ modelId: "img-1", name: "Img", capabilities: ["image"] }], secret: "sk-1",
    });

    await expect(
      dispatchGenerate(ctx, bob, `${p.id}:img-1`, { prompt: "x", aspectRatio: "1:1" }),
    ).rejects.toThrow("PROVIDER_NOT_AVAILABLE");
  });

  it("global providers are usable by any user; claude routes text", async () => {
    const ctx = buildTestContext();
    const bob = (await seedUser(ctx, { username: "bob", password: "pw" })).id;
    const p = await createGlobalProvider(ctx, {
      name: "Claude", apiUrl: "https://api.anthropic.com", format: "claude",
      models: [{ modelId: "claude-x", name: "Claude", capabilities: ["text"] }], secret: "ak-1",
    });

    const fetchMock = vi.fn().mockResolvedValue(ok({ content: [{ type: "text", text: "optimized" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await dispatchText(ctx, bob, `${p.id}:claude-x`, "cat", "SYS");
    expect(out).toBe("optimized");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
  });

  it("builtin non-HF providers are not yet supported", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    await expect(
      dispatchGenerate(ctx, alice, "gitee:z-image-turbo", { prompt: "x", aspectRatio: "1:1" }),
    ).rejects.toThrow("provider_not_supported");
  });
});
