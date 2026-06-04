import { describe, it, expect, vi, afterEach } from "vitest";
import { ADAPTERS } from "./index";
import type { AdapterContext, ModelDef } from "./shared";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => "" });

function lastCall(mock: ReturnType<typeof vi.fn>) {
  const [url, init] = mock.mock.calls[mock.mock.calls.length - 1];
  return { url, init, body: init?.body ? JSON.parse(init.body) : undefined, headers: init?.headers ?? {} };
}

/** Build an AdapterContext for a given endpoint/secret/model id. */
function ctx(apiUrl: string, secret: string | null, modelId: string): AdapterContext {
  const model: ModelDef = { modelId, name: modelId, capabilities: ["image"] };
  return { apiUrl, secret, model };
}

describe("OpenAI format adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("generate posts to /v1/images/generations with Bearer auth and parses url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: [{ url: "https://img/out.png" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await ADAPTERS.openai.generate!(ctx("https://relay.example.com", "sk-x", "gpt-image-1"), {
      prompt: "a cat",
      aspectRatio: "1:1",
    });

    expect(res.url).toBe("https://img/out.png");
    const c = lastCall(fetchMock);
    expect(c.url).toBe("https://relay.example.com/v1/images/generations");
    expect(c.init.method).toBe("POST");
    expect(c.headers["Authorization"]).toBe("Bearer sk-x");
    expect(c.body.model).toBe("gpt-image-1");
    expect(c.body.prompt).toBe("a cat");
  });

  it("does not double /v1 when base already ends with it, and parses b64_json", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: [{ b64_json: "QUJD" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await ADAPTERS.openai.generate!(ctx("https://api.openai.com/v1", "sk-x", "m"), {
      prompt: "p",
      aspectRatio: "1:1",
    });

    expect(lastCall(fetchMock).url).toBe("https://api.openai.com/v1/images/generations");
    expect(res.url).toBe("data:image/png;base64,QUJD");
  });

  it("text posts to /v1/chat/completions and parses content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ choices: [{ message: { content: "better prompt" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await ADAPTERS.openai.text!(ctx("https://relay.example.com", "sk-x", "gpt-4o-mini"), "cat", "SYS");

    expect(out).toBe("better prompt");
    const c = lastCall(fetchMock);
    expect(c.url).toBe("https://relay.example.com/v1/chat/completions");
    expect(c.body.messages[0].role).toBe("system");
    expect(c.body.messages[0].content).toContain("SYS");
  });
});

describe("Claude format adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("text posts to /v1/messages with x-api-key + anthropic-version", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ content: [{ type: "text", text: "claude says hi" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await ADAPTERS.claude.text!(ctx("https://api.anthropic.com", "ak-1", "claude-x"), "cat", "SYS");

    expect(out).toBe("claude says hi");
    const c = lastCall(fetchMock);
    expect(c.url).toBe("https://api.anthropic.com/v1/messages");
    expect(c.headers["x-api-key"]).toBe("ak-1");
    expect(c.headers["anthropic-version"]).toBeTruthy();
    expect(c.body.system).toContain("SYS");
  });

  it("generate is unsupported", async () => {
    await expect(
      ADAPTERS.claude.generate!(ctx("https://api.anthropic.com", "ak-1", "m"), { prompt: "x", aspectRatio: "1:1" }),
    ).rejects.toThrow("format_no_image");
  });
});

describe("Gemini format adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("generate hits generateContent with x-goog-api-key and parses inline image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QUJD" } }] } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await ADAPTERS.gemini.generate!(ctx("https://generativelanguage.googleapis.com", "gk-1", "gemini-img"), {
      prompt: "a cat",
      aspectRatio: "1:1",
    });

    expect(res.url).toBe("data:image/png;base64,QUJD");
    const c = lastCall(fetchMock);
    expect(c.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-img:generateContent");
    expect(c.headers["x-goog-api-key"]).toBe("gk-1");
  });

  it("text parses candidates text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({ candidates: [{ content: { parts: [{ text: "gemini text" }] } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await ADAPTERS.gemini.text!(ctx("https://generativelanguage.googleapis.com", "gk-1", "gemini-pro"), "cat", "SYS");
    expect(out).toBe("gemini text");
  });
});
