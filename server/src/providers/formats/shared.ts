import { getDimensions } from "../dimensions";

/** Image-generation parameters common to all formats. */
export interface ImageParams {
  prompt: string;
  aspectRatio: string;
  seed?: number;
  steps?: number;
  guidance?: number;
  enableHD?: boolean;
}

/** A provider-format client. Claude implements only `text` (no image gen/edit). */
export interface FormatAdapter {
  generate(base: string, key: string | null, modelId: string, params: ImageParams): Promise<{ url: string }>;
  edit(base: string, key: string | null, modelId: string, images: Blob[], prompt: string, opts: { width?: number; height?: number }): Promise<{ url: string }>;
  text(base: string, key: string | null, modelId: string, prompt: string, systemPrompt: string): Promise<string>;
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
