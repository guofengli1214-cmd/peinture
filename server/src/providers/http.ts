/**
 * fetch with a small retry on transient network errors.
 *
 * Node's fetch (undici) pools keep-alive connections. Cloudflare-fronted hosts
 * (HuggingFace Spaces, Pollinations) often close idle sockets, so a reused
 * socket throws "fetch failed" / "other side closed" on the next request. These
 * are safe to retry (the server never received the request). HTTP error statuses
 * are NOT retried here — callers handle those.
 */

const TRANSIENT = /fetch failed|ECONNRESET|ECONNREFUSED|EAI_AGAIN|UND_ERR|socket|terminated|other side closed/i;

function isTransient(err: unknown): boolean {
  const e = err as { message?: string; cause?: { code?: string; message?: string } };
  const text = `${e?.message ?? ""} ${e?.cause?.code ?? ""} ${e?.cause?.message ?? ""}`;
  return TRANSIENT.test(text);
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Transient upstream gateway statuses worth a retry (Cloudflare-fronted hosts). */
const RETRY_STATUS = new Set([502, 503, 504]);

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retries = 2,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (RETRY_STATUS.has(res.status) && attempt < retries) {
        await delay(300 * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === retries) throw err;
      await delay(150 * (attempt + 1));
    }
  }
  throw lastErr;
}
