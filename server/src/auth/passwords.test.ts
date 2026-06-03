import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./passwords";

describe("passwords", () => {
  it("hashes to something other than the plaintext", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash).not.toBe("hunter2");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword("hunter3", hash)).toBe(false);
  });

  it("produces different hashes for the same password (salted)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });
});
