import type { AppContext } from "../context";
import {
  getPublicSystemStorage,
  type PublicSystemStorage,
} from "./systemStorage";

/**
 * Per-user configuration service.
 *
 * Storage model:
 *   - config_json:        non-sensitive settings (mirrors the frontend stores)
 *   - secrets_encrypted:  AES-256-GCM JSON of provider tokens, custom-provider
 *                         tokens, plus legacy per-user storage credentials
 *   - system_storage_settings: one admin-managed storage service for all users
 *
 * Security rules enforced here:
 *   - Provider tokens and custom-provider tokens are NEVER returned to clients;
 *     the public view only exposes "hasToken" flags. The proxy reads raw tokens
 *     server-side via getProviderTokens / getCustomProviderWithToken.
 *   - Normal users (self-update) cannot change admin-locked keys (tokens,
 *     custom providers, provider endpoints, service mode). Admins can set anything.
 *   - Storage is admin-managed. Normal users cannot change storageType or
 *     credentials; public config exposes only sanitized storage metadata and a
 *     configured flag. Cloud operations use the server-side storage proxy.
 */

export const PROVIDER_IDS = [
  "huggingface",
  "gitee",
  "modelscope",
  "a4f",
  "openai",
  "google",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface VideoSettings {
  prompt: string;
  duration: number;
  steps: number;
  guidance: number;
}
export interface ModelRef {
  provider: string;
  model: string;
}
export interface CustomProviderMeta {
  id: string;
  name: string;
  apiUrl: string;
  models: unknown;
  enabled: boolean;
}
export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  publicDomain?: string;
  prefix?: string;
}
export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  directory: string;
}

export interface UserConfig {
  language: string;
  provider: string;
  model: string;
  aspectRatio: string;
  seed: string;
  steps: number;
  guidanceScale: number;
  autoTranslate: boolean;
  enableHD: boolean;
  serviceMode: string;
  storageType: string;
  systemPrompt: string;
  translationPrompt: string;
  editModelConfig: ModelRef;
  liveModelConfig: ModelRef;
  textModelConfig: ModelRef;
  upscalerModelConfig: ModelRef;
  openaiConfig: { apiUrl: string; modelId: string };
  googleConfig: { apiUrl: string; modelId: string };
  videoSettings: Record<string, VideoSettings>;
  customProviders: CustomProviderMeta[];
}

export interface SecretBundle {
  tokens: Record<ProviderId, string[]>;
  customProviderTokens: Record<string, string>;
  s3Config: S3Config;
  webdavConfig: WebDAVConfig;
}

export interface PublicConfig extends UserConfig {
  hasTokens: Record<ProviderId, boolean>;
  customProviders: Array<CustomProviderMeta & { hasToken: boolean }>;
  s3Config: S3Config;
  webdavConfig: WebDAVConfig;
  storageConfigured: boolean;
  storageManagedBy: "admin";
}

const DEFAULT_SYSTEM_PROMPT = `I am a master AI image prompt engineering advisor, specializing in crafting prompts that yield cinematic, hyper-realistic, and deeply evocative visual narratives, optimized for advanced generative models.
My core purpose is to meticulously rewrite, expand, and enhance user's image prompts.
I transform prompts to create visually stunning images by rigorously optimizing elements such as dramatic lighting, intricate textures, compelling composition, and a distinctive artistic style.
My generated prompt output will be strictly under 300 words. Prior to outputting, I will internally validate that the refined prompt strictly adheres to the word count limit and effectively incorporates the intended stylistic and technical enhancements.
My output will consist exclusively of the refined image prompt text. It will commence immediately, with no leading whitespace.
The text will strictly avoid markdown, quotation marks, conversational preambles, explanations, or concluding remarks. Please describe the content using prose-style sentences.
**The character's face is clearly visible and unobstructed.**`;

const DEFAULT_TRANSLATION_PROMPT = `You are a professional language translation engine.
Your sole responsibility is to translate user-provided text into English. Before processing any input, you must first identify its original language.
If the input text is already in English, return the original English text directly without any modification. If the input text is not in English, translate it precisely into English.
Your output must strictly adhere to the following requirements: it must contain only the final English translation or the original English text, without any explanations, comments, descriptions, prefixes, suffixes, quotation marks, or other non-translated content.`;

const EMPTY_S3: S3Config = { accessKeyId: "", secretAccessKey: "" };
const EMPTY_WEBDAV: WebDAVConfig = { url: "", username: "", password: "", directory: "" };

export function defaultConfig(): UserConfig {
  return {
    language: "en",
    // The synthetic "server" provider (the backend proxy) is the only runtime
    // provider; the model is chosen by server-init from the available server
    // models, so the persisted default is left empty on first login.
    provider: "server",
    model: "",
    aspectRatio: "1:1",
    seed: "",
    steps: 9,
    guidanceScale: 3.5,
    autoTranslate: false,
    enableHD: false,
    serviceMode: "server",
    storageType: "opfs",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    translationPrompt: DEFAULT_TRANSLATION_PROMPT,
    editModelConfig: { provider: "huggingface", model: "qwen-image-edit" },
    liveModelConfig: { provider: "huggingface", model: "wan2_2-i2v" },
    textModelConfig: { provider: "huggingface", model: "openai-fast" },
    upscalerModelConfig: { provider: "huggingface", model: "RealESRGAN_x4plus" },
    openaiConfig: { apiUrl: "https://api.openai.com/v1/responses", modelId: "gpt-5.4" },
    googleConfig: {
      apiUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      modelId: "gemini-3.1-flash-image-preview",
    },
    videoSettings: {},
    customProviders: [],
  };
}

export function defaultSecrets(): SecretBundle {
  return {
    tokens: { huggingface: [], gitee: [], modelscope: [], a4f: [], openai: [], google: [] },
    customProviderTokens: {},
    s3Config: { ...EMPTY_S3 },
    webdavConfig: { ...EMPTY_WEBDAV },
  };
}

/** Keys a normal user is allowed to change via self-update. */
const SELF_EDITABLE_KEYS: (keyof UserConfig)[] = [
  "language",
  "provider",
  "model",
  "aspectRatio",
  "seed",
  "steps",
  "guidanceScale",
  "autoTranslate",
  "enableHD",
  "systemPrompt",
  "translationPrompt",
  "editModelConfig",
  "liveModelConfig",
  "textModelConfig",
  "upscalerModelConfig",
  "videoSettings",
];

// --- Persistence ---

export interface RawConfig {
  config: UserConfig;
  secrets: SecretBundle;
}

export async function loadRaw(ctx: AppContext, userId: number): Promise<RawConfig> {
  const row = await ctx.repos.settings.get(userId);
  if (!row) {
    const seeded: RawConfig = { config: defaultConfig(), secrets: defaultSecrets() };
    await saveRaw(ctx, userId, seeded.config, seeded.secrets);
    return seeded;
  }
  const config = { ...defaultConfig(), ...(JSON.parse(row.configJson) as Partial<UserConfig>) };
  let secrets = defaultSecrets();
  if (row.secretsEncrypted) {
    try {
      const decrypted = ctx.crypto.decryptJSON<Partial<SecretBundle>>(row.secretsEncrypted);
      secrets = {
        tokens: { ...defaultSecrets().tokens, ...(decrypted.tokens ?? {}) },
        customProviderTokens: decrypted.customProviderTokens ?? {},
        s3Config: { ...EMPTY_S3, ...(decrypted.s3Config ?? {}) },
        webdavConfig: { ...EMPTY_WEBDAV, ...(decrypted.webdavConfig ?? {}) },
      };
    } catch {
      // Unreadable secrets (e.g. key rotated) — fall back to empty.
    }
  }
  return { config, secrets };
}

export async function saveRaw(
  ctx: AppContext,
  userId: number,
  config: UserConfig,
  secrets: SecretBundle,
): Promise<void> {
  await ctx.repos.settings.upsert(
    userId,
    JSON.stringify(config),
    ctx.crypto.encryptJSON(secrets),
  );
}

// --- Public (sanitized) view ---

export function toPublicConfig(
  config: UserConfig,
  secrets: SecretBundle,
  storage: PublicSystemStorage,
): PublicConfig {
  const hasTokens = {} as Record<ProviderId, boolean>;
  for (const id of PROVIDER_IDS) {
    hasTokens[id] = (secrets.tokens[id]?.length ?? 0) > 0;
  }
  return {
    ...config,
    storageType: storage.storageType,
    customProviders: config.customProviders.map((p) => ({
      ...p,
      hasToken: !!secrets.customProviderTokens[p.id],
    })),
    hasTokens,
    s3Config: storage.s3Config,
    webdavConfig: storage.webdavConfig,
    storageConfigured: storage.storageConfigured,
    storageManagedBy: storage.storageManagedBy,
  };
}

export async function getPublicConfig(ctx: AppContext, userId: number): Promise<PublicConfig> {
  const { config, secrets } = await loadRaw(ctx, userId);
  const storage = await getPublicSystemStorage(ctx);
  return toPublicConfig(config, secrets, storage);
}

// --- Updates ---

export async function applySelfUpdate(
  ctx: AppContext,
  userId: number,
  patch: Record<string, unknown>,
): Promise<PublicConfig> {
  const { config, secrets } = await loadRaw(ctx, userId);

  for (const key of SELF_EDITABLE_KEYS) {
    if (patch[key] !== undefined) {
      (config as unknown as Record<string, unknown>)[key] = patch[key];
    }
  }
  await saveRaw(ctx, userId, config, secrets);
  const storage = await getPublicSystemStorage(ctx);
  return toPublicConfig(config, secrets, storage);
}

export async function seedDefaultSettings(ctx: AppContext, userId: number): Promise<void> {
  if (await ctx.repos.settings.get(userId)) return;
  await saveRaw(ctx, userId, defaultConfig(), defaultSecrets());
}

// --- Server-side accessors for the generation proxy (never exposed to clients) ---

export async function getProviderTokens(
  ctx: AppContext,
  userId: number,
  providerId: ProviderId,
): Promise<string[]> {
  const { secrets } = await loadRaw(ctx, userId);
  return secrets.tokens[providerId] ?? [];
}

export async function getCustomProviderWithToken(
  ctx: AppContext,
  userId: number,
  providerId: string,
): Promise<(CustomProviderMeta & { token?: string }) | null> {
  const { config, secrets } = await loadRaw(ctx, userId);
  const meta = config.customProviders.find((p) => p.id === providerId);
  if (!meta) return null;
  return { ...meta, token: secrets.customProviderTokens[providerId] };
}
