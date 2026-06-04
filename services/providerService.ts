import { CustomApiProvider, CustomApiProviderInput } from "../types";

/**
 * Custom / relay provider API client (OpenAI / Claude / Gemini formats).
 * Admin-only endpoints for global and per-user provider management — regular
 * users cannot self-configure providers. Secrets are never returned (only hasSecret).
 */

const JSON_HEADERS = { "Content-Type": "application/json" };

async function req<T>(url: string, init: RequestInit, pick: (data: any) => T): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  if (!response.ok) {
    let code = "request_failed";
    try {
      const data = await response.json();
      if (data?.error) code = data.error;
    } catch {
      /* non-JSON */
    }
    throw new Error(code);
  }
  return pick(await response.json());
}

// --- Admin: global ---

export const listGlobalProviders = (): Promise<CustomApiProvider[]> =>
  req("/api/admin/providers", {}, (d) => d.providers as CustomApiProvider[]);

export const createGlobalProvider = (input: CustomApiProviderInput): Promise<CustomApiProvider> =>
  req("/api/admin/providers", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) }, (d) => d.provider);

// --- Admin: per-user ---

export const listUserProviders = (userId: number): Promise<CustomApiProvider[]> =>
  req(`/api/admin/users/${userId}/providers`, {}, (d) => d.providers as CustomApiProvider[]);

export const createUserProvider = (userId: number, input: CustomApiProviderInput): Promise<CustomApiProvider> =>
  req(`/api/admin/users/${userId}/providers`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) }, (d) => d.provider);

// --- Admin: edit/delete any provider by id ---

export const adminUpdateProvider = (id: string, patch: Partial<CustomApiProviderInput>): Promise<CustomApiProvider> =>
  req(`/api/admin/providers/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) }, (d) => d.provider);

export const adminDeleteProvider = (id: string): Promise<void> =>
  req(`/api/admin/providers/${id}`, { method: "DELETE" }, () => undefined);
