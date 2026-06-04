import { describe, it, expect } from "vitest";
import { buildTestContext } from "../testing/helpers";
import { SEED_PROVIDERS, seedGlobalProviders } from "./seed";
import { listGlobal } from "../services/customProviders";

describe("seedGlobalProviders", () => {
  it("seeds all SEED_PROVIDERS as global, and is idempotent", async () => {
    const ctx = buildTestContext();
    const n1 = await seedGlobalProviders(ctx);
    expect(n1).toBe(SEED_PROVIDERS.length);

    const globals = await listGlobal(ctx);
    expect(globals.map((g) => g.name).sort()).toEqual(SEED_PROVIDERS.map((s) => s.name).sort());

    // Second run creates nothing (idempotent by name).
    const n2 = await seedGlobalProviders(ctx);
    expect(n2).toBe(0);
    expect((await listGlobal(ctx)).length).toBe(SEED_PROVIDERS.length);
  });

  it("HuggingFace is a gradio provider whose z-image-turbo carries full Gradio config", async () => {
    const ctx = buildTestContext();
    await seedGlobalProviders(ctx);
    const hf = (await listGlobal(ctx)).find((g) => g.name === "HuggingFace")!;
    expect(hf.format).toBe("gradio");
    const turbo = hf.models.find((m) => m.modelId === "z-image-turbo")!;
    expect(turbo.gradio?.baseUrl).toBe("https://mrfakename-z-image-turbo.hf.space");
    expect(turbo.gradio?.fnIndex).toBe(2);
    expect(turbo.gradio?.argsTemplate).toEqual(["$prompt", "$height", "$width", "$steps", "$seed", false]);
  });

  it("Pollinations openai-fast carries endpointPath /openai", async () => {
    const ctx = buildTestContext();
    await seedGlobalProviders(ctx);
    const poll = (await listGlobal(ctx)).find((g) => g.name === "Pollinations")!;
    expect(poll.models[0].endpointPath).toBe("/openai");
  });
});
