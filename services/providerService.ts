import { CustomApiProvider, CustomApiProviderInput } from "../types";

/**
 * Custom / relay provider API client (OpenAI / Claude / Gemini formats).
 * Self endpoints (/api/providers) for the logged-in user; admin endpoints for
 * global and per-user management. Secrets are never returned (only hasSecret).
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

// --- Self-service (current user) ---

export const listProviders = (): Promise<CustomApiProvider[]> =>
  req("/api/providers", {}, (d) => d.providers as CustomApiProvider[]);

export const createProvider = (input: CustomApiProviderInput): Promise<CustomApiProvider> =>
  req("/api/providers", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) }, (d) => d.provider);

export const updateProvider = (id: string, patch: Partial<CustomApiProviderInput>): Promise<CustomApiProvider> =>
  req(`/api/providers/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) }, (d) => d.provider);

export const deleteProvider = (id: string): Promise<void> =>
  req(`/api/providers/${id}`, { method: "DELETE" }, () => undefined);

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
