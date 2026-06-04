import type { AppContext } from "../context";
import type { ProviderId } from "../services/userConfig";
import { getProviderTokens } from "../services/userConfig";
import { resolveForUse } from "../services/customProviders";
import { parseModelId } from "./models";
import { ADAPTERS } from "./formats/index";
import {
  generateHF,
  editHF,
  optimizeHF,
  upscaleHF,
  videoHF,
  type GenerateParams,
  type GenerateResult,
} from "./huggingface";

/**
 * Provider dispatch for the generation proxy.
 *
 * COMPILE BRIDGE (Task 1): the custom-provider call sites below were minimally
 * rewired to the new AdapterContext signature so the tree compiles after the
 * horizontal FormatAdapter change. The full capability-routing rewrite
 * (resolveCustom, MODEL_NOT_FOUND, gradio/video/upscale dispatch) lands in Task 4.
 *
 *  - "huggingface"          -> the ported HF engine (kept until Phase 5 cleanup)
 *  - other builtin names    -> provider_not_supported
 *  - anything else (a UUID) -> custom/global provider, routed by stored format via ADAPTERS
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

export async function dispatchGenerate(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  params: GenerateParams,
): Promise<GenerateResult> {
  const { provider, modelId } = parseModelId(qualifiedModel);
  if (provider === HF) return generateHF(modelId, params, await tokensFor(ctx, userId, provider));
  if (isBuiltin(provider)) throw new Error("provider_not_supported");

  const cp = await resolveForUse(ctx, userId, provider);
  const model = cp.models.find((m) => m.modelId === modelId) ?? { modelId, name: modelId, capabilities: [] };
  const { url } = await ADAPTERS[cp.format].generate!({ apiUrl: cp.apiUrl, secret: cp.secret, model }, params);
  return { id: crypto.randomUUID(), url, seed: params.seed, steps: params.steps, guidance: params.guidance };
}

export async function dispatchEdit(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  images: Blob[],
  prompt: string,
  opts: { width?: number; height?: number; steps?: number; guidance?: number },
): Promise<{ id: string; url: string; seed?: number }> {
  const { provider, modelId } = parseModelId(qualifiedModel);
  if (provider === HF) return editHF(images, prompt, opts, await tokensFor(ctx, userId, provider));
  if (isBuiltin(provider)) throw new Error("provider_not_supported");

  const cp = await resolveForUse(ctx, userId, provider);
  const model = cp.models.find((m) => m.modelId === modelId) ?? { modelId, name: modelId, capabilities: [] };
  const { url } = await ADAPTERS[cp.format].edit!({ apiUrl: cp.apiUrl, secret: cp.secret, model }, images, prompt, opts);
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

  const cp = await resolveForUse(ctx, userId, provider);
  const model = cp.models.find((m) => m.modelId === modelId) ?? { modelId, name: modelId, capabilities: [] };
  return ADAPTERS[cp.format].text!({ apiUrl: cp.apiUrl, secret: cp.secret, model }, prompt, systemPrompt);
}

/** HD upscale — HuggingFace only (RealESRGAN). */
export async function dispatchUpscale(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  image: Blob,
): Promise<{ url: string }> {
  const { provider } = parseModelId(qualifiedModel);
  if (provider === HF) return upscaleHF(image, await tokensFor(ctx, userId, provider));
  throw new Error("provider_not_supported");
}

/** Image→video (Live) — HuggingFace only (Wan 2.2), synchronous via Gradio. */
export async function dispatchVideo(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  image: Blob,
  opts: { prompt: string; duration: number; steps: number; guidance: number; seed?: number },
): Promise<{ url: string }> {
  const { provider } = parseModelId(qualifiedModel);
  if (provider === HF) return videoHF(image, opts, await tokensFor(ctx, userId, provider));
  throw new Error("provider_not_supported");
}
