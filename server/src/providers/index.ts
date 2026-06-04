import type { AppContext } from "../context";
import type { ProviderId } from "../services/userConfig";
import { getProviderTokens } from "../services/userConfig";
import { resolveForUse } from "../services/customProviders";
import { parseModelId } from "./models";
import { ADAPTERS } from "./formats/index";
import type { AdapterContext, EditOpts, FormatAdapter, ImageParams, VideoOpts } from "./formats/shared";
import {
  generateHF,
  editHF,
  optimizeHF,
  upscaleHF,
  videoHF,
  type GenerateResult,
} from "./huggingface";

/**
 * Provider dispatch for the generation proxy.
 *
 *  - "huggingface"          -> the ported HF engine (kept until phase 5 cleanup)
 *  - other builtin names    -> not supported (removed once seeded) -> provider_not_supported
 *  - anything else (a UUID) -> a custom/global provider, routed by its stored
 *                              format (openai / claude / gemini / gradio) via ADAPTERS,
 *                              selecting the adapter method by the model's capability.
 */

const BUILTINS: ProviderId[] = ["huggingface", "gitee", "modelscope", "a4f", "openai", "google"];
const HF: ProviderId = "huggingface";

function isBuiltin(provider: string): boolean {
  return (BUILTINS as string[]).includes(provider);
}

async function tokensFor(ctx: AppContext, userId: number, provider: string): Promise<string[]> {
  if (!isBuiltin(provider)) return [];
  return getProviderTokens(ctx, userId, provider as ProviderId);
}

/** Resolve a custom provider + the selected model + verify the capability exists. */
async function resolveCustom(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  cap: keyof FormatAdapter,
): Promise<{ c: AdapterContext; adapter: FormatAdapter }> {
  const { provider, modelId } = parseModelId(qualifiedModel);
  const cp = await resolveForUse(ctx, userId, provider);
  const model = cp.models.find((m) => m.modelId === modelId);
  if (!model) throw new Error("MODEL_NOT_FOUND");
  const adapter = ADAPTERS[cp.format];
  if (!adapter[cap]) throw new Error(`capability_not_supported:${String(cap)}`);
  return { c: { apiUrl: cp.apiUrl, secret: cp.secret, model }, adapter };
}

export async function dispatchGenerate(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  params: ImageParams,
): Promise<GenerateResult> {
  const { provider, modelId } = parseModelId(qualifiedModel);
  if (provider === HF) return generateHF(modelId, params, await tokensFor(ctx, userId, provider));
  if (isBuiltin(provider)) throw new Error("provider_not_supported");

  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "generate");
  const r = await adapter.generate!(c, params);
  return {
    id: crypto.randomUUID(),
    url: r.url,
    seed: r.seed ?? params.seed,
    steps: r.steps ?? params.steps,
    guidance: r.guidance ?? params.guidance,
  };
}

export async function dispatchEdit(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  images: Blob[],
  prompt: string,
  opts: EditOpts,
): Promise<{ id: string; url: string; seed?: number }> {
  const { provider } = parseModelId(qualifiedModel);
  if (provider === HF) return editHF(images, prompt, opts, await tokensFor(ctx, userId, provider));
  if (isBuiltin(provider)) throw new Error("provider_not_supported");

  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "edit");
  const { url } = await adapter.edit!(c, images, prompt, opts);
  return { id: crypto.randomUUID(), url };
}

export async function dispatchText(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  const { provider, modelId } = parseModelId(qualifiedModel);
  if (provider === HF) return optimizeHF(prompt, systemPrompt, modelId);
  if (isBuiltin(provider)) throw new Error("provider_not_supported");

  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "text");
  return adapter.text!(c, prompt, systemPrompt);
}

/** HD upscale — HuggingFace (RealESRGAN) or a custom provider whose format supports upscale. */
export async function dispatchUpscale(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  image: Blob,
): Promise<{ url: string }> {
  const { provider } = parseModelId(qualifiedModel);
  if (provider === HF) return upscaleHF(image, await tokensFor(ctx, userId, provider));
  if (isBuiltin(provider)) throw new Error("provider_not_supported");

  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "upscale");
  return adapter.upscale!(c, image);
}

/** Image→video (Live). HuggingFace (Wan 2.2, sync via Gradio) or a custom provider. */
export async function dispatchVideo(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  image: Blob,
  opts: VideoOpts,
): Promise<{ url: string }> {
  const { provider } = parseModelId(qualifiedModel);
  if (provider === HF) return videoHF(image, opts, await tokensFor(ctx, userId, provider));
  if (isBuiltin(provider)) throw new Error("provider_not_supported");

  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "video");
  return adapter.video!(c, image, opts);
}
