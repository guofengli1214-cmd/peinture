import { z } from "zod";
import type { Response } from "express";

/** Shared zod schemas + helpers for the custom-provider routes. */

const capability = z.enum(["image", "edit", "text"]);
const modelDef = z.object({
  modelId: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  capabilities: z.array(capability).min(1),
});

export const providerCreateSchema = z.object({
  name: z.string().min(1).max(128),
  apiUrl: z.string().min(1).max(1024),
  format: z.enum(["openai", "claude", "gemini"]),
  models: z.array(modelDef).max(200),
  secret: z.string().max(4096).nullish(),
  enabled: z.boolean().optional(),
});

export const providerPatchSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  apiUrl: z.string().min(1).max(1024).optional(),
  format: z.enum(["openai", "claude", "gemini"]).optional(),
  models: z.array(modelDef).max(200).optional(),
  secret: z.string().max(4096).nullish(),
  enabled: z.boolean().optional(),
});

/** Map service errors to HTTP statuses. */
export function sendServiceError(res: Response, err: unknown): void {
  const msg = (err as Error)?.message ?? "error";
  if (msg === "FORBIDDEN") {
    res.status(403).json({ error: "forbidden" });
  } else if (msg === "NOT_FOUND" || msg === "PROVIDER_NOT_AVAILABLE") {
    res.status(404).json({ error: "not_found" });
  } else {
    res.status(500).json({ error: msg });
  }
}
