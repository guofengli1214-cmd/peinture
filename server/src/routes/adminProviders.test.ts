import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { buildTestContext, seedUser } from "../testing/helpers";

async function setup() {
  const ctx = buildTestContext();
  await seedUser(ctx, { username: "boss", password: "pw", role: "admin" });
  const app = createApp(ctx);
  return { ctx, app };
}

async function adminAgent(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username: "boss", password: "pw" });
  return agent;
}

describe("admin provider routes — gradio zod acceptance", () => {
  it("creates a gradio provider with per-model gradio config, video capability, and enabled:false", async () => {
    const { app } = await setup();
    const admin = await adminAgent(app);

    const res = await admin.post("/api/admin/providers").send({
      name: "HuggingFace",
      apiUrl: "",
      format: "gradio",
      models: [
        {
          modelId: "vid-1",
          name: "Video Model",
          capabilities: ["video"],
          enabled: false,
          gradio: {
            baseUrl: "https://demo.hf.space",
            fnIndex: 3,
            triggerId: 12,
            argsTemplate: ["$prompt", "$height", "$width", "$steps", "$seed", false],
            stepsDefault: 25,
            guidanceDefault: 7,
            negativePrompt: "blurry",
            outputPath: "data[0]",
            seedPath: "data[1]",
          },
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.provider.format).toBe("gradio");
    const model = res.body.provider.models[0];
    expect(model.enabled).toBe(false);
    expect(model.capabilities).toEqual(["video"]);
    expect(model.gradio.baseUrl).toBe("https://demo.hf.space");
    expect(model.gradio.fnIndex).toBe(3);
    expect(model.gradio.argsTemplate).toEqual([
      "$prompt",
      "$height",
      "$width",
      "$steps",
      "$seed",
      false,
    ]);
    expect(model.gradio.outputPath).toBe("data[0]");
  });
});

describe("admin provider routes — per-user routes removed", () => {
  it("GET /api/admin/users/:uid/providers returns 404 (route removed)", async () => {
    const { ctx, app } = await setup();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const admin = await adminAgent(app);

    const res = await admin.get(`/api/admin/users/${alice}/providers`);
    expect(res.status).toBe(404);
  });

  it("POST /api/admin/users/:uid/providers returns 404 (route removed)", async () => {
    const { ctx, app } = await setup();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const admin = await adminAgent(app);

    const res = await admin.post(`/api/admin/users/${alice}/providers`).send({
      name: "Relay",
      apiUrl: "https://relay",
      format: "openai",
      models: [{ modelId: "img-1", name: "Img", capabilities: ["image"] }],
    });
    expect(res.status).toBe(404);
  });
});
