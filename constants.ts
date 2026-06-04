import { ModelOption, ProviderOption } from "./types";

export const getModelConfig = (
  provider: ProviderOption,
  model: ModelOption,
) => {
  if (provider === "gitee") {
    if (model === "z-image-turbo") return { min: 1, max: 20, default: 9 };
    if (model === "qwen-image") return { min: 4, max: 50, default: 20 };
    if (model === "flux-1-schnell") return { min: 1, max: 50, default: 8 };
    if (model === "flux-1-krea") return { min: 1, max: 50, default: 20 };
    if (model === "flux-1") return { min: 1, max: 50, default: 20 };
    if (model === "flux-2") return { min: 1, max: 50, default: 20 };
  } else if (provider === "modelscope") {
    if (model === "z-image-turbo") return { min: 1, max: 20, default: 9 };
    if (model === "z-image") return { min: 1, max: 100, default: 30 };
    if (model === "flux-2") return { min: 1, max: 50, default: 20 };
    if (model === "flux-1-krea") return { min: 1, max: 50, default: 20 };
    if (model === "flux-1") return { min: 1, max: 50, default: 20 };
  } else if (provider === "a4f") {
    return { min: 1, max: 20, default: 9 }; // A4F mostly ignores steps via API, using reasonable default
  } else {
    // Hugging Face
    if (model === "z-image-turbo") return { min: 1, max: 20, default: 9 };
    if (model === "z-image") return { min: 1, max: 100, default: 30 };
    if (model === "flux-1-schnell") return { min: 1, max: 50, default: 8 };
    if (model === "qwen-image") return { min: 4, max: 28, default: 8 };
    if (model === "ovis-image") return { min: 1, max: 50, default: 20 };
  }
  return { min: 1, max: 20, default: 9 }; // fallback
};

export const getGuidanceScaleConfig = (
  model: ModelOption,
  provider: ProviderOption,
) => {
  if (provider === "gitee") {
    if (model === "flux-1-schnell")
      return { min: 0, max: 50, step: 0.1, default: 7.5 };
    if (model === "flux-1-krea")
      return { min: 0, max: 20, step: 0.1, default: 4.5 };
    if (model === "flux-1") return { min: 0, max: 20, step: 0.1, default: 4.5 };
    if (model === "flux-2") return { min: 1, max: 10, step: 0.1, default: 3.5 };
  } else if (provider === "modelscope") {
    if (model === "z-image")
      return { min: 1.5, max: 20, step: 0.5, default: 4 };
    if (model === "flux-2") return { min: 1, max: 10, step: 0.1, default: 3.5 };
    if (model === "flux-1-krea")
      return { min: 1, max: 20, step: 0.1, default: 3.5 };
    if (model === "flux-1") return { min: 1, max: 20, step: 0.1, default: 3.5 };
  } else if (provider === "huggingface") {
    if (model === "z-image")
      return { min: 1.5, max: 20, step: 0.5, default: 4 };
  }
  return null;
};

