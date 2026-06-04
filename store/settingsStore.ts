import { create } from "zustand";
import { Language } from "../translations";
import { ProviderOption, ModelOption, AspectRatioOption } from "../types";

export interface SettingsState {
  language: Language;
  provider: ProviderOption;
  model: ModelOption;
  aspectRatio: AspectRatioOption;
  seed: string;
  steps: number;
  guidanceScale: number;
  autoTranslate: boolean;
  enableHD: boolean;

  setLanguage: (lang: Language) => void;
  setProvider: (provider: ProviderOption) => void;
  setModel: (model: ModelOption) => void;
  setAspectRatio: (ar: AspectRatioOption) => void;
  setSeed: (seed: string) => void;
  setSteps: (steps: number) => void;
  setGuidanceScale: (scale: number) => void;
  setAutoTranslate: (enabled: boolean) => void;
  setEnableHD: (enabled: boolean) => void;
  resetImagineParams: () => void;
}

// No persistence: the server is the single source of truth. These defaults are
// only used transiently before the per-user config is hydrated after login.
export const useSettingsStore = create<SettingsState>()((set) => ({
  language: (() => {
    const browserLang = navigator.language.toLowerCase();
    return browserLang.startsWith("zh") ? "zh" : "en";
  })(),
  // The synthetic "server" custom provider (the backend proxy) is the only
  // runtime provider; the model is chosen by server-init from the available
  // server models, so the transient default before hydration is left empty.
  provider: "server",
  model: "" as ModelOption,
  aspectRatio: "1:1",
  seed: "",
  steps: 9,
  guidanceScale: 3.5,
  autoTranslate: false,
  enableHD: false,

  setLanguage: (language) => set({ language }),
  setProvider: (provider) => set({ provider }),
  setModel: (model) => set({ model }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setSeed: (seed) => set({ seed }),
  setSteps: (steps) => set({ steps }),
  setGuidanceScale: (guidanceScale) => set({ guidanceScale }),
  setAutoTranslate: (autoTranslate) => set({ autoTranslate }),
  setEnableHD: (enableHD) => set({ enableHD }),

  resetImagineParams: () =>
    set({
      seed: "",
      aspectRatio: "1:1",
      enableHD: false,
      // Keep language, provider, model, steps, guidanceScale, autoTranslate
    }),
}));
