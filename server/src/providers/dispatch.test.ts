import { describe, it, expect, vi, afterEach } from "vitest";
import { buildTestContext, seedUser, seedUserProvider } from "../testing/helpers";
import { createGlobalProvider } from "../services/customProviders";
import { dispatchGenerate, dispatchText } from "./index";

vi.mock("./gradio", () => ({
  runGradioTask: vi.fn().mockResolvedValue({ data: [{ url: "https://hf/g.png" }, 555] }),
  uploadToGradio: vi.fn().mockResolvedValue("/tmp/x"),
  makeSessionHash: () => "h",
}));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => "" });

afterEach(() => vi.restoreAllMocks());

describe("generation dispatch — custom providers", () => {
  it("routes a custom OpenAI-format provider's model to the OpenAI adapter", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const providerId = await seedUserProvider(ctx, alice, {
      name: "Relay",
      apiUrl: "https://relay.example.com",
      format: "openai",
      models: [{ modelId: "img-1", name: "Img", capabilities: ["image"] }],
      secret: "sk-1",
    });

    const fetchMock = vi.fn().mockResolvedValue(ok({ data: [{ url: "https://img/out.png" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await dispatchGenerate(ctx, alice, `${providerId}:img-1`, { prompt: "a cat", aspectRatio: "1:1" });

    expect(res.url).toBe("https://img/out.png");
    expect(fetchMock.mock.calls[0][0]).toBe("https://relay.example.com/v1/images/generations");
    // the encrypted key was decrypted server-side and sent as Bearer
    expect(fetchMock.mock.calls[0][1].headers["Authorization"]).toBe("Bearer sk-1");
  });

  it("denies a custom provider the user cannot access", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const bob = (await seedUser(ctx, { username: "bob", password: "pw" })).id;
    const providerId = await seedUserProvider(ctx, alice, {
      name: "Relay", apiUrl: "https://relay", format: "openai",
      models: [{ modelId: "img-1", name: "Img", capabilities: ["image"] }], secret: "sk-1",
    });

    await expect(
      dispatchGenerate(ctx, bob, `${providerId}:img-1`, { prompt: "x", aspectRatio: "1:1" }),
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

  it("routes a global gradio provider's model through the gradio adapter", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const p = await createGlobalProvider(ctx, {
      name: "HF",
      apiUrl: "",
      format: "gradio",
      models: [
        {
          modelId: "z-image-turbo",
          name: "Z-Image Turbo",
          capabilities: ["image"],
          gradio: {
            baseUrl: "https://space.hf.space",
            fnIndex: 2,
            triggerId: 16,
            argsTemplate: ["$prompt", "$height", "$width", "$steps", "$seed", false],
            stepsDefault: 9,
            outputPath: "data[0]",
            seedPath: "data[1]",
          },
        },
      ],
      secret: null,
    });

    const res = await dispatchGenerate(ctx, alice, `${p.id}:z-image-turbo`, {
      prompt: "a cat",
      aspectRatio: "1:1",
      seed: 42,
    });

    expect(res.url).toBe("https://hf/g.png");
    expect(res.seed).toBe(555);
  });

  it("rejects an unknown model id on a custom provider", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const p = await createGlobalProvider(ctx, {
      name: "Relay", apiUrl: "https://relay", format: "openai",
      models: [{ modelId: "img-1", name: "Img", capabilities: ["image"] }], secret: "sk-1",
    });
    await expect(
      dispatchGenerate(ctx, alice, `${p.id}:nope`, { prompt: "x", aspectRatio: "1:1" }),
    ).rejects.toThrow("MODEL_NOT_FOUND");
  });

  it("rejects a disabled provider even if requested directly", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const p = await createGlobalProvider(ctx, {
      name: "Relay", apiUrl: "https://relay", format: "openai",
      models: [{ modelId: "img-1", name: "Img", capabilities: ["image"] }], secret: "sk-1",
      enabled: false,
    });
    await expect(
      dispatchGenerate(ctx, alice, `${p.id}:img-1`, { prompt: "x", aspectRatio: "1:1" }),
    ).rejects.toThrow("PROVIDER_NOT_AVAILABLE");
  });

  it("rejects a disabled model even if requested directly", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const p = await createGlobalProvider(ctx, {
      name: "Relay", apiUrl: "https://relay", format: "openai",
      models: [{ modelId: "img-1", name: "Img", capabilities: ["image"], enabled: false }], secret: "sk-1",
    });
    await expect(
      dispatchGenerate(ctx, alice, `${p.id}:img-1`, { prompt: "x", aspectRatio: "1:1" }),
    ).rejects.toThrow("MODEL_DISABLED");
  });
});
