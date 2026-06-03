import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Crypto module — AES-256-GCM encryption for sensitive data at rest (in MySQL).
 *
 * The encryption key comes from the APP_ENCRYPTION_KEY environment variable.
 * Any string is accepted and hashed (SHA-256) into a 32-byte AES-256 key, so the
 * operator can supply a hex key, base64 key, or a high-entropy passphrase.
 *
 * Wire format: "enc:v1:" + base64(iv[12] | authTag[16] | ciphertext)
 */

const PREFIX = "enc:v1:";
const IV_LEN = 12;
const TAG_LEN = 16;

export interface Crypto {
  encryptString(plaintext: string): string;
  decryptString(payload: string): string;
  encryptJSON(value: unknown): string;
  decryptJSON<T = unknown>(payload: string): T;
  isEncrypted(value: string): boolean;
}

function deriveKey(rawKey: string): Buffer {
  return createHash("sha256").update(rawKey, "utf8").digest();
}

export function createCrypto(rawKey: string): Crypto {
  if (!rawKey) {
    throw new Error("createCrypto: an encryption key is required");
  }
  const key = deriveKey(rawKey);

  const encryptString = (plaintext: string): string => {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
  };

  const decryptString = (payload: string): string => {
    if (!payload.startsWith(PREFIX)) {
      throw new Error("decryptString: value is not encrypted");
    }
    const combined = Buffer.from(payload.slice(PREFIX.length), "base64");
    const iv = combined.subarray(0, IV_LEN);
    const tag = combined.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = combined.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  };

  return {
    encryptString,
    decryptString,
    encryptJSON: (value: unknown) => encryptString(JSON.stringify(value)),
    decryptJSON: <T = unknown>(payload: string) => JSON.parse(decryptString(payload)) as T,
    isEncrypted: (value: string) => typeof value === "string" && value.startsWith(PREFIX),
  };
}
