import { ServerPublicConfig } from "../types";

/**
 * Config API client. The server is the single source of truth for per-user
 * settings; secrets (provider tokens, etc.) are never returned — only the
 * non-secret config plus "hasTokens" flags. All calls send the session cookie.
 */

/** Fields a normal user may change via PUT /api/config. */
export type ConfigPatch = Partial<{
  language: string;
  provider: string;
  model: string;
  aspectRatio: string;
  seed: string;
  steps: number;
  guidanceScale: number;
  autoTranslate: boolean;
  enableHD: boolean;
  systemPrompt: string;
  translationPrompt: string;
  editModelConfig: { provider: string; model: string };
  liveModelConfig: { provider: string; model: string };
  textModelConfig: { provider: string; model: string };
  upscalerModelConfig: { provider: string; model: string };
  videoSettings: Record<string, unknown>;
}>;

/** Load the current user's full (non-secret) configuration. */
export const fetchConfig = async (): Promise<ServerPublicConfig> => {
  const response = await fetch("/api/config", { credentials: "include" });
  if (!response.ok) throw new Error("config_fetch_failed");
  const { config } = await response.json();
  return config as ServerPublicConfig;
};

/** Persist a partial update of self-editable fields; returns the merged config. */
export const pushConfig = async (
  patch: ConfigPatch,
): Promise<ServerPublicConfig> => {
  const response = await fetch("/api/config", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error("config_save_failed");
  const { config } = await response.json();
  return config as ServerPublicConfig;
};
