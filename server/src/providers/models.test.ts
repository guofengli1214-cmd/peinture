import { describe, it, expect } from "vitest";
import { parseModelId, customModelsToClient } from "./models";
import { runWithTokenRetry, isQuotaError } from "./tokenRetry";

describe("model id helpers", () => {
  it("parses provider-qualified ids", () => {
    expect(parseModelId("huggingface:z-image-turbo")).toEqual({
      provider: "huggingface",
      modelId: "z-image-turbo",
    });
  });

  it("defaults a bare id to huggingface", () => {
    expect(parseModelId("z-image-turbo")).toEqual({
      provider: "huggingface",
      modelId: "z-image-turbo",
    });
  });
});

describe("customModelsToClient enabled filtering", () => {
  it("drops models with enabled === false, keeps undefined/true", () => {
    const out = customModelsToClient("p1", [
      { modelId: "a", name: "A", capabilities: ["image"] },
      { modelId: "b", name: "B", capabilities: ["image"], enabled: true },
      { modelId: "c", name: "C", capabilities: ["image"], enabled: false },
    ] as any);
    expect(out.map((m) => m.id)).toEqual(["p1:a", "p1:b"]);
  });

  it("includes the upstream provider name when supplied", () => {
    const out = customModelsToClient("p1", [
      { modelId: "a", name: "A", capabilities: ["image"] },
    ], "Right Code");
    expect(out[0].providerName).toBe("Right Code");
  });
});

describe("token retry", () => {
  it("detects quota errors by status and message", () => {
    expect(isQuotaError({ status: 429 })).toBe(true);
    expect(isQuotaError(new Error("insufficient_quota"))).toBe(true);
    expect(isQuotaError(new Error("bad request"))).toBe(false);
  });

  it("runs once with null token when optional and none configured", async () => {
    let received: string | null = "unset";
    const out = await runWithTokenRetry([], { optional: true }, async (t) => {
      received = t;
      return "ok";
    });
    expect(out).toBe("ok");
    expect(received).toBeNull();
  });

  it("throws requiredError when not optional and none configured", async () => {
    await expect(
      runWithTokenRetry([], { requiredError: "need_token" }, async () => "x"),
    ).rejects.toThrow("need_token");
  });

  it("rotates to the next token on a quota error", async () => {
    const tried: string[] = [];
    const out = await runWithTokenRetry(["a", "b"], {}, async (t) => {
      tried.push(t!);
      if (t === "a") throw new Error("429");
      return "done";
    });
    expect(out).toBe("done");
    expect(tried).toEqual(["a", "b"]);
  });

  it("aborts immediately on a non-quota error", async () => {
    const tried: string[] = [];
    await expect(
      runWithTokenRetry(["a", "b"], {}, async (t) => {
        tried.push(t!);
        throw new Error("invalid prompt");
      }),
    ).rejects.toThrow("invalid prompt");
    expect(tried).toEqual(["a"]);
  });

  it("throws exhaustedError when all tokens hit quota", async () => {
    await expect(
      runWithTokenRetry(["a", "b"], { exhaustedError: "all_gone" }, async () => {
        throw new Error("429");
      }),
    ).rejects.toThrow("all_gone");
  });
});
