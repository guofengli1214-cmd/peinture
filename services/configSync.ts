import {
  ServerPublicConfig,
  CustomProvider,
  ProviderOption,
  ModelOption,
  AspectRatioOption,
} from "../types";
import { Language } from "../translations";
import { useSettingsStore } from "../store/settingsStore";
import { useConfigStore } from "../store/configStore";
import { pushConfig, ConfigPatch } from "./configService";

/**
 * Bridges the server config (source of truth) and the in-memory Zustand stores:
 *   - hydrateFromServerConfig: load GET /api/config into the stores after login.
 *   - selfEditableSnapshot: the subset a normal user may PUT back.
 *   - startConfigSync: debounced PUT of self-editable changes to the server.
 *
 * Admin-locked keys (tokens, customProviders, serviceMode, openai/google config)
 * are intentionally never synced from the client; the server rejects them anyway.
 */

let hydrated = false;
// True while hydrateFromServerConfig is applying state, so the store
// subscriptions don't echo the hydration straight back to the server.
let applying = false;

const SYNC_DEBOUNCE_MS = 800;

export function hydrateFromServerConfig(cfg: ServerPublicConfig): void {
  applying = true;
  try {
    useSettingsStore.setState({
      language: cfg.language as Language,
      provider: cfg.provider as ProviderOption,
      model: cfg.model as ModelOption,
      aspectRatio: cfg.aspectRatio as AspectRatioOption,
      seed: cfg.seed,
      steps: cfg.steps,
      guidanceScale: cfg.guidanceScale,
      autoTranslate: cfg.autoTranslate,
      enableHD: cfg.enableHD,
    });

    // Map server custom providers to the client shape, deliberately dropping the
    // token: raw secrets never reach the browser (the proxy uses them server-side).
    const customProviders: CustomProvider[] = cfg.customProviders.map((p) => ({
      id: p.id,
      name: p.name,
      apiUrl: p.apiUrl,
      models: p.models,
      enabled: p.enabled,
    }));

    useConfigStore.setState({
      serviceMode: cfg.serviceMode,
      storageType: cfg.storageType,
      s3Config: cfg.s3Config,
      webdavConfig: cfg.webdavConfig,
      systemPrompt: cfg.systemPrompt,
      translationPrompt: cfg.translationPrompt,
      editModelConfig: cfg.editModelConfig,
      liveModelConfig: cfg.liveModelConfig,
      textModelConfig: cfg.textModelConfig,
      upscalerModelConfig: cfg.upscalerModelConfig,
      openaiConfig: cfg.openaiConfig,
      googleConfig: cfg.googleConfig,
      videoSettings: cfg.videoSettings,
      customProviders,
      hasTokens: cfg.hasTokens,
      _hasHydrated: true,
    });
  } finally {
    hydrated = true;
    applying = false;
  }
}

/** The self-editable fields a normal user is allowed to persist. */
export function selfEditableSnapshot(): ConfigPatch {
  const s = useSettingsStore.getState();
  const c = useConfigStore.getState();
  return {
    language: s.language,
    provider: s.provider,
    model: s.model,
    aspectRatio: s.aspectRatio,
    seed: s.seed,
    steps: s.steps,
    guidanceScale: s.guidanceScale,
    autoTranslate: s.autoTranslate,
    enableHD: s.enableHD,
    storageType: c.storageType,
    systemPrompt: c.systemPrompt,
    translationPrompt: c.translationPrompt,
    editModelConfig: c.editModelConfig,
    liveModelConfig: c.liveModelConfig,
    textModelConfig: c.textModelConfig,
    upscalerModelConfig: c.upscalerModelConfig,
    videoSettings: c.videoSettings,
    s3Config: c.s3Config as unknown as Record<string, unknown>,
    webdavConfig: c.webdavConfig as unknown as Record<string, unknown>,
  };
}

let stopFns: Array<() => void> = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleSync() {
  if (!hydrated || applying) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    pushConfig(selfEditableSnapshot()).catch((e) => {
      console.error("Failed to sync config to server", e);
    });
  }, SYNC_DEBOUNCE_MS);
}

/** Begin debounced sync of self-editable store changes to the server. */
export function startConfigSync(): () => void {
  stopConfigSync();
  const unsubSettings = useSettingsStore.subscribe(scheduleSync);
  const unsubConfig = useConfigStore.subscribe(scheduleSync);
  stopFns = [unsubSettings, unsubConfig];
  return stopConfigSync;
}

export function stopConfigSync(): void {
  stopFns.forEach((fn) => fn());
  stopFns = [];
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Reset hydration state (used when logging out). */
export function resetConfigSync(): void {
  stopConfigSync();
  hydrated = false;
}
