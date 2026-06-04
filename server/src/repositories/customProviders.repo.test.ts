import { describe, it, expect } from "vitest";
import { createMemoryRepositories } from "./memory";

describe("CustomProviderRepository.findGlobalByName", () => {
  it("finds a global provider by exact name, ignores user-scoped and other names", async () => {
    const repos = createMemoryRepositories();
    await repos.customProviders.create({
      id: "g1", scope: "global", ownerUserId: null, managedBy: "admin",
      name: "OpenAI", apiUrl: "https://api.openai.com", format: "openai",
      modelsJson: "[]", secretEncrypted: null, enabled: true,
    });
    await repos.customProviders.create({
      id: "u1", scope: "user", ownerUserId: 7, managedBy: "admin",
      name: "OpenAI", apiUrl: "https://x", format: "openai",
      modelsJson: "[]", secretEncrypted: null, enabled: true,
    });

    const found = await repos.customProviders.findGlobalByName("OpenAI");
    expect(found?.id).toBe("g1");
    expect(await repos.customProviders.findGlobalByName("Nope")).toBeNull();
  });
});
