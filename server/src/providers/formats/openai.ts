import { fetchWithRetry } from "../http";
import { type FormatAdapter, type ImageParams, getDimensions, trimBase, errText } from "./shared";

/** Build an OpenAI-style URL, tolerating a base that already ends with /v1. */
function v1(base: string, sub: string): string {
  const b = trimBase(base);
  return b.endsWith("/v1") ? b + sub : b + "/v1" + sub;
}

function authHeaders(key: string | null): Record<string, string> {
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function parseImageResponse(res: Response): Promise<{ url: string }> {
  const data = (await res.json()) as { data?: { url?: string; b64_json?: string }[] };
  const item = data?.data?.[0];
  if (item?.url) return { url: item.url };
  if (item?.b64_json) return { url: `data:image/png;base64,${item.b64_json}` };
  throw new Error("error_invalid_response");
}

export const openaiAdapter: FormatAdapter = {
  async generate(base, key, modelId, params: ImageParams) {
    const { width, height } = getDimensions(params.aspectRatio, params.enableHD ?? false);
    const res = await fetchWithRetry(v1(base, "/images/generations"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(key) },
      body: JSON.stringify({ model: modelId, prompt: params.prompt, size: `${width}x${height}`, n: 1 }),
    });
    if (!res.ok) throw new Error(await errText(res));
    return parseImageResponse(res);
  },

  async edit(base, key, modelId, images, prompt, opts) {
    const form = new FormData();
    form.append("model", modelId);
    form.append("prompt", prompt);
    if (opts.width && opts.height) form.append("size", `${opts.width}x${opts.height}`);
    images.forEach((b) => form.append("image", b));
    const res = await fetchWithRetry(v1(base, "/images/edits"), {
      method: "POST",
      headers: { ...authHeaders(key) }, // let fetch set multipart boundary
      body: form,
    });
    if (!res.ok) throw new Error(await errText(res));
    return parseImageResponse(res);
  },

  async text(base, key, modelId, prompt, systemPrompt) {
    const res = await fetchWithRetry(v1(base, "/chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(key) },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        stream: false,
      }),
    });
    if (!res.ok) throw new Error("error_prompt_optimization_failed");
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data?.choices?.[0]?.message?.content || prompt;
  },
};
