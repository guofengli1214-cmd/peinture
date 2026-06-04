import type { AppContext } from "../context";
import type {
  CustomProviderRecord,
  ProviderFormat,
  UpdateCustomProviderInput,
} from "../repositories/types";
import type { Capability, ModelDef } from "../providers/formats/shared";

/**
 * Custom / relay provider service.
 *
 * Ownership & permissions:
 *   - global (admin-created): usable by everyone, editable only by admins.
 *   - user + managed_by='admin' (admin-assigned): usable by the owner, read-only to them.
 *   - user + managed_by='self' (user-created): usable & editable by the owner.
 *
 * Secrets (API keys) are AES-256-GCM encrypted at rest and never returned to
 * clients — only a `hasSecret` flag. The generation dispatch calls
 * `resolveForUse` server-side to get the decrypted key, after access checks.
 */

export type { Capability };

/** A provider's model definition (re-exported; gradio models carry a `gradio` block). */
export type ProviderModelDef = ModelDef;

export interface ProviderInput {
  name: string;
  apiUrl: string;
  format: ProviderFormat;
  models: ProviderModelDef[];
  secret?: string | null;
  enabled?: boolean;
}

export interface ProviderPatch {
  name?: string;
  apiUrl?: string;
  format?: ProviderFormat;
  models?: ProviderModelDef[];
  /** undefined = unchanged; null/"" = clear; string = replace. */
  secret?: string | null;
  enabled?: boolean;
}

export interface PublicProvider {
  id: string;
  scope: "global" | "user";
  managedBy: "admin" | "self";
  ownerUserId: number | null;
  name: string;
  apiUrl: string;
  format: ProviderFormat;
  models: ProviderModelDef[];
  enabled: boolean;
  hasSecret: boolean;
  editable: boolean;
}

function parseModels(json: string): ProviderModelDef[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as ProviderModelDef[]) : [];
  } catch {
    return [];
  }
}

/** Parse a provider record's models_json (exported for model aggregation). */
export function parseModelsJson(json: string): ProviderModelDef[] {
  return parseModels(json);
}

function toPublic(rec: CustomProviderRecord, editable: boolean): PublicProvider {
  return {
    id: rec.id,
    scope: rec.scope,
    managedBy: rec.managedBy,
    ownerUserId: rec.ownerUserId,
    name: rec.name,
    apiUrl: rec.apiUrl,
    format: rec.format,
    models: parseModels(rec.modelsJson),
    enabled: rec.enabled,
    hasSecret: !!rec.secretEncrypted,
    editable,
  };
}

function encryptSecret(ctx: AppContext, secret: string | null | undefined): string | null {
  if (!secret) return null;
  return ctx.crypto.encryptString(secret);
}

function patchToRepo(ctx: AppContext, patch: ProviderPatch): UpdateCustomProviderInput {
  const rp: UpdateCustomProviderInput = {};
  if (patch.name !== undefined) rp.name = patch.name;
  if (patch.apiUrl !== undefined) rp.apiUrl = patch.apiUrl;
  if (patch.format !== undefined) rp.format = patch.format;
  if (patch.models !== undefined) rp.modelsJson = JSON.stringify(patch.models);
  if (patch.enabled !== undefined) rp.enabled = patch.enabled;
  if (patch.secret !== undefined) rp.secretEncrypted = encryptSecret(ctx, patch.secret);
  return rp;
}

// --- Create ---

async function create(
  ctx: AppContext,
  scope: "global" | "user",
  ownerUserId: number | null,
  managedBy: "admin" | "self",
  input: ProviderInput,
  editable: boolean,
): Promise<PublicProvider> {
  const rec = await ctx.repos.customProviders.create({
    id: crypto.randomUUID(),
    scope,
    ownerUserId,
    managedBy,
    name: input.name,
    apiUrl: input.apiUrl,
    format: input.format,
    modelsJson: JSON.stringify(input.models ?? []),
    secretEncrypted: encryptSecret(ctx, input.secret),
    enabled: input.enabled ?? true,
  });
  return toPublic(rec, editable);
}

/** Admin creates a global (shared) provider. */
export function createGlobalProvider(ctx: AppContext, input: ProviderInput) {
  return create(ctx, "global", null, "admin", input, true);
}

// --- List ---

/** Admin: all global providers (editable). */
export async function listGlobal(ctx: AppContext): Promise<PublicProvider[]> {
  const globals = await ctx.repos.customProviders.listGlobal();
  return globals.map((r) => toPublic(r, true));
}

/** Enabled providers usable by a user, for model aggregation (records, not public view). */
export async function effectiveForUser(ctx: AppContext, userId: number): Promise<CustomProviderRecord[]> {
  const [globals, own] = await Promise.all([
    ctx.repos.customProviders.listGlobal(),
    ctx.repos.customProviders.listByOwner(userId),
  ]);
  return [...globals, ...own].filter((r) => r.enabled);
}

// --- Update / delete ---

export async function adminUpdate(ctx: AppContext, id: string, patch: ProviderPatch): Promise<PublicProvider> {
  const rec = await ctx.repos.customProviders.findById(id);
  if (!rec) throw new Error("NOT_FOUND");
  await ctx.repos.customProviders.update(id, patchToRepo(ctx, patch));
  const updated = await ctx.repos.customProviders.findById(id);
  return toPublic(updated!, true);
}

export async function adminDelete(ctx: AppContext, id: string): Promise<void> {
  await ctx.repos.customProviders.delete(id);
}

// --- Server-side resolution for the generation proxy ---

export interface ResolvedProvider {
  id: string;
  apiUrl: string;
  format: ProviderFormat;
  secret: string | null;
  models: ProviderModelDef[];
}

/**
 * Resolve a provider for use by `userId`, decrypting its key. Throws
 * PROVIDER_NOT_AVAILABLE if the provider doesn't exist or the user can't use it
 * (must be global, or owned by the user).
 */
export async function resolveForUse(
  ctx: AppContext,
  userId: number,
  providerId: string,
): Promise<ResolvedProvider> {
  const rec = await ctx.repos.customProviders.findById(providerId);
  const usable = rec && rec.enabled && (rec.scope === "global" || rec.ownerUserId === userId);
  if (!rec || !usable) throw new Error("PROVIDER_NOT_AVAILABLE");
  return {
    id: rec.id,
    apiUrl: rec.apiUrl,
    format: rec.format,
    secret: rec.secretEncrypted ? ctx.crypto.decryptString(rec.secretEncrypted) : null,
    models: parseModels(rec.modelsJson),
  };
}
