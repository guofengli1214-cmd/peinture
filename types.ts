
export interface GeneratedImage {
    id: string;
    url: string;
    prompt: string;
    aspectRatio: string;
    timestamp: number;
    model: string;
    seed?: number;
    steps?: number;
    guidanceScale?: number;
    duration?: number;
    isBlurred?: boolean;
    isUpscaled?: boolean;
    width?: number;
    height?: number;
    provider?: ProviderOption;
    fileName?: string; // Local filename in OPFS tmp for the image
    // Video Generation Properties
    videoUrl?: string;
    videoTaskId?: string;
    videoStatus?: 'generating' | 'success' | 'failed';
    videoError?: string;
    videoProvider?: ProviderOption;
    videoTimestamp?: number; // Timestamp when video generation started
    videoNextPollTime?: number; // Timestamp for next poll attempt
    videoFileName?: string; // Local filename in OPFS tmp for the video
}

export interface CloudImage {
    id: string;
    url: string; // Cloud URL
    thumbnailUrl?: string;
    prompt: string;
    timestamp: number;
    fileName: string;
}

export interface CloudFile {
    key: string;
    lastModified: Date;
    size: number;
    url: string;
    type: 'image' | 'video' | 'unknown';
}

export type StorageType = 'off' | 's3' | 'webdav' | 'opfs';

export interface S3Config {
    accessKeyId: string;
    secretAccessKey: string;
    bucket?: string; // Optional
    region?: string; // Optional
    endpoint?: string; // Optional custom endpoint
    publicDomain?: string; // Optional CDN/Public domain
    prefix?: string; // Optional prefix, default 'peinture/'
}

export interface WebDAVConfig {
    url: string;
    username: string;
    password: string;
    directory: string;
}

export type AspectRatioOption = "1:1" | "3:2" | "2:3" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9";

export type ModelOption = 
    | "z-image-turbo" 
    | "z-image"
    | "qwen-image" 
    | "ovis-image" 
    | "flux-2"
    | "flux-1-schnell" 
    | "flux-1-krea"
    | "flux-1"
    | "imagen-4"
    | string; // Allow custom model strings

export type ProviderOption = "huggingface" | "gitee" | "modelscope" | "a4f" | "openai" | "google" | string;

export type ProviderId = 'huggingface' | 'gitee' | 'modelscope' | 'a4f' | 'openai' | 'google';

export type UserRole = 'user' | 'admin';

/** The authenticated user as exposed to the browser (never includes secrets). */
export interface PublicUser {
    id: number;
    username: string;
    role: UserRole;
    displayName: string | null;
}

/** A user account as seen by an admin in the management panel. */
export interface AdminUser {
    id: number;
    username: string;
    role: UserRole;
    displayName: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

/** A custom provider as returned by the server: metadata + a hasToken flag, never the raw token. */
export interface ServerCustomProvider {
    id: string;
    name: string;
    apiUrl: string;
    models: RemoteModelList;
    enabled: boolean;
    hasToken: boolean;
}

// --- User-defined / relay API providers (OpenAI / Claude / Gemini / Gradio formats) ---
export type ApiProviderFormat = 'openai' | 'claude' | 'gemini' | 'gradio';
export type ApiProviderCapability = 'image' | 'edit' | 'text' | 'video' | 'upscale';
export type ApiProviderOpenAIEditEndpoint = 'edits' | 'generations' | 'chatCompletions';

export interface GradioModelConfig {
    baseUrl: string;
    fnIndex: number;
    triggerId: number;
    argsTemplate: unknown[];
    stepsDefault?: number;
    guidanceDefault?: number;
    negativePrompt?: string;
    outputPath: string;
    seedPath?: string;
}

export interface ApiProviderModelDef {
    modelId: string;
    name: string;
    capabilities: ApiProviderCapability[];
    enabled?: boolean;
    endpointPath?: string;
    editEndpoint?: ApiProviderOpenAIEditEndpoint;
    gradio?: GradioModelConfig;
}

/** A custom/relay provider as exposed to the browser (no raw secret). */
export interface CustomApiProvider {
    id: string;
    scope: 'global' | 'user';
    managedBy: 'admin' | 'self';
    ownerUserId: number | null;
    name: string;
    apiUrl: string;
    format: ApiProviderFormat;
    models: ApiProviderModelDef[];
    enabled: boolean;
    hasSecret: boolean;
    /** True only when the requesting user may edit/delete this provider. */
    editable: boolean;
}

export interface CustomApiProviderInput {
    name: string;
    apiUrl: string;
    format: ApiProviderFormat;
    models: ApiProviderModelDef[];
    /** Plaintext key; omit to leave unchanged on update, null/'' to clear. */
    secret?: string | null;
    enabled?: boolean;
}

/**
 * The per-user configuration as returned by `GET /api/config`. Mirrors the
 * server's PublicConfig: all non-secret settings, per-provider hasTokens flags
 * (never raw tokens), and the owner's storage credentials.
 */
export interface ServerPublicConfig {
    language: string;
    provider: string;
    model: string;
    aspectRatio: string;
    seed: string;
    steps: number;
    guidanceScale: number;
    autoTranslate: boolean;
    enableHD: boolean;
    serviceMode: ServiceMode;
    storageType: StorageType;
    systemPrompt: string;
    translationPrompt: string;
    editModelConfig: { provider: string; model: string };
    liveModelConfig: { provider: string; model: string };
    textModelConfig: { provider: string; model: string };
    upscalerModelConfig: { provider: string; model: string };
    openaiConfig: { apiUrl: string; modelId: string };
    googleConfig: { apiUrl: string; modelId: string };
    videoSettings: Record<string, VideoSettings>;
    customProviders: ServerCustomProvider[];
    hasTokens: Record<ProviderId, boolean>;
    s3Config: S3Config;
    webdavConfig: WebDAVConfig;
    storageConfigured: boolean;
    storageManagedBy: "admin";
}

export interface AdminSystemStorage {
    storageType: StorageType;
    storageConfigured: boolean;
    storageManagedBy: "admin";
    s3Config: S3Config;
    webdavConfig: WebDAVConfig;
    hasS3Secret: boolean;
    hasWebDAVPassword: boolean;
}

export interface AdminSystemStorageInput {
    storageType?: StorageType;
    s3Config?: Partial<S3Config>;
    webdavConfig?: Partial<WebDAVConfig>;
}

export interface TokenStatus {
    date: string;
    exhausted: Record<string, boolean>;
}

export interface GenerationParams {
    model: ModelOption;
    prompt: string;
    aspectRatio: AspectRatioOption;
    seed?: number;
    steps?: number;
    guidanceScale?: number;
}

export interface RemoteModel {
  id: string;
  name: string;
  providerName?: string;
  type: string[];
  steps?: {
    range: [number, number];
    default: number;
  };
  guidance?: {
    range: [number, number];
    default: number;
  };
}

export interface RemoteModelList {
  generate?: RemoteModel[];
  edit?: RemoteModel[];
  video?: RemoteModel[];
  text?: RemoteModel[];
  upscaler?: RemoteModel[];
}

export interface CustomProvider {
    id: string;
    name: string;
    apiUrl: string;
    token?: string;
    models: RemoteModelList;
    enabled: boolean;
}

export type ServiceMode = 'local' | 'server' | 'hydration';

export interface VideoSettings {
  prompt: string;
  duration: number; // in seconds
  steps: number;
  guidance: number;
}

export interface UnifiedModelOption {
    label: string;
    value: string; // provider:modelId
    provider: ProviderOption;
}
