import { describe, it, expect } from "vitest";
import { buildCleanModels } from "../components/ProviderForm";
import { ApiProviderModelDef } from "../types";

const blankRow: ApiProviderModelDef = {
  modelId: "",
  name: "",
  capabilities: ["image"],
  enabled: true,
};

const validGradio: ApiProviderModelDef = {
  modelId: "flux",
  name: "Flux",
  capabilities: ["image"],
  enabled: true,
  gradio: {
    baseUrl: "https://gradio",
    fnIndex: 0,
    triggerId: 0,
    argsTemplate: [],
    outputPath: "data[0]",
  },
};

describe("buildCleanModels", () => {
  it("aligns argsTemplate by ORIGINAL index when an incomplete row precedes a valid gradio model", () => {
    const models = [blankRow, validGradio];
    const argsText = ["", '["$prompt","$seed"]'];

    const result = buildCleanModels(models, argsText, "gradio");
    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error("unexpected error");

    expect(result.models).toHaveLength(1);
    // Must read argsText[1] (original index), NOT argsText[0] -> [] (the bug).
    expect(result.models[0].gradio?.argsTemplate).toEqual(["$prompt", "$seed"]);
    expect(result.models[0].modelId).toBe("flux");
  });

  it("returns args_invalid for invalid JSON", () => {
    const result = buildCleanModels([validGradio], ["{not json"], "gradio");
    expect(result).toEqual({ error: "args_invalid" });
  });

  it("returns args_invalid when JSON is valid but not an array", () => {
    const result = buildCleanModels([validGradio], ['{"a":1}'], "gradio");
    expect(result).toEqual({ error: "args_invalid" });
  });

  it("does not parse args for non-gradio formats and trims fields", () => {
    const openaiModel: ApiProviderModelDef = {
      modelId: " gpt-image ",
      name: "  ",
      capabilities: ["image", "edit"],
      endpointPath: "/v1/images",
      editEndpoint: "generations",
    };
    const result = buildCleanModels([openaiModel], ["{not json"], "openai");
    if ("error" in result) throw new Error("unexpected error");
    expect(result.models).toHaveLength(1);
    expect(result.models[0].modelId).toBe("gpt-image");
    expect(result.models[0].name).toBe("gpt-image"); // falls back to modelId
    expect(result.models[0].endpointPath).toBe("/v1/images");
    expect(result.models[0].editEndpoint).toBe("generations");
    expect(result.models[0].gradio).toBeUndefined();
  });
});
