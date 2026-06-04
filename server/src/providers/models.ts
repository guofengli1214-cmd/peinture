import type { ProviderId } from "../services/userConfig";

/**
 * Server-side model registry for the generation proxy.
 *
 * Each model is exposed to clients with a PROVIDER-QUALIFIED id ("huggingface:
 * z-image-turbo") so the proxy can route a generate/edit/etc. request back to
 * the right provider unambiguously. The frontend treats the id as opaque.
 *
 * Phase 6a ships HuggingFace (no token required — public quota). Other providers
 * are added here as they are ported; availableModels() then filters them by
 * whether the user has a token for that provider.
 */

export type ModelType = "text2image" | "image2image" | "image2video" | "text2text" | "upscaler";

export interface RegistryModel {
  provider: ProviderId;
  /** Bare provider model id, e.g. "z-image-turbo". */
  modelId: string;
  name: string;
  type: ModelType[];
  steps?: { range: [number, number]; default: number };
  guidance?: { range: [number, number]; default: number };
}

/** A model as returned to the browser (provider-qualified id + categorization). */
export interface ClientModel {
  id: string;
  name: string;
  type: ModelType[];
  steps?: { range: [number, number]; default: number };
  guidance?: { range: [number, number]; default: number };
}

export const REGISTRY: RegistryModel[] = [
  // --- HuggingFace: text2image ---
  { provider: "huggingface", modelId: "z-image-turbo", name: "Z-Image Turbo", type: ["text2image"], steps: { range: [1, 20], default: 9 } },
  { provider: "huggingface", modelId: "z-image", name: "Z-Image", type: ["text2image"], steps: { range: [1, 100], default: 30 }, guidance: { range: [1.5, 20], default: 4 } },
  { provider: "huggingface", modelId: "qwen-image", name: "Qwen Image", type: ["text2image"], steps: { range: [4, 28], default: 8 } },
  { provider: "huggingface", modelId: "ovis-image", name: "Ovis Image", type: ["text2image"], steps: { range: [1, 50], default: 20 } },
  { provider: "huggingface", modelId: "flux-1-schnell", name: "FLUX.1 Schnell", type: ["text2image"], steps: { range: [1, 50], default: 8 } },
  // --- HuggingFace: edit / video / text / upscaler ---
  { provider: "huggingface", modelId: "qwen-image-edit", name: "Qwen Image Edit", type: ["image2image"] },
  { provider: "huggingface", modelId: "wan2_2-i2v", name: "Wan 2.2", type: ["image2video"] },
  { provider: "huggingface", modelId: "openai-fast", name: "OpenAI 4o mini", type: ["text2text"] },
  { provider: "huggingface", modelId: "RealESRGAN_x4plus", name: "RealESRGAN x4 Plus", type: ["upscaler"] },
];

/** Providers that work without a user token (public quota). */
export const TOKEN_OPTIONAL_PROVIDERS: ProviderId[] = ["huggingface"];

/** Build the provider-qualified id. */
export function qualifiedId(m: RegistryModel): string {
  return `${m.provider}:${m.modelId}`;
}

/** Split a provider-qualified id back into its parts (defaults to huggingface). */
export function parseModelId(qualified: string): { provider: string; modelId: string } {
  const idx = qualified.indexOf(":");
  if (idx === -1) return { provider: "huggingface", modelId: qualified };
  return { provider: qualified.slice(0, idx), modelId: qualified.slice(idx + 1) };
}

/** Find the registry entry for a provider-qualified id. */
export function findModel(qualified: string): RegistryModel | undefined {
  const { provider, modelId } = parseModelId(qualified);
  return REGISTRY.find((m) => m.provider === provider && m.modelId === modelId);
}

/**
 * Models the user can actually use: token-optional providers always, plus any
 * provider the user has at least one token for.
 */
export function availableModels(hasToken: (p: ProviderId) => boolean): RegistryModel[] {
  return REGISTRY.filter(
    (m) => TOKEN_OPTIONAL_PROVIDERS.includes(m.provider) || hasToken(m.provider),
  );
}

/** Shape the registry models into the flat list the frontend expects. */
export function toClientModels(models: RegistryModel[]): ClientModel[] {
  return models.map((m) => ({
    id: qualifiedId(m),
    name: m.name,
    type: m.type,
    ...(m.steps ? { steps: m.steps } : {}),
    ...(m.guidance ? { guidance: m.guidance } : {}),
  }));
}

export type ModelCapability = "image" | "edit" | "text" | "video" | "upscale";

const CAP_TO_TYPE: Record<ModelCapability, ModelType> = {
  image: "text2image",
  edit: "image2image",
  text: "text2text",
  video: "image2video",
  upscale: "upscaler",
};

/**
 * Map a custom/relay provider's models to client models. Each model id is
 * provider-qualified (`<providerId>:<modelId>`) so the dispatch can route it.
 * Models with no recognized capability are dropped.
 */
export function customModelsToClient(
  providerId: string,
  models: { modelId: string; name: string; capabilities: ModelCapability[]; enabled?: boolean }[],
): ClientModel[] {
  return models
    .filter((m) => m.enabled !== false)
    .map((m) => ({
      id: `${providerId}:${m.modelId}`,
      name: m.name,
      type: (m.capabilities ?? []).map((c) => CAP_TO_TYPE[c]).filter(Boolean) as ModelType[],
    }))
    .filter((m) => m.type.length > 0);
}
