/**
 * Gradio queue + SSE engine, ported from the frontend services/hfService.ts.
 * Runs entirely on Node 20 built-ins (fetch / ReadableStream / TextDecoder /
 * FormData / Blob). Used by the HuggingFace provider for every HF Space.
 */

export const QUOTA_ERROR_KEY = "error_quota_exhausted";

import { fetchWithRetry } from "./http";

/** Upload a file/blob to a Gradio Space and return its server-side path. */
export async function uploadToGradio(
  baseUrl: string,
  file: Blob,
  token: string | null,
): Promise<string> {
  const formData = new FormData();
  formData.append("files", file);

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetchWithRetry(`${baseUrl}/gradio_api/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload image to Gradio: ${response.statusText}`);
  }

  const result = (await response.json()) as string[];
  if (!result || !result[0]) throw new Error("Invalid upload response from Gradio");
  return result[0];
}

interface GradioPayload {
  data: unknown[];
  fn_index: number;
  trigger_id: number;
  session_hash: string;
  event_data: null;
}

/**
 * Join a Gradio queue and stream the result over SSE. Resolves with the
 * `process_completed` output. Throws QUOTA_ERROR_KEY on 429 / GPU-quota errors
 * so the caller can rotate tokens.
 */
export async function runGradioTask<T>(
  baseUrl: string,
  data: unknown[],
  fnIndex: number,
  triggerId: number,
  token: string | null,
  sessionHashSeed: string,
): Promise<T> {
  const session_hash = sessionHashSeed;

  const payload: GradioPayload = {
    data,
    fn_index: fnIndex,
    trigger_id: triggerId,
    session_hash,
    event_data: null,
  };

  const joinResponse = await fetchWithRetry(`${baseUrl}/gradio_api/queue/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!joinResponse.ok) {
    if (joinResponse.status === 429) throw new Error(QUOTA_ERROR_KEY);
    throw new Error(`Gradio Join Error: ${joinResponse.status}`);
  }

  const sseResponse = await fetchWithRetry(
    `${baseUrl}/gradio_api/queue/data?session_hash=${session_hash}`,
    {
      headers: {
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );

  if (!sseResponse.ok) {
    if (sseResponse.status === 429) throw new Error(QUOTA_ERROR_KEY);
    throw new Error(`Gradio SSE Error: ${sseResponse.status}`);
  }

  const reader = sseResponse.body?.getReader();
  if (!reader) throw new Error("No response body from Gradio stream");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        try {
          const msg = JSON.parse(jsonStr);

          if (msg.msg === "process_completed") {
            if (msg.success) {
              return msg.output as T;
            }
            const output = msg.output || {};
            const detail = output[" "] || output.error || "";
            const title = msg.title || output.title || "Gradio task process failed";
            const fullMessage = detail ? `${title}: ${detail}` : title;
            if (/quota/i.test(fullMessage) || fullMessage.includes("exceeded")) {
              throw new Error(QUOTA_ERROR_KEY);
            }
            throw new Error(fullMessage);
          }
        } catch (e) {
          if (
            e instanceof Error &&
            (e.message === QUOTA_ERROR_KEY ||
              e.message.includes(":") ||
              e.message.includes("failed"))
          ) {
            throw e;
          }
          // otherwise: ignore parse errors / irrelevant messages
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  throw new Error("Gradio stream closed without result");
}

/** A session hash for a Gradio task (Date.now is unavailable in some contexts; pass a seed). */
export function makeSessionHash(): string {
  return Date.now().toString(16) + Math.random().toString(16).slice(2, 8);
}
