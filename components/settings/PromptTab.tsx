import React from "react";
import { MessageSquare, Languages, RotateCcw } from "lucide-react";
import { useSettingsStore } from "../../store/settingsStore";
import { translations } from "../../translations";
import {
  DEFAULT_SYSTEM_PROMPT_CONTENT,
  DEFAULT_TRANSLATION_SYSTEM_PROMPT,
} from "../../services/utils";

interface PromptTabProps {
  systemPrompt: string;
  setSystemPrompt: (v: string) => void;
  translationPrompt: string;
  setTranslationPrompt: (v: string) => void;
}

export const PromptTab: React.FC<PromptTabProps> = ({
  systemPrompt,
  setSystemPrompt,
  translationPrompt,
  setTranslationPrompt,
}) => {
  const { language } = useSettingsStore();
  const t = translations[language];

  const handleRestoreDefault = () =>
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT_CONTENT);
  const handleRestoreTranslationDefault = () =>
    setTranslationPrompt(DEFAULT_TRANSLATION_SYSTEM_PROMPT);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <MessageSquare className="w-4 h-4 text-pink-400" />
            {t.systemPrompts}
          </label>
          <button
            onClick={handleRestoreDefault}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-ink-tertiary hover:text-ink bg-fill-subtle hover:bg-fill transition-colors border border-transparent hover:border-stroke"
            title={t.restoreDefault}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t.restoreDefault}
          </button>
        </div>
        <div className="relative group">
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={t.promptContent}
            className="w-full h-28 fluent-field rounded-md p-4 text-sm text-ink placeholder:text-ink-placeholder focus:outline-none resize-none custom-scrollbar leading-relaxed font-mono transition-all duration-300 ease-out"
          />
        </div>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between pt-2">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <Languages className="w-4 h-4 text-blue-400" />
            {t.translationPrompt}
          </label>
          <button
            onClick={handleRestoreTranslationDefault}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-ink-tertiary hover:text-ink bg-fill-subtle hover:bg-fill transition-colors border border-transparent hover:border-stroke"
            title={t.restoreDefault}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t.restoreDefault}
          </button>
        </div>
        <div className="relative group">
          <textarea
            value={translationPrompt}
            onChange={(e) => setTranslationPrompt(e.target.value)}
            placeholder={t.promptContent}
            className="w-full h-28 fluent-field rounded-md p-4 text-sm text-ink placeholder:text-ink-placeholder focus:outline-none resize-none custom-scrollbar leading-relaxed font-mono transition-all duration-300 ease-out"
          />
        </div>
      </div>
    </div>
  );
};
