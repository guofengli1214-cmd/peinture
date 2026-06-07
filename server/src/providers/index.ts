import type { AppContext } from "../context";
import { resolveForUse } from "../services/customProviders";
import { uploadCloudFile } from "../services/storageProxy";
import { parseModelId } from "./models";
import { ADAPTERS } from "./formats/index";
import type { AdapterContext, EditOpts, FormatAdapter, ImageParams, VideoOpts } from "./formats/shared";

export interface GenerateResult {
  id: string;
  url: string;
  seed?: number;
  steps?: number;
  guidance?: number;
}

/**
 * Provider dispatch for the generation proxy.
 *
 * Every model id is provider-qualified (`<providerId>:<modelId>`). The provider
 * id resolves to a custom/global provider record (DB-driven); its stored format
 * (openai / claude / gemini / gradio) selects the adapter from ADAPTERS, and the
 * model's capability selects the adapter method. Unknown provider ids throw
 * PROVIDER_NOT_AVAILABLE in resolveForUse.
 */

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
  if (model.enabled === false) throw new Error("MODEL_DISABLED");
  const adapter = ADAPTERS[cp.format];
  if (!adapter[cap]) throw new Error(`capability_not_supported:${String(cap)}`);
  return {
    c: {
      apiUrl: cp.apiUrl,
      secret: cp.secret,
      providerId: cp.id,
      providerName: cp.name,
      format: cp.format,
      uploadImage: async (blob, fileName) => {
        const buffer = Buffer.from(await blob.arrayBuffer());
        return uploadCloudFile(ctx, buffer, fileName, blob.type || "image/png");
      },
      model,
    },
    adapter,
  };
}

function logUpstreamFailure(ctx: AppContext, action: string, c: AdapterContext, err: unknown) {
  if (ctx.config.nodeEnv === "test") return;
  const e = err as {
    message?: string;
    cause?: { code?: string; errno?: number; syscall?: string; message?: string };
  };
  console.error(`[provider/${action}] upstream failed`, {
    providerId: c.providerId,
    providerName: c.providerName,
    format: c.format,
    apiUrl: c.apiUrl,
    modelId: c.model.modelId,
    editEndpoint: c.model.editEndpoint,
    error: e?.message,
    cause: e?.cause
      ? {
          code: e.cause.code,
          errno: e.cause.errno,
          syscall: e.cause.syscall,
          message: e.cause.message,
        }
      : undefined,
  });
}

export async function dispatchGenerate(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  params: ImageParams,
): Promise<GenerateResult> {
  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "generate");
  let r;
  try {
    r = await adapter.generate!(c, params);
  } catch (err) {
    logUpstreamFailure(ctx, "generate", c, err);
    throw err;
  }
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
  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "edit");
  let url: string;
  try {
    ({ url } = await adapter.edit!(c, images, prompt, opts));
  } catch (err) {
    logUpstreamFailure(ctx, "edit", c, err);
    throw err;
  }
  return { id: crypto.randomUUID(), url };
}

export async function dispatchText(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "text");
  try {
    return await adapter.text!(c, prompt, systemPrompt);
  } catch (err) {
    logUpstreamFailure(ctx, "text", c, err);
    throw err;
  }
}

/** HD upscale — a custom provider whose format supports upscale. */
export async function dispatchUpscale(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  image: Blob,
): Promise<{ url: string }> {
  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "upscale");
  try {
    return await adapter.upscale!(c, image);
  } catch (err) {
    logUpstreamFailure(ctx, "upscale", c, err);
    throw err;
  }
}

/** Image→video (Live) via a custom provider whose format supports video. */
export async function dispatchVideo(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  image: Blob,
  opts: VideoOpts,
): Promise<{ url: string }> {
  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "video");
  try {
    return await adapter.video!(c, image, opts);
  } catch (err) {
    logUpstreamFailure(ctx, "video", c, err);
    throw err;
  }
}
