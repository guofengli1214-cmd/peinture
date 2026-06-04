import { fetchWithRetry } from "../http";
import { type FormatAdapter, type AdapterContext, type ImageParams, trimBase, errText } from "./shared";

function generateContentUrl(base: string, model: string): string {
  const b = trimBase(base);
  const root = b.endsWith("/v1beta") ? b : `${b}/v1beta`;
  return `${root}/models/${model}:generateContent`;
}

function keyHeader(key: string | null): Record<string, string> {
  return key ? { "x-goog-api-key": key } : {};
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}

async function parseImageResponse(res: Response): Promise<{ url: string }> {
  const data = (await res.json()) as { candidates?: { content?: { parts?: GeminiPart[] } }[] };
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = p.inlineData ?? p.inline_data;
    const mime = (p.inlineData?.mimeType ?? p.inline_data?.mime_type) || "image/png";
    if (inline?.data) return { url: `data:${mime};base64,${inline.data}` };
  }
  throw new Error("error_invalid_response");
}

export const geminiAdapter: FormatAdapter = {
  async generate(c: AdapterContext, params: ImageParams) {
    const res = await fetchWithRetry(generateContentUrl(c.apiUrl, c.model.modelId), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...keyHeader(c.secret) },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: params.prompt }] }] }),
    });
    if (!res.ok) throw new Error(await errText(res));
    return parseImageResponse(res);
  },

  async edit(c: AdapterContext, images: Blob[], prompt: string) {
    const parts: GeminiPart[] = [{ text: prompt }];
    for (const img of images) {
      const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
      parts.push({ inlineData: { mimeType: img.type || "image/png", data: b64 } });
    }
    const res = await fetchWithRetry(generateContentUrl(c.apiUrl, c.model.modelId), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...keyHeader(c.secret) },
      body: JSON.stringify({ contents: [{ role: "user", parts }] }),
    });
    if (!res.ok) throw new Error(await errText(res));
    return parseImageResponse(res);
  },

  async text(c: AdapterContext, prompt: string, systemPrompt: string) {
    const res = await fetchWithRetry(generateContentUrl(c.apiUrl, c.model.modelId), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...keyHeader(c.secret) },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });
    if (!res.ok) throw new Error("error_prompt_optimization_failed");
    const data = (await res.json()) as { candidates?: { content?: { parts?: GeminiPart[] } }[] };
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? "").join("");
    return text || prompt;
  },
};
