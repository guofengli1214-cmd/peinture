import { getDimensions } from "../dimensions";

/** Capabilities a model can expose. */
export type Capability = "image" | "edit" | "text" | "video" | "upscale";

/** Per-model Gradio Space config (only present on gradio-format models). */
export interface GradioModelConfig {
  baseUrl: string;
  fnIndex: number;
  triggerId: number;
  /** Positional args template; "$var" entries are substituted at call time. */
  argsTemplate: unknown[];
  stepsDefault?: number;
  guidanceDefault?: number;
  /** Literal negative prompt, injected wherever the template uses "$negativePrompt". */
  negativePrompt?: string;
  /** Path into the Gradio result, e.g. "data[0]" or "data[0][0].image.url". */
  outputPath: string;
  /** Optional path to read back a server-chosen seed, e.g. "data[1]". */
  seedPath?: string;
}

/** A model definition as stored in a provider's models_json. */
export interface ModelDef {
  modelId: string;
  name: string;
  capabilities: Capability[];
  gradio?: GradioModelConfig;
}

/** What every adapter call receives: provider-level endpoint/secret + the chosen model. */
export interface AdapterContext {
  apiUrl: string;
  secret: string | null;
  model: ModelDef;
}

/** Image-generation parameters common to all formats. */
export interface ImageParams {
  prompt: string;
  aspectRatio: string;
  seed?: number;
  steps?: number;
  guidance?: number;
  enableHD?: boolean;
}

export interface EditOpts {
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
}

export interface VideoOpts {
  prompt: string;
  duration: number;
  steps: number;
  guidance: number;
  seed?: number;
}

export interface ImageResult {
  url: string;
  seed?: number;
  steps?: number;
  guidance?: number;
}

/**
 * A provider-format client. All methods are optional — an adapter only
 * implements the capabilities its format supports (Claude = text only; Gradio
 * = image/edit/video/upscale). The dispatch checks for the method and throws
 * `capability_not_supported:<cap>` if it is missing.
 */
export interface FormatAdapter {
  generate?(c: AdapterContext, params: ImageParams): Promise<ImageResult>;
  edit?(c: AdapterContext, images: Blob[], prompt: string, opts: EditOpts): Promise<{ url: string }>;
  text?(c: AdapterContext, prompt: string, systemPrompt: string): Promise<string>;
  video?(c: AdapterContext, image: Blob, opts: VideoOpts): Promise<{ url: string }>;
  upscale?(c: AdapterContext, image: Blob): Promise<{ url: string }>;
}

export { getDimensions };

/** Strip trailing slashes. */
export function trimBase(base: string): string {
  return base.replace(/\/+$/, "");
}

/** Best-effort error message from a failed upstream response. */
export async function errText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t) as { error?: { message?: string } | string };
      if (typeof j.error === "string") return j.error;
      if (j.error?.message) return j.error.message;
    } catch {
      /* not JSON */
    }
    return t || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
