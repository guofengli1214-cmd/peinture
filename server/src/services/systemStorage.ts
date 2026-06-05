import type { AppContext } from "../context";

export type StorageType = "off" | "s3" | "webdav" | "opfs";

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

export interface SystemStorageConfig {
  storageType: StorageType;
  s3Config: Omit<S3Config, "accessKeyId" | "secretAccessKey">;
  webdavConfig: Omit<WebDAVConfig, "username" | "password">;
}

export interface SystemStorageSecrets {
  s3Config: Pick<S3Config, "accessKeyId" | "secretAccessKey">;
  webdavConfig: Pick<WebDAVConfig, "username" | "password">;
}

export interface SystemStorageRaw {
  config: SystemStorageConfig;
  secrets: SystemStorageSecrets;
}

export interface PublicSystemStorage {
  storageType: StorageType;
  storageConfigured: boolean;
  storageManagedBy: "admin";
  s3Config: S3Config;
  webdavConfig: WebDAVConfig;
}

export interface AdminSystemStorage extends PublicSystemStorage {
  hasS3Secret: boolean;
  hasWebDAVPassword: boolean;
}

export interface SystemStoragePatch {
  storageType?: StorageType;
  s3Config?: Partial<S3Config>;
  webdavConfig?: Partial<WebDAVConfig>;
}

export const EMPTY_S3: S3Config = {
  accessKeyId: "",
  secretAccessKey: "",
  bucket: "",
  region: "us-east-1",
  endpoint: "",
  publicDomain: "",
  prefix: "peinture/",
};

export const EMPTY_WEBDAV: WebDAVConfig = {
  url: "",
  username: "",
  password: "",
  directory: "peinture",
};

const DEFAULT_CONFIG: SystemStorageConfig = {
  storageType: "opfs",
  s3Config: {
    bucket: "",
    region: "us-east-1",
    endpoint: "",
    publicDomain: "",
    prefix: "peinture/",
  },
  webdavConfig: {
    url: "",
    directory: "peinture",
  },
};

const DEFAULT_SECRETS: SystemStorageSecrets = {
  s3Config: { accessKeyId: "", secretAccessKey: "" },
  webdavConfig: { username: "", password: "" },
};

const STORAGE_TYPES = new Set<StorageType>(["off", "s3", "webdav", "opfs"]);

function storageType(value: unknown): StorageType {
  return typeof value === "string" && STORAGE_TYPES.has(value as StorageType)
    ? (value as StorageType)
    : "opfs";
}

export function defaultSystemStorage(): SystemStorageRaw {
  return {
    config: {
      storageType: DEFAULT_CONFIG.storageType,
      s3Config: { ...DEFAULT_CONFIG.s3Config },
      webdavConfig: { ...DEFAULT_CONFIG.webdavConfig },
    },
    secrets: {
      s3Config: { ...DEFAULT_SECRETS.s3Config },
      webdavConfig: { ...DEFAULT_SECRETS.webdavConfig },
    },
  };
}

function normalizeConfig(value: Partial<SystemStorageConfig> | null | undefined): SystemStorageConfig {
  return {
    storageType: storageType(value?.storageType),
    s3Config: { ...DEFAULT_CONFIG.s3Config, ...(value?.s3Config ?? {}) },
    webdavConfig: { ...DEFAULT_CONFIG.webdavConfig, ...(value?.webdavConfig ?? {}) },
  };
}

function normalizeSecrets(
  value: Partial<SystemStorageSecrets> | null | undefined,
): SystemStorageSecrets {
  return {
    s3Config: { ...DEFAULT_SECRETS.s3Config, ...(value?.s3Config ?? {}) },
    webdavConfig: { ...DEFAULT_SECRETS.webdavConfig, ...(value?.webdavConfig ?? {}) },
  };
}

export async function loadSystemStorage(ctx: AppContext): Promise<SystemStorageRaw> {
  const row = await ctx.repos.systemStorageSettings.get();
  if (!row) return defaultSystemStorage();

  let config = defaultSystemStorage().config;
  try {
    config = normalizeConfig(JSON.parse(row.configJson) as Partial<SystemStorageConfig>);
  } catch {
    config = defaultSystemStorage().config;
  }
  let secrets = defaultSystemStorage().secrets;

  if (row.secretsEncrypted) {
    try {
      secrets = normalizeSecrets(
        ctx.crypto.decryptJSON<Partial<SystemStorageSecrets>>(row.secretsEncrypted),
      );
    } catch {
      secrets = defaultSystemStorage().secrets;
    }
  }

  return { config, secrets };
}

export async function saveSystemStorage(
  ctx: AppContext,
  raw: SystemStorageRaw,
): Promise<void> {
  await ctx.repos.systemStorageSettings.upsert(
    JSON.stringify(raw.config),
    ctx.crypto.encryptJSON(raw.secrets),
  );
}

export function fullS3Config(raw: SystemStorageRaw): S3Config {
  return { ...EMPTY_S3, ...raw.config.s3Config, ...raw.secrets.s3Config };
}

export function fullWebDAVConfig(raw: SystemStorageRaw): WebDAVConfig {
  return { ...EMPTY_WEBDAV, ...raw.config.webdavConfig, ...raw.secrets.webdavConfig };
}

export function isSystemStorageConfigured(raw: SystemStorageRaw): boolean {
  if (raw.config.storageType === "opfs") return true;
  if (raw.config.storageType === "off") return false;
  if (raw.config.storageType === "s3") {
    const s3 = fullS3Config(raw);
    return !!(s3.accessKeyId && s3.secretAccessKey);
  }
  if (raw.config.storageType === "webdav") {
    const webdav = fullWebDAVConfig(raw);
    return !!(webdav.url && webdav.username && webdav.password);
  }
  return false;
}

export function toPublicSystemStorage(raw: SystemStorageRaw): PublicSystemStorage {
  return {
    storageType: raw.config.storageType,
    storageConfigured: isSystemStorageConfigured(raw),
    storageManagedBy: "admin",
    s3Config: {
      ...EMPTY_S3,
      ...raw.config.s3Config,
      accessKeyId: "",
      secretAccessKey: "",
    },
    webdavConfig: {
      ...EMPTY_WEBDAV,
      ...raw.config.webdavConfig,
      username: "",
      password: "",
    },
  };
}

export function toAdminSystemStorage(raw: SystemStorageRaw): AdminSystemStorage {
  return {
    ...toPublicSystemStorage(raw),
    s3Config: {
      ...EMPTY_S3,
      ...raw.config.s3Config,
      accessKeyId: raw.secrets.s3Config.accessKeyId,
      secretAccessKey: "",
    },
    webdavConfig: {
      ...EMPTY_WEBDAV,
      ...raw.config.webdavConfig,
      username: raw.secrets.webdavConfig.username,
      password: "",
    },
    hasS3Secret: !!raw.secrets.s3Config.secretAccessKey,
    hasWebDAVPassword: !!raw.secrets.webdavConfig.password,
  };
}

export async function getPublicSystemStorage(ctx: AppContext): Promise<PublicSystemStorage> {
  return toPublicSystemStorage(await loadSystemStorage(ctx));
}

export async function getAdminSystemStorage(ctx: AppContext): Promise<AdminSystemStorage> {
  return toAdminSystemStorage(await loadSystemStorage(ctx));
}

function assignDefined<T extends object>(target: T, patch: Partial<T>, keys: Array<keyof T>) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      target[key] = patch[key] as T[keyof T];
    }
  }
}

export async function updateSystemStorage(
  ctx: AppContext,
  patch: SystemStoragePatch,
): Promise<AdminSystemStorage> {
  const raw = await loadSystemStorage(ctx);

  if (patch.storageType !== undefined) raw.config.storageType = storageType(patch.storageType);

  if (patch.s3Config) {
    assignDefined(raw.config.s3Config, patch.s3Config, [
      "bucket",
      "region",
      "endpoint",
      "publicDomain",
      "prefix",
    ]);
    assignDefined(raw.secrets.s3Config, patch.s3Config, [
      "accessKeyId",
      "secretAccessKey",
    ]);
  }

  if (patch.webdavConfig) {
    assignDefined(raw.config.webdavConfig, patch.webdavConfig, ["url", "directory"]);
    assignDefined(raw.secrets.webdavConfig, patch.webdavConfig, ["username", "password"]);
  }

  await saveSystemStorage(ctx, raw);
  return toAdminSystemStorage(raw);
}
