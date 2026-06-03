/**
 * HuggingFace provider, ported from the frontend services/hfService.ts.
 * Drives Gradio Spaces via the queue+SSE engine in gradio.ts. HF works without
 * a user token (public quota), so token rotation here is "optional".
 */

import { getDimensions } from "./dimensions";
import { runWithTokenRetry } from "./tokenRetry";
import { runGradioTask, uploadToGradio, makeSessionHash } from "./gradio";
import { fetchWithRetry } from "./http";

const ZIMAGE_BASE_API_URL = "https://mrfakename-z-image-turbo.hf.space";
const ZIMAGE_MODEL_BASE_API_URL = "https://mrfakename-z-image.hf.space";
const QWEN_IMAGE_BASE_API_URL = "https://mcp-tools-qwen-image-fast.hf.space";
const OVIS_IMAGE_BASE_API_URL = "https://aidc-ai-ovis-image-7b.hf.space";
const FLUX_SCHNELL_BASE_API_URL = "https://black-forest-labs-flux-1-schnell.hf.space";
const UPSCALER_BASE_API_URL = "https://tuan2308-upscaler.hf.space";
const POLLINATIONS_API_URL = "https://text.pollinations.ai/openai";
const WAN2_VIDEO_API_URL = "https://fradeck619-wan2-2-fp8da-aoti-faster.hf.space";
const QWEN_IMAGE_EDIT_BASE_API_URL = "https://linoyts-qwen-image-edit-2511-fast.hf.space";

const Z_IMAGE_NEGATIVE_PROMPT =
  "worst quality, low quality, JPEG compression artifacts, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, malformed limbs, fused fingers, cluttered background, three legs";
const VIDEO_NEGATIVE_PROMPT =
  "Vivid colors, overexposed, static, blurry details, subtitles, style, artwork, painting, image, still, overall grayish tone, worst quality, low quality, JPEG compression artifacts, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, malformed limbs, fused fingers, still image, cluttered background, three legs, many people in the background, walking backward, Screen shaking";

const QUOTA = { optional: true as const, exhaustedError: "error_quota_exhausted" };

function randomSeed(): number {
  return Math.round(Math.random() * 2147483647);
}

function extractUrl(first: unknown): string | undefined {
  if (Array.isArray(first) && (first[0] as { image?: { url?: string } })?.image?.url) {
    return (first[0] as { image: { url: string } }).image.url;
  }
  const f = first as { image?: { url?: string }; url?: string };
  if (f?.image?.url) return f.image.url;
  if (f?.url) return f.url;
  if (typeof first === "string") return first;
  return undefined;
}

export interface GenerateParams {
  prompt: string;
  aspectRatio: string;
  seed?: number;
  steps?: number;
  guidance?: number;
  enableHD?: boolean;
}

export interface GenerateResult {
  id: string;
  url: string;
  seed?: number;
  steps?: number;
  guidance?: number;
}

export async function generateHF(
  modelId: string,
  params: GenerateParams,
  tokens: string[],
): Promise<GenerateResult> {
  const seed = params.seed ?? randomSeed();
  const steps = params.steps;
  const { width, height } = getDimensions(params.aspectRatio, params.enableHD ?? false);

  return runWithTokenRetry(tokens, QUOTA, async (token) => {
    if (modelId === "flux-1-schnell") {
      const out = await runGradioTask<{ data: { url?: string }[] }>(
        FLUX_SCHNELL_BASE_API_URL,
        [params.prompt, seed, false, width, height, steps ?? 4],
        2, 5, token, makeSessionHash(),
      );
      const url = out.data?.[0]?.url;
      if (!url) throw new Error("error_invalid_response");
      return { id: crypto.randomUUID(), url, seed, steps };
    }

    if (modelId === "qwen-image") {
      const out = await runGradioTask<{ data: unknown[] }>(
        QWEN_IMAGE_BASE_API_URL,
        [params.prompt, seed, false, params.aspectRatio, 3, steps ?? 8],
        1, 6, token, makeSessionHash(),
      );
      const url = extractUrl(out.data?.[0]);
      if (!url) throw new Error("error_invalid_response");
      return { id: crypto.randomUUID(), url, seed, steps };
    }

    if (modelId === "ovis-image") {
      const out = await runGradioTask<{ data: { url?: string }[] }>(
        OVIS_IMAGE_BASE_API_URL,
        [params.prompt, height, width, seed, steps ?? 20, 4],
        2, 5, token, makeSessionHash(),
      );
      const url = out.data?.[0]?.url;
      if (!url) throw new Error("error_invalid_response");
      return { id: crypto.randomUUID(), url, seed, steps };
    }

    if (modelId === "z-image") {
      const out = await runGradioTask<{ data: unknown[] }>(
        ZIMAGE_MODEL_BASE_API_URL,
        [params.prompt, Z_IMAGE_NEGATIVE_PROMPT, height, width, steps ?? 30, params.guidance ?? 4, seed, false],
        2, 18, token, makeSessionHash(),
      );
      const url = extractUrl(out.data?.[0]);
      if (!url) throw new Error("error_invalid_response");
      return { id: crypto.randomUUID(), url, seed, steps, guidance: params.guidance };
    }

    // Default: z-image-turbo
    const out = await runGradioTask<{ data: unknown[] }>(
      ZIMAGE_BASE_API_URL,
      [params.prompt, height, width, steps ?? 9, seed, false],
      2, 16, token, makeSessionHash(),
    );
    const url = extractUrl(out.data?.[0]);
    if (!url) throw new Error("error_invalid_response");
    const returnedSeed = typeof out.data?.[1] === "number" ? (out.data[1] as number) : seed;
    return { id: crypto.randomUUID(), url, seed: returnedSeed, steps };
  });
}

export async function editHF(
  images: Blob[],
  prompt: string,
  opts: { width?: number; height?: number; steps?: number; guidance?: number },
  tokens: string[],
): Promise<{ id: string; url: string; seed: number }> {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;
  const steps = opts.steps ?? 4;
  const guidance = opts.guidance ?? 1;

  return runWithTokenRetry(tokens, QUOTA, async (token) => {
    const seed = randomSeed();
    const payload = await Promise.all(
      images.map(async (blob) => {
        const path = await uploadToGradio(QWEN_IMAGE_EDIT_BASE_API_URL, blob, token);
        return { image: { path, meta: { _type: "gradio.FileData" } }, caption: null };
      }),
    );

    const out = await runGradioTask<{ data: unknown[] }>(
      QWEN_IMAGE_EDIT_BASE_API_URL,
      [payload, prompt, seed, false, guidance, steps, height, width, true],
      0, 12, token, makeSessionHash(),
    );

    const first = (out.data?.[0] as unknown[])?.[0];
    const url = (first as { image?: { url?: string } })?.image?.url;
    if (!url) throw new Error("error_invalid_response");
    return { id: crypto.randomUUID(), url, seed };
  });
}

export async function videoHF(
  imageBlob: Blob,
  opts: { prompt: string; duration: number; steps: number; guidance: number; seed?: number },
  tokens: string[],
): Promise<{ url: string }> {
  return runWithTokenRetry(tokens, QUOTA, async (token) => {
    const seed = opts.seed ?? 42;
    const filePath = await uploadToGradio(WAN2_VIDEO_API_URL, imageBlob, token);
    const out = await runGradioTask<{ data: unknown[] }>(
      WAN2_VIDEO_API_URL,
      [
        { path: filePath, meta: { _type: "gradio.FileData" } },
        opts.prompt, opts.steps, VIDEO_NEGATIVE_PROMPT, opts.duration,
        opts.guidance, opts.guidance, seed, false,
      ],
      0, 16, token, makeSessionHash(),
    );
    const vid = out.data?.[0] as { video?: { url?: string }; url?: string } | string | undefined;
    let url: string | undefined;
    if (typeof vid === "string") url = vid;
    else if (vid?.video?.url) url = vid.video.url;
    else if (vid?.url) url = vid.url;
    if (!url) throw new Error("No video output returned");
    return { url };
  });
}

export async function upscaleHF(imageBlob: Blob, tokens: string[]): Promise<{ url: string }> {
  return runWithTokenRetry(tokens, QUOTA, async (token) => {
    const filePath = await uploadToGradio(UPSCALER_BASE_API_URL, imageBlob, token);
    const out = await runGradioTask<{ data: { url?: string }[] }>(
      UPSCALER_BASE_API_URL,
      [{ path: filePath, meta: { _type: "gradio.FileData" } }, "RealESRGAN_x4plus", 0.5, false, 4],
      1, 17, token, makeSessionHash(),
    );
    const url = out.data?.[0]?.url;
    if (!url) throw new Error("error_upscale_failed");
    return { url };
  });
}

const FIXED_SYSTEM_PROMPT_SUFFIX =
  "\nEnsure the output language matches the language of user's prompt that needs to be optimized.";

/** Prompt optimization via Pollinations (no token needed). */
export async function optimizeHF(
  prompt: string,
  systemPrompt: string,
  model = "openai-fast",
): Promise<string> {
  const response = await fetchWithRetry(POLLINATIONS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt + FIXED_SYSTEM_PROMPT_SUFFIX },
        { role: "user", content: prompt },
      ],
      stream: false,
    }),
  });
  if (!response.ok) throw new Error("error_prompt_optimization_failed");
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content || prompt;
}
