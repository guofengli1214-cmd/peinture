import type { AppContext } from "../context";

/**
 * Per-user configuration service.
 *
 * Storage model (per user, in `user_settings`):
 *   - config_json:        non-sensitive settings (mirrors the frontend stores)
 *   - secrets_encrypted:  AES-256-GCM JSON of provider tokens, custom-provider
 *                         tokens, and storage credentials
 *
 * Security rules enforced here:
 *   - Provider tokens and custom-provider tokens are NEVER returned to clients;
 *     the public view only exposes "hasToken" flags. The proxy reads raw tokens
 *     server-side via getProviderTokens / getCustomProviderWithToken.
 *   - Normal users (self-update) cannot change admin-locked keys (tokens,
 *     custom providers, provider endpoints, service mode). Admins can set anything.
 *   - Storage credentials (S3 / WebDAV) are the user's own and are returned to
 *     the owner so client-side uploads keep working.
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
    provider: "huggingface",
    model: "z-image-turbo",
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
  "storageType",
  "systemPrompt",
  "translationPrompt",
  "editModelConfig",
  "liveModelConfig",
  "textModelConfig",
  "upscalerModelConfig",
  "videoSettings",
];

function normalizeTokenList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  return [];
}

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

export function toPublicConfig(config: UserConfig, secrets: SecretBundle): PublicConfig {
  const hasTokens = {} as Record<ProviderId, boolean>;
  for (const id of PROVIDER_IDS) {
    hasTokens[id] = (secrets.tokens[id]?.length ?? 0) > 0;
  }
  return {
    ...config,
    customProviders: config.customProviders.map((p) => ({
      ...p,
      hasToken: !!secrets.customProviderTokens[p.id],
    })),
    hasTokens,
    s3Config: secrets.s3Config,
    webdavConfig: secrets.webdavConfig,
  };
}

export async function getPublicConfig(ctx: AppContext, userId: number): Promise<PublicConfig> {
  const { config, secrets } = await loadRaw(ctx, userId);
  return toPublicConfig(config, secrets);
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
  // Storage credentials are the user's own.
  if (patch.s3Config !== undefined) secrets.s3Config = patch.s3Config as S3Config;
  if (patch.webdavConfig !== undefined) secrets.webdavConfig = patch.webdavConfig as WebDAVConfig;

  await saveRaw(ctx, userId, config, secrets);
  return toPublicConfig(config, secrets);
}

export interface AdminConfigPatch extends Partial<UserConfig> {
  /** provider -> token string ("a,b") or string[]; omitted providers keep existing. */
  tokens?: Partial<Record<ProviderId, string | string[]>>;
  /** Full custom-provider list; each may carry a `token` to (re)assign. */
  customProviders?: Array<CustomProviderMeta & { token?: string }>;
  s3Config?: S3Config;
  webdavConfig?: WebDAVConfig;
}

export async function applyAdminUpdate(
  ctx: AppContext,
  userId: number,
  patch: AdminConfigPatch,
): Promise<PublicConfig> {
  const { config, secrets } = await loadRaw(ctx, userId);

  // Plain config keys (admin may set any of them, including locked ones).
  const configKeys: (keyof UserConfig)[] = [
    "language",
    "provider",
    "model",
    "aspectRatio",
    "seed",
    "steps",
    "guidanceScale",
    "autoTranslate",
    "enableHD",
    "serviceMode",
    "storageType",
    "systemPrompt",
    "translationPrompt",
    "editModelConfig",
    "liveModelConfig",
    "textModelConfig",
    "upscalerModelConfig",
    "openaiConfig",
    "googleConfig",
    "videoSettings",
  ];
  for (const key of configKeys) {
    if (patch[key] !== undefined) {
      (config as unknown as Record<string, unknown>)[key] = patch[key];
    }
  }

  if (patch.tokens) {
    for (const id of PROVIDER_IDS) {
      if (patch.tokens[id] !== undefined) {
        secrets.tokens[id] = normalizeTokenList(patch.tokens[id]);
      }
    }
  }

  if (patch.customProviders) {
    const nextTokens: Record<string, string> = {};
    config.customProviders = patch.customProviders.map((p) => {
      const { token, ...meta } = p;
      // Keep an existing token if the admin didn't send a new one.
      const resolved = token !== undefined ? token : secrets.customProviderTokens[p.id];
      if (resolved) nextTokens[p.id] = resolved;
      return meta;
    });
    secrets.customProviderTokens = nextTokens;
  }

  if (patch.s3Config !== undefined) secrets.s3Config = patch.s3Config;
  if (patch.webdavConfig !== undefined) secrets.webdavConfig = patch.webdavConfig;

  await saveRaw(ctx, userId, config, secrets);
  return toPublicConfig(config, secrets);
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
