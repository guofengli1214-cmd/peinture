import { fetchWithRetry } from "../http";
import { type FormatAdapter, type AdapterContext, trimBase } from "./shared";

/** Anthropic Claude — text only (no image generation/editing). */
export const claudeAdapter: FormatAdapter = {
  async generate() {
    throw new Error("format_no_image");
  },
  async edit() {
    throw new Error("format_no_image");
  },
  async text(c: AdapterContext, prompt: string, systemPrompt: string) {
    const b = trimBase(c.apiUrl);
    const url = b.endsWith("/v1") ? `${b}/messages` : `${b}/v1/messages`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        ...(c.secret ? { "x-api-key": c.secret } : {}),
      },
      body: JSON.stringify({
        model: c.model.modelId,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error("error_prompt_optimization_failed");
    const data = (await res.json()) as { content?: { type?: string; text?: string }[] };
    const text = Array.isArray(data?.content) ? data.content.map((p) => p?.text ?? "").join("") : "";
    return text || prompt;
  },
};
