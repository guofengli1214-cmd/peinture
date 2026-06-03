import React from "react";
import {
  MessageSquare,
  Clock,
  Layers,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { useSettingsStore } from "../../store/settingsStore";
import { translations } from "../../translations";
import { VideoSettings } from "../../types";
import { DEFAULT_VIDEO_SETTINGS } from "../../services/utils";

interface LiveTabProps {
  provider: string;
  videoSettings: VideoSettings;
  setVideoSettings: (v: VideoSettings) => void;
}

export const LiveTab: React.FC<LiveTabProps> = ({
  provider,
  videoSettings,
  setVideoSettings,
}) => {
  const { language } = useSettingsStore();
  const t = translations[language];

  const handleRestoreVideoDefaults = () => {
    setVideoSettings(
      DEFAULT_VIDEO_SETTINGS[provider] || DEFAULT_VIDEO_SETTINGS["huggingface"],
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <MessageSquare className="w-4 h-4 text-accent" />
            {t.videoPrompt}
          </label>
          <button
            onClick={handleRestoreVideoDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-ink-tertiary hover:text-ink bg-fill-subtle hover:bg-fill transition-colors border border-transparent hover:border-stroke"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t.restoreDefault}
          </button>
        </div>
        <textarea
          value={videoSettings.prompt}
          onChange={(e) =>
            setVideoSettings({ ...videoSettings, prompt: e.target.value })
          }
          className="w-full h-24 fluent-field rounded-md p-4 text-sm text-ink placeholder:text-ink-placeholder focus:outline-none resize-none custom-scrollbar leading-relaxed font-mono transition-all duration-300 ease-out"
        />
      </div>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-ink min-w-[6rem]">
            <Clock className="w-4 h-4 text-blue-400" />
            {t.videoDuration}
          </label>
          <div className="flex flex-1 items-center gap-3">
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.5"
              value={videoSettings.duration}
              onChange={(e) =>
                setVideoSettings({
                  ...videoSettings,
                  duration: Number(e.target.value),
                })
              }
              className="custom-range text-blue-500 flex-1"
            />
            <span className="text-xs font-mono text-ink-tertiary bg-fill-subtle px-2 py-0.5 rounded min-w-[3.5rem] text-center">
              {videoSettings.duration} {t.seconds}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-ink min-w-[6rem]">
            <Layers className="w-4 h-4 text-green-400" />
            {t.videoSteps}
          </label>
          <div className="flex flex-1 items-center gap-3">
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={videoSettings.steps}
              onChange={(e) =>
                setVideoSettings({
                  ...videoSettings,
                  steps: Number(e.target.value),
                })
              }
              className="custom-range text-green-500 flex-1"
            />
            <span className="text-xs font-mono text-ink-tertiary bg-fill-subtle px-2 py-0.5 rounded min-w-[2rem] text-center">
              {videoSettings.steps}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-ink min-w-[6rem]">
            <Sparkles className="w-4 h-4 text-yellow-400" />
            {t.videoGuidance}
          </label>
          <div className="flex flex-1 items-center gap-3">
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={videoSettings.guidance}
              onChange={(e) =>
                setVideoSettings({
                  ...videoSettings,
                  guidance: Number(e.target.value),
                })
              }
              className="custom-range text-yellow-500 flex-1"
            />
            <span className="text-xs font-mono text-ink-tertiary bg-fill-subtle px-2 py-0.5 rounded min-w-[2rem] text-center">
              {videoSettings.guidance}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
