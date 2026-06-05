import { describe, it, expect, beforeEach } from "vitest";
import { hydrateFromServerConfig, selfEditableSnapshot } from "../services/configSync";
import { useSettingsStore } from "../store/settingsStore";
import { useConfigStore } from "../store/configStore";
import { ServerPublicConfig } from "../types";

const serverConfig: ServerPublicConfig = {
  language: "zh",
  provider: "huggingface",
  model: "z-image-turbo",
  aspectRatio: "16:9",
  seed: "42",
  steps: 12,
  guidanceScale: 4.5,
  autoTranslate: true,
  enableHD: true,
  serviceMode: "server",
  storageType: "s3",
  systemPrompt: "SYS",
  translationPrompt: "TRANS",
  editModelConfig: { provider: "huggingface", model: "qwen-image-edit" },
  liveModelConfig: { provider: "huggingface", model: "wan2_2-i2v" },
  textModelConfig: { provider: "huggingface", model: "openai-fast" },
  upscalerModelConfig: { provider: "huggingface", model: "RealESRGAN_x4plus" },
  openaiConfig: { apiUrl: "https://oai", modelId: "gpt-x" },
  googleConfig: { apiUrl: "https://goog", modelId: "gemini-x" },
  videoSettings: { huggingface: { prompt: "p", duration: 3, steps: 6, guidance: 1 } },
  customProviders: [
    {
      id: "cp1",
      name: "MyServer",
      apiUrl: "https://example.com",
      models: { generate: [] },
      enabled: true,
      hasToken: true,
    },
  ],
  hasTokens: {
    huggingface: true,
    gitee: false,
    modelscope: false,
    a4f: false,
    openai: false,
    google: false,
  },
  s3Config: {
    accessKeyId: "",
    secretAccessKey: "",
    bucket: "admin-bucket",
    endpoint: "https://s3.example.com",
  },
  webdavConfig: { url: "https://dav", username: "", password: "", directory: "/d" },
  storageConfigured: true,
  storageManagedBy: "admin",
};

describe("configSync", () => {
  beforeEach(() => {
    // Reset both stores to a clean baseline.
    useConfigStore.setState({
      tokens: { huggingface: [], gitee: [], modelscope: [], a4f: [], openai: [], google: [] },
      customProviders: [],
      _hasHydrated: false,
    });
  });

  it("hydrates the settings store", () => {
    hydrateFromServerConfig(serverConfig);
    const s = useSettingsStore.getState();
    expect(s.language).toBe("zh");
    expect(s.provider).toBe("huggingface");
    expect(s.model).toBe("z-image-turbo");
    expect(s.aspectRatio).toBe("16:9");
    expect(s.seed).toBe("42");
    expect(s.steps).toBe(12);
    expect(s.guidanceScale).toBe(4.5);
    expect(s.autoTranslate).toBe(true);
    expect(s.enableHD).toBe(true);
  });

  it("hydrates the config store, including hasTokens, and marks hydrated", () => {
    hydrateFromServerConfig(serverConfig);
    const c = useConfigStore.getState();
    expect(c.serviceMode).toBe("server");
    expect(c.storageType).toBe("s3");
    expect(c.systemPrompt).toBe("SYS");
    expect(c.translationPrompt).toBe("TRANS");
    expect(c.openaiConfig).toEqual({ apiUrl: "https://oai", modelId: "gpt-x" });
    expect(c.googleConfig).toEqual({ apiUrl: "https://goog", modelId: "gemini-x" });
    expect(c.storageConfigured).toBe(true);
    expect(c.s3Config.bucket).toBe("admin-bucket");
    expect(c.s3Config.accessKeyId).toBe("");
    expect(c.webdavConfig.url).toBe("https://dav");
    expect(c.hasTokens.huggingface).toBe(true);
    expect(c.hasTokens.gitee).toBe(false);
    expect(c.customProviders).toHaveLength(1);
    expect(c.customProviders[0].name).toBe("MyServer");
    expect(c._hasHydrated).toBe(true);
  });

  it("never stores raw tokens in the browser", () => {
    hydrateFromServerConfig(serverConfig);
    const c = useConfigStore.getState();
    // Provider tokens are never sent by the server; stay empty.
    expect(c.tokens.huggingface).toEqual([]);
    // Custom providers carry no token client-side.
    expect(c.customProviders[0].token).toBeFalsy();
  });

  it("selfEditableSnapshot returns only self-editable fields", () => {
    hydrateFromServerConfig(serverConfig);
    const snap = selfEditableSnapshot();

    // Included (self-editable)
    expect(snap.language).toBe("zh");
    expect(snap.systemPrompt).toBe("SYS");
    expect(snap.steps).toBe(12);

    // Excluded (admin-locked)
    const raw = snap as Record<string, unknown>;
    expect(raw.storageType).toBeUndefined();
    expect(raw.s3Config).toBeUndefined();
    expect(raw.webdavConfig).toBeUndefined();
    expect(raw.serviceMode).toBeUndefined();
    expect(raw.tokens).toBeUndefined();
    expect(raw.openaiConfig).toBeUndefined();
    expect(raw.googleConfig).toBeUndefined();
    expect(raw.customProviders).toBeUndefined();
  });
});
