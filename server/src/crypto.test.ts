import { describe, it, expect } from "vitest";
import { createCrypto } from "./crypto";

const KEY = "test-encryption-key-do-not-use-in-prod";
const OTHER_KEY = "a-completely-different-key";

describe("createCrypto", () => {
  it("round-trips a string through encrypt/decrypt", () => {
    const c = createCrypto(KEY);
    const plaintext = "sk-super-secret-token-12345";
    const encrypted = c.encryptString(plaintext);
    expect(c.decryptString(encrypted)).toBe(plaintext);
  });

  it("produces ciphertext that is not the plaintext and carries the version prefix", () => {
    const c = createCrypto(KEY);
    const encrypted = c.encryptString("hello");
    expect(encrypted).not.toContain("hello");
    expect(c.isEncrypted(encrypted)).toBe(true);
  });

  it("produces different ciphertext each call (random IV) but both decrypt back", () => {
    const c = createCrypto(KEY);
    const a = c.encryptString("same");
    const b = c.encryptString("same");
    expect(a).not.toBe(b);
    expect(c.decryptString(a)).toBe("same");
    expect(c.decryptString(b)).toBe("same");
  });

  it("fails to decrypt when the key is wrong", () => {
    const enc = createCrypto(KEY).encryptString("secret");
    expect(() => createCrypto(OTHER_KEY).decryptString(enc)).toThrow();
  });

  it("fails to decrypt tampered ciphertext (GCM auth)", () => {
    const c = createCrypto(KEY);
    const enc = c.encryptString("secret");
    // Decode the body, flip one real ciphertext byte, re-encode.
    const prefix = enc.slice(0, enc.indexOf(":", 4) + 1);
    const bytes = Buffer.from(enc.slice(prefix.length), "base64");
    bytes[bytes.length - 1] ^= 0xff;
    const tampered = prefix + bytes.toString("base64");
    expect(() => c.decryptString(tampered)).toThrow();
  });

  it("round-trips a JSON object", () => {
    const c = createCrypto(KEY);
    const value = { tokens: { huggingface: ["hf_a", "hf_b"] }, nested: { x: 1 } };
    const encrypted = c.encryptJSON(value);
    expect(c.decryptJSON(encrypted)).toEqual(value);
  });

  it("isEncrypted returns false for plaintext", () => {
    const c = createCrypto(KEY);
    expect(c.isEncrypted("just a plain string")).toBe(false);
    expect(c.isEncrypted("")).toBe(false);
  });
});
