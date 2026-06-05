import crypto from "node:crypto";
import {
  fullS3Config,
  fullWebDAVConfig,
  isSystemStorageConfigured,
  loadSystemStorage,
  type S3Config,
  type SystemStorageRaw,
  type WebDAVConfig,
} from "./systemStorage";
import type { AppContext } from "../context";

export interface CloudFile {
  key: string;
  lastModified: Date;
  size: number;
  url: string;
  type: "image" | "video" | "unknown";
}

interface SignedRequest {
  authorizationHeader: string;
  isoDate: string;
  payloadHash: string;
  host: string;
}

function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function normalizeEndpoint(config: S3Config): {
  endpoint: string;
  host: string;
  bucket: string;
  virtualHosted: boolean;
} {
  const region = config.region || "us-east-1";
  const endpoint = (config.endpoint || `https://s3.${region}.amazonaws.com`).replace(/\/+$/, "");
  const host = new URL(endpoint).host;
  const bucket = config.bucket || "";
  const virtualHosted = !!bucket && host.startsWith(`${bucket}.`);
  return { endpoint, host, bucket, virtualHosted };
}

function getS3Prefix(config: S3Config): string {
  let prefix = config.prefix || "peinture/";
  if (prefix.startsWith("/")) prefix = prefix.slice(1);
  if (prefix && !prefix.endsWith("/")) prefix += "/";
  return prefix;
}

function withS3Prefix(config: S3Config, key: string): string {
  const normalized = key.replace(/^\/+/, "");
  const prefix = getS3Prefix(config);
  return prefix && !normalized.startsWith(prefix) ? `${prefix}${normalized}` : normalized;
}

function s3ListTarget(config: S3Config): { canonicalUri: string; url: string } {
  const { endpoint, bucket, virtualHosted } = normalizeEndpoint(config);
  if (bucket && !virtualHosted) return { canonicalUri: `/${bucket}`, url: `${endpoint}/${bucket}` };
  return { canonicalUri: "/", url: endpoint };
}

function s3ObjectTarget(config: S3Config, key: string): { canonicalUri: string; url: string } {
  const { endpoint, bucket, virtualHosted } = normalizeEndpoint(config);
  if (bucket && !virtualHosted) {
    return { canonicalUri: `/${bucket}/${key}`, url: `${endpoint}/${bucket}/${key}` };
  }
  return { canonicalUri: `/${key}`, url: `${endpoint}/${key}` };
}

function publicS3Url(config: S3Config, key: string): string {
  if (config.publicDomain) return `${config.publicDomain.replace(/\/+$/, "")}/${key}`;
  return s3ObjectTarget(config, key).url;
}

function keyFromS3Input(config: S3Config, keyOrUrl: string): string {
  if (!/^https?:\/\//i.test(keyOrUrl)) return withS3Prefix(config, keyOrUrl);

  const inputUrl = new URL(keyOrUrl);
  const publicDomain = config.publicDomain ? new URL(config.publicDomain) : null;
  if (publicDomain && inputUrl.host === publicDomain.host) {
    return decodeURIComponent(inputUrl.pathname.replace(/^\/+/, ""));
  }

  const { bucket, virtualHosted } = normalizeEndpoint(config);
  let path = decodeURIComponent(inputUrl.pathname.replace(/^\/+/, ""));
  if (bucket && !virtualHosted && path.startsWith(`${bucket}/`)) {
    path = path.slice(bucket.length + 1);
  }
  return withS3Prefix(config, path);
}

function signS3Request(
  config: S3Config,
  method: string,
  uriPath: string,
  queryString: string,
  payloadHash: string,
): SignedRequest {
  const now = new Date();
  const isoDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = isoDate.slice(0, 8);
  const region = config.region || "us-east-1";
  const service = "s3";
  const { host } = normalizeEndpoint(config);

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${isoDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest =
    `${method}\n` +
    `${uriPath}\n` +
    `${queryString}\n` +
    `${canonicalHeaders}\n` +
    `${signedHeaders}\n` +
    `${payloadHash}`;

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign =
    `${algorithm}\n${isoDate}\n${credentialScope}\n${sha256(canonicalRequest)}`;

  const kDate = hmac(Buffer.from(`AWS4${config.secretAccessKey}`), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  return {
    authorizationHeader:
      `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    isoDate,
    payloadHash,
    host,
  };
}

function s3Headers(signed: SignedRequest, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: signed.authorizationHeader,
    "x-amz-date": signed.isoDate,
    "x-amz-content-sha256": signed.payloadHash,
    Host: signed.host,
  };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

function assertS3Configured(config: S3Config) {
  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error("error_s3_config_missing");
  }
}

function detectFileType(key: string): CloudFile["type"] {
  const lower = key.toLowerCase();
  if (/\.(jpg|jpeg|png|webp|gif)$/.test(lower)) return "image";
  if (/\.(mp4|webm|mov)$/.test(lower)) return "video";
  return "unknown";
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

export async function uploadS3Object(
  config: S3Config,
  data: Buffer,
  fileName: string,
  contentType: string,
): Promise<string> {
  assertS3Configured(config);
  const key = withS3Prefix(config, fileName);
  const target = s3ObjectTarget(config, key);
  const payloadHash = sha256(data);
  const signed = signS3Request(config, "PUT", target.canonicalUri, "", payloadHash);

  const response = await fetch(target.url, {
    method: "PUT",
    headers: s3Headers(signed, contentType),
    body: data,
  });

  if (!response.ok) {
    throw new Error(`S3 Upload Failed: ${response.status} ${response.statusText}`);
  }

  return publicS3Url(config, key);
}

export async function listS3Files(config: S3Config): Promise<CloudFile[]> {
  assertS3Configured(config);
  const prefix = getS3Prefix(config);
  const target = s3ListTarget(config);
  const queryString = `list-type=2&prefix=${encodeURIComponent(prefix)}`;
  const payloadHash = sha256("");
  const signed = signS3Request(config, "GET", target.canonicalUri, queryString, payloadHash);

  const response = await fetch(`${target.url}?${queryString}`, {
    method: "GET",
    headers: s3Headers(signed),
  });

  if (!response.ok) {
    throw new Error(`S3 List Failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const contents = text.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? [];
  const files: CloudFile[] = [];

  for (const block of contents) {
    const key = xmlTag(block, "Key");
    if (!key || key === prefix) continue;
    const type = detectFileType(key);
    if (type === "unknown") continue;
    files.push({
      key,
      lastModified: new Date(xmlTag(block, "LastModified") || Date.now()),
      size: Number(xmlTag(block, "Size") || 0),
      url: publicS3Url(config, key),
      type,
    });
  }

  return files;
}

export async function fetchS3Blob(config: S3Config, keyOrUrl: string): Promise<{
  data: Buffer;
  contentType: string;
}> {
  assertS3Configured(config);
  const key = keyFromS3Input(config, keyOrUrl);
  const target = s3ObjectTarget(config, key);
  const payloadHash = sha256("");
  const signed = signS3Request(config, "GET", target.canonicalUri, "", payloadHash);

  const response = await fetch(target.url, {
    method: "GET",
    headers: s3Headers(signed),
  });

  if (!response.ok) {
    throw new Error(`S3 Fetch Failed: ${response.status} ${response.statusText}`);
  }

  return {
    data: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

export async function deleteS3Object(config: S3Config, keyOrUrl: string): Promise<void> {
  assertS3Configured(config);
  const key = keyFromS3Input(config, keyOrUrl);
  const target = s3ObjectTarget(config, key);
  const payloadHash = sha256("");
  const signed = signS3Request(config, "DELETE", target.canonicalUri, "", payloadHash);

  const response = await fetch(target.url, {
    method: "DELETE",
    headers: s3Headers(signed),
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(`S3 Delete Failed: ${response.status} ${response.statusText}`);
  }
}

export async function testS3Connection(config: S3Config): Promise<{ success: boolean; message: string }> {
  try {
    assertS3Configured(config);
    const target = s3ListTarget(config);
    const queryString = "list-type=2&max-keys=1";
    const payloadHash = sha256("");
    const signed = signS3Request(config, "GET", target.canonicalUri, queryString, payloadHash);
    const response = await fetch(`${target.url}?${queryString}`, {
      method: "GET",
      headers: s3Headers(signed),
    });
    return response.ok
      ? { success: true, message: "Connection successful" }
      : { success: false, message: `Connection failed: ${response.status} ${response.statusText}` };
  } catch (e) {
    return { success: false, message: `Connection error: ${(e as Error).message}` };
  }
}

function webdavHeaders(config: WebDAVConfig): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
  };
}

function joinPath(base: string, ...parts: string[]) {
  let url = base.replace(/\/+$/, "");
  for (const part of parts) {
    if (!part) continue;
    url += `/${part.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  }
  return url;
}

function assertWebDAVConfigured(config: WebDAVConfig) {
  if (!config.url || !config.username || !config.password) {
    throw new Error("error_webdav_config_missing");
  }
}

function webdavUrl(config: WebDAVConfig, keyOrUrl: string): string {
  if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
  return joinPath(config.url, config.directory || "peinture", keyOrUrl);
}

export async function uploadWebDAVFile(
  config: WebDAVConfig,
  data: Buffer,
  fileName: string,
): Promise<string> {
  assertWebDAVConfigured(config);
  const url = joinPath(config.url, config.directory || "peinture", fileName);
  const response = await fetch(url, {
    method: "PUT",
    headers: webdavHeaders(config),
    body: data,
  });
  if (!response.ok) throw new Error(`WebDAV Upload Failed: ${response.status}`);
  return url;
}

export async function listWebDAVFiles(config: WebDAVConfig): Promise<CloudFile[]> {
  assertWebDAVConfigured(config);
  const listUrl = joinPath(config.url, config.directory || "peinture");
  const response = await fetch(listUrl, {
    method: "PROPFIND",
    headers: { ...webdavHeaders(config), Depth: "1" },
  });
  if (!response.ok) throw new Error(`WebDAV List Failed: ${response.status}`);

  const text = await response.text();
  const responses = text.match(/<(?:\w+:)?response[\s\S]*?<\/(?:\w+:)?response>/gi) ?? [];
  const basePath = new URL(listUrl).pathname.replace(/\/+$/, "");
  const files: CloudFile[] = [];

  for (const block of responses) {
    const href = xmlTag(block, "href");
    if (!href) continue;
    const url = new URL(href, config.url);
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, "");
    if (path === decodeURIComponent(basePath)) continue;
    const key = path.split("/").pop() || "";
    const type = detectFileType(key);
    if (type === "unknown") continue;
    files.push({
      key: url.toString(),
      lastModified: new Date(xmlTag(block, "getlastmodified") || Date.now()),
      size: Number(xmlTag(block, "getcontentlength") || 0),
      url: url.toString(),
      type,
    });
  }

  return files;
}

export async function fetchWebDAVBlob(config: WebDAVConfig, keyOrUrl: string): Promise<{
  data: Buffer;
  contentType: string;
}> {
  assertWebDAVConfigured(config);
  const response = await fetch(webdavUrl(config, keyOrUrl), {
    method: "GET",
    headers: webdavHeaders(config),
  });
  if (!response.ok) throw new Error(`WebDAV Fetch Failed: ${response.status}`);
  return {
    data: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

export async function deleteWebDAVFile(config: WebDAVConfig, keyOrUrl: string): Promise<void> {
  assertWebDAVConfigured(config);
  const response = await fetch(webdavUrl(config, keyOrUrl), {
    method: "DELETE",
    headers: webdavHeaders(config),
  });
  if (!response.ok) throw new Error(`WebDAV Delete Failed: ${response.status}`);
}

export async function testWebDAVConnection(
  config: WebDAVConfig,
): Promise<{ success: boolean; message: string }> {
  try {
    assertWebDAVConfigured(config);
    const response = await fetch(config.url, {
      method: "PROPFIND",
      headers: { ...webdavHeaders(config), Depth: "0" },
    });
    return response.ok
      ? { success: true, message: "Connection successful" }
      : { success: false, message: `Connection failed: ${response.status}` };
  } catch (e) {
    return { success: false, message: `Connection error: ${(e as Error).message}` };
  }
}

async function loadConfiguredStorage(ctx: AppContext): Promise<SystemStorageRaw> {
  const raw = await loadSystemStorage(ctx);
  if (!isSystemStorageConfigured(raw)) throw new Error("error_storage_config_missing");
  return raw;
}

export async function listCloudFiles(ctx: AppContext): Promise<CloudFile[]> {
  const raw = await loadConfiguredStorage(ctx);
  if (raw.config.storageType === "s3") return listS3Files(fullS3Config(raw));
  if (raw.config.storageType === "webdav") return listWebDAVFiles(fullWebDAVConfig(raw));
  return [];
}

export async function uploadCloudFile(
  ctx: AppContext,
  data: Buffer,
  fileName: string,
  contentType: string,
): Promise<string> {
  const raw = await loadConfiguredStorage(ctx);
  if (raw.config.storageType === "s3") return uploadS3Object(fullS3Config(raw), data, fileName, contentType);
  if (raw.config.storageType === "webdav") return uploadWebDAVFile(fullWebDAVConfig(raw), data, fileName);
  throw new Error("error_storage_config_missing");
}

export async function fetchCloudFile(ctx: AppContext, keyOrUrl: string): Promise<{
  data: Buffer;
  contentType: string;
}> {
  const raw = await loadConfiguredStorage(ctx);
  if (raw.config.storageType === "s3") return fetchS3Blob(fullS3Config(raw), keyOrUrl);
  if (raw.config.storageType === "webdav") return fetchWebDAVBlob(fullWebDAVConfig(raw), keyOrUrl);
  throw new Error("error_storage_config_missing");
}

export async function deleteCloudFile(ctx: AppContext, keyOrUrl: string): Promise<void> {
  const raw = await loadConfiguredStorage(ctx);
  if (raw.config.storageType === "s3") return deleteS3Object(fullS3Config(raw), keyOrUrl);
  if (raw.config.storageType === "webdav") return deleteWebDAVFile(fullWebDAVConfig(raw), keyOrUrl);
  throw new Error("error_storage_config_missing");
}

export async function renameCloudFile(
  ctx: AppContext,
  oldKeyOrUrl: string,
  newKeyOrUrl: string,
): Promise<void> {
  const blob = await fetchCloudFile(ctx, oldKeyOrUrl);
  await uploadCloudFile(ctx, blob.data, newKeyOrUrl, blob.contentType);
  await deleteCloudFile(ctx, oldKeyOrUrl);
}

export async function testSystemStorageConnection(
  raw: SystemStorageRaw,
): Promise<{ success: boolean; message: string }> {
  if (raw.config.storageType === "opfs") return { success: true, message: "Local storage enabled" };
  if (raw.config.storageType === "off") return { success: false, message: "Storage is off" };
  if (raw.config.storageType === "s3") return testS3Connection(fullS3Config(raw));
  if (raw.config.storageType === "webdav") return testWebDAVConnection(fullWebDAVConfig(raw));
  return { success: false, message: "Unsupported storage type" };
}
