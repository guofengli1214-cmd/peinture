import { ModelOption, ProviderOption } from "./types";

export const HF_MODEL_OPTIONS = [
  { value: "z-image-turbo", label: "Z-Image Turbo" },
  { value: "z-image", label: "Z-Image" },
  { value: "qwen-image", label: "Qwen Image" },
  { value: "ovis-image", label: "Ovis Image" },
  { value: "flux-1-schnell", label: "FLUX.1 Schnell" },
];

export const GITEE_MODEL_OPTIONS = [
  { value: "z-image-turbo", label: "Z-Image Turbo" },
  { value: "qwen-image", label: "Qwen Image" },
  { value: "flux-2", label: "FLUX.2" },
  { value: "flux-1-schnell", label: "FLUX.1 Schnell" },
  { value: "flux-1-krea", label: "FLUX.1 Krea" },
  { value: "flux-1", label: "FLUX.1" },
];

export const MS_MODEL_OPTIONS = [
  { value: "z-image-turbo", label: "Z-Image Turbo" },
  { value: "z-image", label: "Z-Image" },
  { value: "flux-2", label: "FLUX.2" },
  { value: "flux-1-krea", label: "FLUX.1 Krea" },
  { value: "flux-1", label: "FLUX.1" },
];

export const A4F_MODEL_OPTIONS = [
  { value: "z-image-turbo", label: "Z-Image Turbo" },
  { value: "imagen-4", label: "Google Imagen 4" },
  { value: "imagen-3.5", label: "Google Imagen 3.5" },
];

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

