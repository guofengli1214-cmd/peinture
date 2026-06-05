import { fetchWithRetry } from "../http";
import {
  type FormatAdapter,
  type AdapterContext,
  type ImageParams,
  type EditOpts,
  getDimensions,
  trimBase,
  errText,
} from "./shared";

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

function extractImageUrl(text: string): string | null {
  try {
    const data = JSON.parse(text) as { url?: string; data?: { url?: string }[] };
    if (data.url) return data.url;
    if (data.data?.[0]?.url) return data.data[0].url;
  } catch {
    /* not JSON */
  }
  const dataUrl = text.match(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/i)?.[0];
  if (dataUrl) return dataUrl;
  const imageUrl = text.match(/https?:\/\/[^\s"'<>)]*?\.(?:png|jpe?g|webp|gif|avif)(?:\?[^\s"'<>)]*)?/i)?.[0];
  return imageUrl ?? null;
}

async function parseChatImageResponse(res: Response): Promise<{ url: string }> {
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data?.choices?.[0]?.message?.content ?? "";
  const url = extractImageUrl(content);
  if (url) return { url };
  throw new Error("error_invalid_response");
}

async function parseChatImageStream(res: Response): Promise<{ url: string }> {
  const reader = res.body?.getReader();
  if (!reader) return parseChatImageResponse(res);

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  while (true) {
    let read;
    try {
      read = await reader.read();
    } catch (err) {
      const url = extractImageUrl(content);
      if (url) return { url };
      throw err;
    }
    const { value, done } = read;
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: { delta?: { content?: string }; message?: { content?: string } }[];
        };
        content += chunk.choices?.map((c) => c.delta?.content ?? c.message?.content ?? "").join("") ?? "";
      } catch {
        /* ignore malformed SSE comments/chunks */
      }
    }

    const url = extractImageUrl(content);
    if (url) {
      await reader.cancel().catch(() => undefined);
      return { url };
    }

    if (done) break;
  }

  const url = extractImageUrl(content);
  if (url) return { url };
  throw new Error("error_invalid_response");
}

async function blobToBase64(blob: Blob): Promise<string> {
  return Buffer.from(await blob.arrayBuffer()).toString("base64");
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const b64 = await blobToBase64(blob);
  return `data:${blob.type || "image/png"};base64,${b64}`;
}

export const openaiAdapter: FormatAdapter = {
  async generate(c: AdapterContext, params: ImageParams) {
    const { width, height } = getDimensions(params.aspectRatio, params.enableHD ?? false);
    const res = await fetchWithRetry(v1(c.apiUrl, "/images/generations"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(c.secret) },
      body: JSON.stringify({ model: c.model.modelId, prompt: params.prompt, size: `${width}x${height}`, n: 1 }),
    });
    if (!res.ok) throw new Error(await errText(res));
    return parseImageResponse(res);
  },

  async edit(c: AdapterContext, images: Blob[], prompt: string, opts: EditOpts) {
    if (c.model.editEndpoint === "chatCompletions") {
      const imageUrls = await Promise.all(images.map(blobToDataUrl));
      const res = await fetchWithRetry(v1(c.apiUrl, "/chat/completions"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(c.secret) },
        body: JSON.stringify({
          model: c.model.modelId,
          stream: true,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
              ],
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(await errText(res));
      return parseChatImageStream(res);
    }

    if (c.model.editEndpoint === "generations") {
      const body: {
        model: string;
        prompt: string;
        image: string[];
        size?: string;
        response_format: "url";
      } = {
        model: c.model.modelId,
        prompt,
        image: await Promise.all(images.map(blobToBase64)),
        response_format: "url",
      };
      if (opts.width && opts.height) body.size = `${opts.width}x${opts.height}`;
      const res = await fetchWithRetry(v1(c.apiUrl, "/images/generations"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(c.secret) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await errText(res));
      return parseImageResponse(res);
    }

    const form = new FormData();
    form.append("model", c.model.modelId);
    form.append("prompt", prompt);
    if (opts.width && opts.height) form.append("size", `${opts.width}x${opts.height}`);
    images.forEach((b) => form.append("image", b));
    const res = await fetchWithRetry(v1(c.apiUrl, "/images/edits"), {
      method: "POST",
      headers: { ...authHeaders(c.secret) }, // let fetch set multipart boundary
      body: form,
    });
    if (!res.ok) throw new Error(await errText(res));
    return parseImageResponse(res);
  },

  async text(c: AdapterContext, prompt: string, systemPrompt: string) {
    const url = c.model.endpointPath ? trimBase(c.apiUrl) + c.model.endpointPath : v1(c.apiUrl, "/chat/completions");
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(c.secret) },
      body: JSON.stringify({
        model: c.model.modelId,
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
