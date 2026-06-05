import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../services/configService", () => ({
  pushConfig: vi.fn().mockResolvedValue({}),
  fetchConfig: vi.fn(),
}));

import { pushConfig } from "../services/configService";
import {
  hydrateFromServerConfig,
  startConfigSync,
  stopConfigSync,
  resetConfigSync,
} from "../services/configSync";
import { useSettingsStore } from "../store/settingsStore";
import { ServerPublicConfig } from "../types";

const serverConfig: ServerPublicConfig = {
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
  hasTokens: { huggingface: false, gitee: false, modelscope: false, a4f: false, openai: false, google: false },
  s3Config: { accessKeyId: "", secretAccessKey: "" },
  webdavConfig: { url: "", username: "", password: "", directory: "" },
  storageConfigured: true,
  storageManagedBy: "admin",
};

describe("configSync debounced server sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetConfigSync();
  });

  afterEach(() => {
    stopConfigSync();
    vi.useRealTimers();
  });

  it("debounces a self-editable change into a single PUT", () => {
    hydrateFromServerConfig(serverConfig);
    startConfigSync();

    useSettingsStore.getState().setLanguage("en");
    useSettingsStore.getState().setSteps(12);

    // Still within the debounce window — nothing sent yet.
    expect(pushConfig).not.toHaveBeenCalled();

    vi.advanceTimersByTime(800);

    // The two rapid changes coalesce into one PUT carrying the latest snapshot.
    expect(pushConfig).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pushConfig).mock.calls[0][0]).toMatchObject({
      language: "en",
      steps: 12,
    });
  });

  it("does not sync after stopConfigSync", () => {
    hydrateFromServerConfig(serverConfig);
    const stop = startConfigSync();
    stop();

    useSettingsStore.getState().setLanguage("en");
    vi.advanceTimersByTime(800);

    expect(pushConfig).not.toHaveBeenCalled();
  });
});
