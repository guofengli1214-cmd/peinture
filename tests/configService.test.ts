import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchConfig, pushConfig } from "../services/configService";

const serverConfig = {
  language: "zh",
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
  systemPrompt: "sys",
  translationPrompt: "trans",
  editModelConfig: { provider: "huggingface", model: "qwen-image-edit" },
  liveModelConfig: { provider: "huggingface", model: "wan2_2-i2v" },
  textModelConfig: { provider: "huggingface", model: "openai-fast" },
  upscalerModelConfig: { provider: "huggingface", model: "RealESRGAN_x4plus" },
  openaiConfig: { apiUrl: "u", modelId: "m" },
  googleConfig: { apiUrl: "u", modelId: "m" },
  videoSettings: {},
  customProviders: [],
  hasTokens: {
    huggingface: true,
    gitee: false,
    modelscope: false,
    a4f: false,
    openai: false,
    google: false,
  },
  s3Config: { accessKeyId: "", secretAccessKey: "" },
  webdavConfig: { url: "", username: "", password: "", directory: "" },
};

describe("configService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchConfig", () => {
    it("GETs /api/config with credentials and returns the config", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ config: serverConfig }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const cfg = await fetchConfig();

      expect(cfg).toEqual(serverConfig);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/config");
      expect(init.credentials).toBe("include");
    });

    it("throws when the request fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
      );
      await expect(fetchConfig()).rejects.toThrow();
    });
  });

  describe("pushConfig", () => {
    it("PUTs the patch as JSON with credentials and returns the updated config", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ config: { ...serverConfig, language: "en" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await pushConfig({ language: "en" });

      expect(result.language).toBe("en");
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/config");
      expect(init.method).toBe("PUT");
      expect(init.credentials).toBe("include");
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(init.body)).toEqual({ language: "en" });
    });
  });
});
