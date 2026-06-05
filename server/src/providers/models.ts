/**
 * Model id helpers + client model shaping for the generation proxy.
 *
 * Each model is exposed to clients with a PROVIDER-QUALIFIED id
 * ("<providerId>:<modelId>") so the proxy can route a generate/edit/etc. request
 * back to the right provider unambiguously. The frontend treats the id as opaque.
 * Providers and their models are entirely DB-driven (custom/global providers).
 */

export type ModelType = "text2image" | "image2image" | "image2video" | "text2text" | "upscaler";

/** A model as returned to the browser (provider-qualified id + categorization). */
export interface ClientModel {
  id: string;
  name: string;
  type: ModelType[];
  steps?: { range: [number, number]; default: number };
  guidance?: { range: [number, number]; default: number };
}

/** Split a provider-qualified id back into its parts (defaults to huggingface). */
export function parseModelId(qualified: string): { provider: string; modelId: string } {
  const idx = qualified.indexOf(":");
  if (idx === -1) return { provider: "huggingface", modelId: qualified };
  return { provider: qualified.slice(0, idx), modelId: qualified.slice(idx + 1) };
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
