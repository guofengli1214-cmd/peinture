import React, { useState, useMemo } from "react";
import { Select, OptionGroup } from "./Select";
import { Tooltip } from "./Tooltip";
import {
  Settings,
  ChevronUp,
  ChevronDown,
  Minus,
  Plus,
  Dices,
  Cpu,
} from "lucide-react";
import { ModelOption, ProviderOption, AspectRatioOption } from "../types";
import {
  getModelConfig,
  getGuidanceScaleConfig,
} from "../constants";
import { useSettingsStore } from "../store/settingsStore";
import { useConfigStore } from "../store/configStore";
import { translations } from "../translations";

export const ControlPanel: React.FC = () => {
  const {
    language,
    provider,
    setProvider,
    model,
    setModel,
    aspectRatio,
    setAspectRatio,
    steps,
    setSteps,
    guidanceScale,
    setGuidanceScale,
    seed,
    setSeed,
    enableHD,
    setEnableHD,
  } = useSettingsStore();

  const t = translations[language];
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const customProviders = useConfigStore((s) => s.customProviders);

  // Dynamic Aspect Ratio Options based on language
  const aspectRatioOptions = useMemo(
    () => [
      { value: "1:1", label: t.ar_square },
      { value: "9:16", label: t.ar_photo_9_16 },
      { value: "16:9", label: t.ar_movie },
      { value: "3:4", label: t.ar_portrait_3_4 },
      { value: "4:3", label: t.ar_landscape_4_3 },
      { value: "2:3", label: t.ar_landscape_2_3 },
      { value: "3:2", label: t.ar_portrait_3_2 },
    ],
    [t],
  );

  // Build grouped model options dynamically.
  // serviceMode is permanently "server": creation models come only from the
  // (admin-assigned) custom providers.
  const modelOptions = useMemo(() => {
    const groups: OptionGroup[] = [];

    customProviders.forEach((cp) => {
      const models = cp.models.generate;
      if (!models || models.length === 0) return;

      if (cp.id === "server") {
        const byProvider = new Map<string, typeof models>();
        models.forEach((m) => {
          const label = m.providerName || cp.name;
          byProvider.set(label, [...(byProvider.get(label) ?? []), m]);
        });
        byProvider.forEach((providerModels, label) => {
          groups.push({
            label,
            options: providerModels.map((m) => ({
              label: m.name,
              value: `${cp.id}:${m.id}`,
            })),
          });
        });
      } else {
        groups.push({
          label: cp.name,
          options: models.map((m) => ({
            label: m.name,
            value: `${cp.id}:${m.id}`,
          })),
        });
      }
    });

    return groups;
  }, [customProviders]);

  // Determine current model configuration (Standard or Custom)
  const activeConfig = useMemo(() => {
    // Try to find custom provider matching the ID
    const activeCustomProvider = customProviders.find((p) => p.id === provider);

    if (activeCustomProvider) {
      // It's a custom provider
      const customModel = activeCustomProvider.models.generate?.find(
        (m) => m.id === model,
      );

      if (customModel) {
        return {
          isCustom: true,
          steps: customModel.steps
            ? {
                min: customModel.steps.range[0],
                max: customModel.steps.range[1],
                default: customModel.steps.default,
              }
            : null,
          guidance: customModel.guidance
            ? {
                min: customModel.guidance.range[0],
                max: customModel.guidance.range[1],
                step: 0.1,
                default: customModel.guidance.default,
              }
            : null,
        };
      }
    }

    // Fallback to standard config
    return {
      isCustom: false,
      steps: getModelConfig(provider, model),
      guidance: getGuidanceScaleConfig(model, provider),
    };
  }, [customProviders, provider, model]);



  const handleRandomizeSeed = () => {
    setSeed(Math.floor(Math.random() * 2147483647).toString());
  };

  const handleAdjustSeed = (amount: number) => {
    const current = parseInt(seed || "0", 10);
    if (isNaN(current)) {
      setSeed((0 + amount).toString());
    } else {
      setSeed((current + amount).toString());
    }
  };

  // Handle Model Change: Parse "provider:modelId"
  const onModelChange = (val: string) => {
    // value format is "provider:modelId"
    const parts = val.split(":");
    if (parts.length >= 2) {
      const newProvider = parts[0] as ProviderOption;
      const newModel = parts.slice(1).join(":") as ModelOption; // Join back in case model ID has colons

      setProvider(newProvider);
      setModel(newModel);
    }
  };

  // Construct current value for Select
  const currentSelectValue = `${provider}:${model}`;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Model Selection (Grouped) */}
      <Select
        label={t.model}
        value={currentSelectValue}
        onChange={onModelChange}
        options={modelOptions}
        icon={<Cpu className="w-5 h-5" />}
        headerContent={
          (provider === "openai" || provider === "google") && (
            <div className="flex items-center gap-2 animate-in fade-in duration-300">
              <span className="text-xs font-medium text-ink-tertiary">{t.hd}</span>
              <Tooltip content={enableHD ? t.hdEnabled : t.hdDisabled}>
                <button
                  type="button"
                  onClick={() => setEnableHD(!enableHD)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40 ${enableHD ? "bg-accent" : "bg-fill"}`}
                >
                  <span
                    className={`${enableHD ? "translate-x-4" : "translate-x-1"} inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform`}
                  />
                </button>
              </Tooltip>
            </div>
          )
        }
      />

      {/* Aspect Ratio */}
      <Select
        label={t.aspectRatio}
        value={aspectRatio}
        onChange={(val) => setAspectRatio(val as AspectRatioOption)}
        options={aspectRatioOptions}
      />

      {/* Advanced Settings */}
      {provider !== "openai" && provider !== "google" && (
        <div className="border-t border-stroke-subtle pt-4">
        <button
          type="button"
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
          className="flex items-center justify-between w-full text-left text-ink-secondary hover:text-accent transition-colors group"
        >
          <span className="text-sm font-medium flex items-center gap-2">
            <Settings className="w-4 h-4 group-hover:rotate-45 transition-transform duration-300" />
            {t.advancedSettings}
          </span>
          {isAdvancedOpen ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isAdvancedOpen ? "grid-rows-[1fr] mt-4" : "grid-rows-[0fr]"}`}
        >
          <div className="overflow-hidden">
            <div className="space-y-5">
              {/* Steps - Hide if not configured in custom model */}
              {activeConfig.steps && (
                <div className="group">
                  <div className="flex items-center justify-between pb-2">
                    <p className="text-ink text-sm font-medium">
                      {t.steps}
                    </p>
                    <span className="text-ink-tertiary text-xs bg-fill-subtle px-2 py-0.5 rounded font-mono">
                      {steps}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={activeConfig.steps.min}
                      max={activeConfig.steps.max}
                      value={steps}
                      onChange={(e) => setSteps(Number(e.target.value))}
                      className="custom-range text-accent"
                    />
                  </div>
                </div>
              )}

              {/* Guidance Scale - Hide if not configured in custom model (or standard model doesn't support it) */}
              {activeConfig.guidance && (
                <div className="group">
                  <div className="flex items-center justify-between pb-2">
                    <p className="text-ink text-sm font-medium">
                      {t.guidanceScale}
                    </p>
                    <span className="text-ink-tertiary text-xs bg-fill-subtle px-2 py-0.5 rounded font-mono">
                      {guidanceScale.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={activeConfig.guidance.min}
                      max={activeConfig.guidance.max}
                      step={activeConfig.guidance.step || 0.1}
                      value={guidanceScale}
                      onChange={(e) => setGuidanceScale(Number(e.target.value))}
                      className="custom-range text-accent"
                    />
                  </div>
                </div>
              )}

              {/* Seed */}
              <div className="group">
                <div className="flex items-center justify-between pb-2">
                  <p className="text-ink text-sm font-medium">{t.seed}</p>
                  <span className="text-ink-tertiary text-xs">
                    {t.seedOptional}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center rounded-md fluent-field transition-all h-10 overflow-hidden">
                    <button
                      onClick={() => handleAdjustSeed(-1)}
                      className="h-full px-2 text-ink-tertiary hover:text-ink hover:bg-fill-subtle transition-colors border-r border-stroke-subtle"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      className="form-input flex-1 h-full bg-transparent border-none text-ink focus:ring-0 placeholder:text-ink-placeholder px-2 text-xs font-mono text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder={t.seedPlaceholder}
                    />
                    <button
                      onClick={() => handleAdjustSeed(1)}
                      className="h-full px-2 text-ink-tertiary hover:text-ink hover:bg-fill-subtle transition-colors border-l border-stroke-subtle"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <Tooltip content={t.seedPlaceholder}>
                    <button
                      onClick={handleRandomizeSeed}
                      className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-fill text-ink-secondary hover:bg-fill-strong hover:text-ink transition-colors active:scale-95"
                    >
                      <Dices className="w-4 h-4" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
};
