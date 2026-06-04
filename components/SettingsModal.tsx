import React, { useMemo, useEffect, useState } from "react";
import {
  X,
  Save,
  Settings2,
  Cpu,
  MessageSquareText,
  Film,
  HardDrive,
  Database,
} from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";
import { translations } from "../translations";
import { useSettingsForm } from "../hooks/useSettingsForm";
import { SettingsTabs } from "./settings/SettingsTabs";
import { GeneralTab } from "./settings/GeneralTab";
import { ModelsTab } from "./settings/ModelsTab";
import { PromptTab } from "./settings/PromptTab";
import { LiveTab } from "./settings/LiveTab";
import { StorageTab } from "./settings/StorageTab";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { language, provider } = useSettingsStore();
  const t = translations[language];

  const form = useSettingsForm(isOpen, onClose);

  // Animation State
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRendered(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        setIsRendered(false);
      }, 500); // Wait for exit animations
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const tabs = useMemo(() => {
    const base = [
      { id: "general", icon: Settings2, label: t.tab_general },
      { id: "models", icon: Cpu, label: t.model },
      { id: "prompt", icon: MessageSquareText, label: t.tab_prompt },
      { id: "live", icon: Film, label: t.tab_live },
    ];
    if (form.storageType === "s3")
      base.push({ id: "s3", icon: HardDrive, label: t.tab_storage });
    else if (form.storageType === "webdav")
      base.push({ id: "webdav", icon: Database, label: t.tab_webdav });
    return base;
  }, [t, form.storageType]);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === form.activeTab),
  );

  if (!isRendered) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      {/* Backdrop: Immediate In, Delayed Out */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-out ${isVisible ? "opacity-100" : "opacity-0 delay-200"}`}
        onClick={onClose}
      />

      {/* Modal: Delayed In, Immediate Out */}
      <div
        className={`relative w-full max-w-md bg-surface backdrop-blur-xl border border-stroke rounded-2xl shadow-dialog overflow-hidden flex flex-col max-h-[90vh] transition-all duration-300 cubic-bezier(0.16, 1, 0.3, 1) ${isVisible ? "scale-100 opacity-100 translate-y-0 delay-100" : "scale-95 opacity-0 translate-y-4"}`}
      >
        <div className="flex items-center justify-between px-5 py-2 border-b border-stroke-subtle bg-fill-subtle flex-shrink-0">
          <h2 className="text-lg font-bold text-ink tracking-wide">
            {t.settings}
          </h2>
          <button
            onClick={onClose}
            className="group p-2 rounded-lg text-ink-tertiary hover:text-ink hover:bg-fill transition-all duration-200"
          >
            <X className="w-5 h-5 transition-transform duration-500 ease-out group-hover:rotate-180" />
          </button>
        </div>

        <SettingsTabs
          tabs={tabs}
          activeTab={form.activeTab}
          setActiveTab={form.setActiveTab as any}
        />

        {/* Added min-h-0 to allow proper scrolling in flex child */}
        <div className="flex-1 overflow-x-hidden relative min-h-0 max-h-[420px]">
          <div
            className="flex h-full transition-transform duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)"
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className="w-full h-full flex-shrink-0 overflow-y-auto custom-scrollbar"
              >
                <div className="p-5">
                  {tab.id === "general" && (
                    <GeneralTab
                      storageType={form.storageType}
                      setStorageType={form.setStorageType}
                      onClearData={form.handleClearData}
                      setActiveTab={form.setActiveTab as any}
                    />
                  )}

                  {tab.id === "models" && (
                    <ModelsTab
                      serviceMode={form.serviceMode}
                      giteeToken={form.giteeToken}
                      msToken={form.msToken}
                      a4fToken={form.a4fToken}
                      openaiToken={form.openaiToken}
                      googleToken={form.googleToken}
                      openaiConfig={form.openaiConfig}
                      googleConfig={form.googleConfig}
                      customProviders={form.customProviders}
                      editModelValue={form.editModelValue}
                      setEditModelValue={form.setEditModelValue}
                      liveModelValue={form.liveModelValue}
                      setLiveModelValue={form.setLiveModelValue}
                      upscalerModelValue={form.upscalerModelValue}
                      setUpscalerModelValue={form.setUpscalerModelValue}
                      textModelValue={form.textModelValue}
                      setTextModelValue={form.setTextModelValue}
                    />
                  )}

                  {tab.id === "prompt" && (
                    <PromptTab
                      systemPrompt={form.systemPrompt}
                      setSystemPrompt={form.setSystemPrompt}
                      translationPrompt={form.translationPrompt}
                      setTranslationPrompt={form.setTranslationPrompt}
                    />
                  )}

                  {tab.id === "live" && (
                    <LiveTab
                      provider={provider}
                      videoSettings={form.videoSettings}
                      setVideoSettings={form.setVideoSettings}
                    />
                  )}

                  {(tab.id === "s3" || tab.id === "webdav") && (
                    <StorageTab
                      activeTab={tab.id}
                      s3Config={form.s3Config}
                      setS3Config={form.setS3Config}
                      webdavConfig={form.webdavConfig}
                      setWebdavConfig={form.setWebdavConfig}
                      testS3Result={form.testS3Result}
                      isTestingS3={form.isTestingS3}
                      handleTestS3={form.handleTestS3}
                      testWebDAVResult={form.testWebDAVResult}
                      isTestingWebDAV={form.isTestingWebDAV}
                      handleTestWebDAV={form.handleTestWebDAV}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-2 border-t border-stroke-subtle bg-fill-subtle flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-ink-secondary hover:text-ink hover:bg-fill rounded-lg transition-all duration-200"
          >
            {t.cancel}
          </button>
          <button
            onClick={form.handleSave}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-on-accent bg-accent hover:bg-accent-hover active:bg-accent-pressed active:scale-95 rounded-lg transition-all shadow-card hover:shadow-card-hover"
          >
            <Save className="w-4 h-4" />
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
};
