import type { AppContext } from "../context";
import { adminUpdate, createGlobalProvider, type ProviderInput } from "../services/customProviders";

/**
 * Initial global providers seeded into custom_providers on first boot (idempotent
 * by name). Values are lifted from the legacy hardcoded config (huggingface.ts,
 * constants.ts API_MODEL_MAP) per spec appendix A. Secrets are left null — the
 * admin fills them in the global panel; the runtime-data migration (migrateData.ts)
 * also folds in existing per-user tokens.
 */

// Verbatim from huggingface.ts:22-23
const Z_IMAGE_NEGATIVE_PROMPT =
  "worst quality, low quality, JPEG compression artifacts, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, malformed limbs, fused fingers, cluttered background, three legs";
// Verbatim from huggingface.ts:24-25
const VIDEO_NEGATIVE_PROMPT =
  "Vivid colors, overexposed, static, blurry details, subtitles, style, artwork, painting, image, still, overall grayish tone, worst quality, low quality, JPEG compression artifacts, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, malformed limbs, fused fingers, still image, cluttered background, three legs, many people in the background, walking backward, Screen shaking";

const RIGHT_CODE_DRAW_MODELS: ProviderInput["models"] = [
  { modelId: "gpt-image-2", name: "GPT Image 2", capabilities: ["image", "edit"], editEndpoint: "generations" },
  { modelId: "gpt-image-2-vip", name: "GPT Image 2 VIP", capabilities: ["image", "edit"], editEndpoint: "generations" },
  { modelId: "nano-banana", name: "Nano Banana", capabilities: ["image", "edit"], editEndpoint: "generations" },
  { modelId: "nano-banana-2", name: "Nano Banana 2", capabilities: ["image", "edit"], editEndpoint: "generations" },
  { modelId: "nano-banana-pro", name: "Nano Banana Pro", capabilities: ["image", "edit"], editEndpoint: "generations" },
];

export const SEED_PROVIDERS: ProviderInput[] = [
  {
    name: "HuggingFace",
    format: "gradio",
    apiUrl: "", // gradio endpoints are per-model (model.gradio.baseUrl)
    secret: null,
    models: [
      { modelId: "z-image-turbo", name: "Z-Image Turbo", capabilities: ["image"],
        gradio: { baseUrl: "https://mrfakename-z-image-turbo.hf.space", fnIndex: 2, triggerId: 16,
          argsTemplate: ["$prompt", "$height", "$width", "$steps", "$seed", false],
          stepsDefault: 9, outputPath: "data[0]", seedPath: "data[1]" } },
      { modelId: "z-image", name: "Z-Image", capabilities: ["image"],
        gradio: { baseUrl: "https://mrfakename-z-image.hf.space", fnIndex: 2, triggerId: 18,
          argsTemplate: ["$prompt", "$negativePrompt", "$height", "$width", "$steps", "$guidance", "$seed", false],
          stepsDefault: 30, guidanceDefault: 4, negativePrompt: Z_IMAGE_NEGATIVE_PROMPT, outputPath: "data[0]" } },
      { modelId: "qwen-image", name: "Qwen Image", capabilities: ["image"],
        gradio: { baseUrl: "https://mcp-tools-qwen-image-fast.hf.space", fnIndex: 1, triggerId: 6,
          argsTemplate: ["$prompt", "$seed", false, "$aspectRatio", 3, "$steps"],
          stepsDefault: 8, outputPath: "data[0]" } },
      { modelId: "ovis-image", name: "Ovis Image", capabilities: ["image"],
        gradio: { baseUrl: "https://aidc-ai-ovis-image-7b.hf.space", fnIndex: 2, triggerId: 5,
          argsTemplate: ["$prompt", "$height", "$width", "$seed", "$steps", 4],
          stepsDefault: 20, outputPath: "data[0]" } },
      { modelId: "flux-1-schnell", name: "FLUX.1 Schnell", capabilities: ["image"],
        gradio: { baseUrl: "https://black-forest-labs-flux-1-schnell.hf.space", fnIndex: 2, triggerId: 5,
          argsTemplate: ["$prompt", "$seed", false, "$width", "$height", "$steps"],
          stepsDefault: 4, outputPath: "data[0]" } },
      { modelId: "qwen-image-edit", name: "Qwen Image Edit", capabilities: ["edit"],
        gradio: { baseUrl: "https://linoyts-qwen-image-edit-2511-fast.hf.space", fnIndex: 0, triggerId: 12,
          argsTemplate: ["$imagePayload", "$prompt", "$seed", false, "$guidance", "$steps", "$height", "$width", true],
          stepsDefault: 4, guidanceDefault: 1, outputPath: "data[0][0].image.url" } },
      { modelId: "wan2_2-i2v", name: "Wan 2.2", capabilities: ["video"],
        gradio: { baseUrl: "https://fradeck619-wan2-2-fp8da-aoti-faster.hf.space", fnIndex: 0, triggerId: 16,
          argsTemplate: ["$imageFile", "$prompt", "$steps", "$negativePrompt", "$duration", "$guidance", "$guidance", "$seed", false],
          negativePrompt: VIDEO_NEGATIVE_PROMPT, outputPath: "data[0]" } },
      { modelId: "RealESRGAN_x4plus", name: "RealESRGAN x4 Plus", capabilities: ["upscale"],
        gradio: { baseUrl: "https://tuan2308-upscaler.hf.space", fnIndex: 1, triggerId: 17,
          argsTemplate: ["$imageFile", "RealESRGAN_x4plus", 0.5, false, 4], outputPath: "data[0].url" } },
    ],
  },
  {
    name: "Pollinations", format: "openai", apiUrl: "https://text.pollinations.ai", secret: null,
    models: [{ modelId: "openai-fast", name: "OpenAI 4o mini", capabilities: ["text"], endpointPath: "/openai" }],
  },
  {
    name: "Right Code", format: "openai", apiUrl: "https://www.right.codes/draw", secret: null,
    models: RIGHT_CODE_DRAW_MODELS,
  },
  {
    // NOTE: modelId "gpt-5.4" carried over from the legacy default (userConfig.ts);
    // admin should set the real image model in the panel.
    name: "OpenAI", format: "openai", apiUrl: "https://api.openai.com", secret: null,
    models: [{ modelId: "gpt-5.4", name: "OpenAI Image", capabilities: ["image", "edit"] }],
  },
  {
    name: "Google", format: "gemini", apiUrl: "https://generativelanguage.googleapis.com/v1beta", secret: null,
    models: [{ modelId: "gemini-3.1-flash-image-preview", name: "Gemini Image", capabilities: ["image", "edit"] }],
  },
  {
    // modelIds are the upstream API names (constants.ts API_MODEL_MAP.gitee values).
    name: "Gitee AI", format: "openai", apiUrl: "https://ai.gitee.com", secret: null,
    models: [
      { modelId: "z-image-turbo", name: "Z-Image Turbo", capabilities: ["image"] },
      { modelId: "Qwen-Image", name: "Qwen Image", capabilities: ["image"] },
      { modelId: "FLUX.2-dev", name: "FLUX.2", capabilities: ["image"] },
      { modelId: "flux-1-schnell", name: "FLUX.1 Schnell", capabilities: ["image"] },
      { modelId: "FLUX_1-Krea-dev", name: "FLUX.1 Krea", capabilities: ["image"] },
      { modelId: "FLUX.1-dev", name: "FLUX.1", capabilities: ["image"] },
      { modelId: "Qwen-Image-Edit", name: "Qwen Image Edit", capabilities: ["edit"] },
      { modelId: "DeepSeek-V3.2", name: "DeepSeek V3.2", capabilities: ["text"] },
      { modelId: "Qwen3-Next-80B-A3B-Instruct", name: "Qwen 3", capabilities: ["text"] },
    ],
  },
  {
    name: "ModelScope", format: "openai", apiUrl: "https://api-inference.modelscope.cn", secret: null,
    models: [
      { modelId: "Tongyi-MAI/Z-Image-Turbo", name: "Z-Image Turbo", capabilities: ["image"] },
      { modelId: "Tongyi-MAI/Z-Image", name: "Z-Image", capabilities: ["image"] },
      { modelId: "black-forest-labs/FLUX.2-dev", name: "FLUX.2", capabilities: ["image"] },
      { modelId: "black-forest-labs/FLUX.1-Krea-dev", name: "FLUX.1 Krea", capabilities: ["image"] },
      { modelId: "MusePublic/489_ckpt_FLUX_1", name: "FLUX.1", capabilities: ["image"] },
      { modelId: "Qwen/Qwen-Image-Edit-2509", name: "Qwen Image Edit", capabilities: ["edit"] },
      { modelId: "deepseek-ai/DeepSeek-V3.2", name: "DeepSeek V3.2", capabilities: ["text"] },
      { modelId: "Qwen/Qwen3-Next-80B-A3B-Instruct", name: "Qwen 3", capabilities: ["text"] },
    ],
  },
  {
    name: "A4F", format: "openai", apiUrl: "https://api.a4f.co", secret: null,
    models: [
      { modelId: "provider-8/z-image", name: "Z-Image Turbo", capabilities: ["image"] },
      { modelId: "provider-8/imagen-4", name: "Google Imagen 4", capabilities: ["image"] },
      { modelId: "provider-4/imagen-3.5", name: "Google Imagen 3.5", capabilities: ["image"] },
      { modelId: "provider-5/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", capabilities: ["text"] },
      { modelId: "provider-2/deepseek-v3.1", name: "DeepSeek V3.1", capabilities: ["text"] },
      { modelId: "provider-2/deepseek-r1", name: "DeepSeek R1", capabilities: ["text"] },
      { modelId: "provider-8/qwen3-235b", name: "Qwen 3", capabilities: ["text"] },
      { modelId: "provider-8/glm-4.5", name: "GLM 4.5", capabilities: ["text"] },
      { modelId: "provider-8/kimi-k2-0905", name: "Kimi K2", capabilities: ["text"] },
    ],
  },
];

/** Seed any SEED_PROVIDERS not already present (matched by global name). Returns count created. */
export async function seedGlobalProviders(ctx: AppContext): Promise<number> {
  let created = 0;
  for (const seed of SEED_PROVIDERS) {
    const existing = await ctx.repos.customProviders.findGlobalByName(seed.name);
    if (existing) {
      if (seed.name === "Right Code") {
        await adminUpdate(ctx, existing.id, { models: seed.models });
      }
      continue;
    }
    await createGlobalProvider(ctx, seed);
    created++;
  }
  return created;
}
