/**
 * Gradio format adapter — drives any Gradio Space from a DB-stored config
 * (baseUrl / fnIndex / triggerId / argsTemplate / outputPath). The args
 * template uses a tiny DSL: "$var" strings are substituted from runtime values,
 * everything else is passed through literally.
 */

import { getDimensions } from "../dimensions";
import { runGradioTask, uploadToGradio, makeSessionHash } from "../gradio";
import { runWithTokenRetry } from "../tokenRetry";
import type { FormatAdapter, AdapterContext, ImageParams, EditOpts, VideoOpts, ImageResult } from "./shared";

/** Render a Gradio args template: "$var" → vars[var]; everything else literal. */
export function renderTemplate(template: unknown[], vars: Record<string, unknown>): unknown[] {
  return template.map((el) => renderValue(el, vars));
}

function renderValue(el: unknown, vars: Record<string, unknown>): unknown {
  if (typeof el === "string" && el.startsWith("$")) {
    const key = el.slice(1);
    if (!(key in vars)) throw new Error(`gradio_template_var_missing:${key}`);
    return vars[key];
  }
  if (Array.isArray(el)) return el.map((x) => renderValue(x, vars));
  if (el && typeof el === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(el as Record<string, unknown>)) out[k] = renderValue(v, vars);
    return out;
  }
  return el;
}

/** Read a value from a nested object by a path like "data[0].image.url". */
export function getByPath(root: unknown, path: string): unknown {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = root;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Extract an image/file/video url from common Gradio output shapes. */
export function extractUrl(first: unknown): string | undefined {
  if (Array.isArray(first) && (first[0] as { image?: { url?: string } })?.image?.url) {
    return (first[0] as { image: { url: string } }).image.url;
  }
  const f = first as { image?: { url?: string }; url?: string; video?: { url?: string } };
  if (f?.image?.url) return f.image.url;
  if (f?.video?.url) return f.video.url;
  if (f?.url) return f.url;
  if (typeof first === "string") return first;
  return undefined;
}

const QUOTA = { optional: true as const, exhaustedError: "error_quota_exhausted" };

function randomSeed(): number {
  return Math.round(Math.random() * 2147483647);
}

/** Split a comma-separated secret into a token list for rotation (empty => []). */
function splitSecret(secret: string | null): string[] {
  return secret ? secret.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function fileData(path: string) {
  return { path, meta: { _type: "gradio.FileData" } };
}

export const gradioAdapter: FormatAdapter = {
  async generate(c: AdapterContext, params: ImageParams): Promise<ImageResult> {
    const g = c.model.gradio;
    if (!g) throw new Error("gradio_config_missing");
    const { width, height } = getDimensions(params.aspectRatio, params.enableHD ?? false);
    const seed = params.seed ?? randomSeed();
    const vars: Record<string, unknown> = {
      prompt: params.prompt,
      seed,
      width,
      height,
      steps: params.steps ?? g.stepsDefault ?? 9,
      guidance: params.guidance ?? g.guidanceDefault ?? 4,
      aspectRatio: params.aspectRatio,
      negativePrompt: g.negativePrompt ?? "",
    };
    const data = renderTemplate(g.argsTemplate, vars);
    const out = await runWithTokenRetry(splitSecret(c.secret), QUOTA, (token) =>
      runGradioTask<{ data: unknown[] }>(g.baseUrl, data, g.fnIndex, g.triggerId, token, makeSessionHash()),
    );
    const url = extractUrl(getByPath(out, g.outputPath));
    if (!url) throw new Error("error_invalid_response");
    const back = g.seedPath ? getByPath(out, g.seedPath) : seed;
    return { url, seed: typeof back === "number" ? back : seed, steps: vars.steps as number, guidance: params.guidance };
  },

  async edit(c: AdapterContext, images: Blob[], prompt: string, opts: EditOpts) {
    const g = c.model.gradio;
    if (!g) throw new Error("gradio_config_missing");
    const width = opts.width ?? 1024;
    const height = opts.height ?? 1024;
    const seed = randomSeed();
    return runWithTokenRetry(splitSecret(c.secret), QUOTA, async (token) => {
      const imagePayload = await Promise.all(
        images.map(async (b) => ({ image: fileData(await uploadToGradio(g.baseUrl, b, token)), caption: null })),
      );
      const vars: Record<string, unknown> = {
        imagePayload,
        prompt,
        seed,
        width,
        height,
        steps: opts.steps ?? g.stepsDefault ?? 4,
        guidance: opts.guidance ?? g.guidanceDefault ?? 1,
        negativePrompt: g.negativePrompt ?? "",
      };
      const out = await runGradioTask<{ data: unknown[] }>(
        g.baseUrl,
        renderTemplate(g.argsTemplate, vars),
        g.fnIndex,
        g.triggerId,
        token,
        makeSessionHash(),
      );
      const url = extractUrl(getByPath(out, g.outputPath));
      if (!url) throw new Error("error_invalid_response");
      return { url };
    });
  },

  async video(c: AdapterContext, image: Blob, opts: VideoOpts) {
    const g = c.model.gradio;
    if (!g) throw new Error("gradio_config_missing");
    const seed = opts.seed ?? 42;
    return runWithTokenRetry(splitSecret(c.secret), QUOTA, async (token) => {
      const imageFile = fileData(await uploadToGradio(g.baseUrl, image, token));
      const vars: Record<string, unknown> = {
        imageFile,
        prompt: opts.prompt,
        steps: opts.steps,
        duration: opts.duration,
        guidance: opts.guidance,
        seed,
        negativePrompt: g.negativePrompt ?? "",
      };
      const out = await runGradioTask<{ data: unknown[] }>(
        g.baseUrl,
        renderTemplate(g.argsTemplate, vars),
        g.fnIndex,
        g.triggerId,
        token,
        makeSessionHash(),
      );
      const url = extractUrl(getByPath(out, g.outputPath));
      if (!url) throw new Error("error_invalid_response");
      return { url };
    });
  },

  async upscale(c: AdapterContext, image: Blob) {
    const g = c.model.gradio;
    if (!g) throw new Error("gradio_config_missing");
    return runWithTokenRetry(splitSecret(c.secret), QUOTA, async (token) => {
      const imageFile = fileData(await uploadToGradio(g.baseUrl, image, token));
      const out = await runGradioTask<{ data: unknown[] }>(
        g.baseUrl,
        renderTemplate(g.argsTemplate, { imageFile }),
        g.fnIndex,
        g.triggerId,
        token,
        makeSessionHash(),
      );
      const url = extractUrl(getByPath(out, g.outputPath));
      if (!url) throw new Error("error_upscale_failed");
      return { url };
    });
  },
};
