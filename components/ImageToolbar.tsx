import React, { useState, useEffect } from "react";
import {
  Info as LucideInfo,
  Eye as LucideEye,
  EyeOff as LucideEyeOff,
  Download as LucideDownload,
  Trash2 as LucideTrash2,
  X as LucideX,
  Check as LucideCheck,
  Loader2 as LucideLoader2,
  Film as LucideFilm,
  CloudUpload,
  Timer,
  Copy,
  Check,
} from "lucide-react";
import { Icon4x as CustomIcon4x } from "./Icons";
import { Tooltip } from "./Tooltip";
import { GeneratedImage, ProviderOption } from "../types";
import { isStorageConfigured } from "../services/storageService";
import { getCustomProviders } from "../services/utils";
import { useSettingsStore } from "../store/settingsStore";
import { translations } from "../translations";

interface ImageToolbarProps {
  currentImage: GeneratedImage | null;
  isComparing: boolean;
  showInfo: boolean;
  setShowInfo: (val: boolean) => void;
  isUpscaling: boolean;
  isDownloading: boolean;
  handleUpscale: () => void;
  handleToggleBlur: () => void;
  handleDownload: () => void;
  handleDelete: () => void;
  handleCancelUpscale: () => void;
  handleApplyUpscale: () => void;
  // New Props for Live
  isLiveMode?: boolean;
  onLiveClick?: () => void;
  isLiveGenerating?: boolean;
  isGeneratingVideoPrompt?: boolean;
  provider?: ProviderOption;
  // Cloud Props
  handleUploadToS3?: () => void;
  isUploading?: boolean;
  isUploaded?: boolean;
  // New Props for Popover
  imageDimensions: { width: number; height: number } | null;
  copiedPrompt: boolean;
  handleCopyPrompt: () => void;
}

export const ImageToolbar: React.FC<ImageToolbarProps> = ({
  currentImage,
  isComparing,
  showInfo,
  setShowInfo,
  isUpscaling,
  isDownloading,
  handleUpscale,
  handleToggleBlur,
  handleDownload,
  handleDelete,
  handleCancelUpscale,
  handleApplyUpscale,
  isLiveMode,
  onLiveClick,
  isLiveGenerating,
  isGeneratingVideoPrompt,
  handleUploadToS3,
  isUploading,
  isUploaded,
  imageDimensions,
  copiedPrompt,
  handleCopyPrompt,
}) => {
  const { language } = useSettingsStore();
  const t = translations[language];
  const [isStorageEnabled, setIsStorageEnabled] = useState(false);

  useEffect(() => {
    const checkStorage = () => {
      setIsStorageEnabled(isStorageConfigured());
    };
    checkStorage();
    window.addEventListener("storage", checkStorage);
    // Fallback polling for settings changes
    const interval = setInterval(checkStorage, 2000);
    return () => {
      window.removeEventListener("storage", checkStorage);
      clearInterval(interval);
    };
  }, []);

  if (!currentImage) return null;

  // Logic for button visibility:
  // 1. Details, NSFW, Download, Delete -> Always
  // 2. Live -> Always (supported via cross-provider handling)
  // 3. Upscale -> Always available (now uses Settings config)
  // 4. Upload -> If storage configured

  // Live button is now enabled for all images
  const showLiveButton = !isLiveMode; // Only hide if actively viewing the video (replaced by 'Image' button in PreviewStage)
  const showUpscaleButton = !isLiveMode; // Upscale is available unless in video mode
  const showUploadButton = isStorageEnabled;

  const isBusy = isLiveGenerating || isGeneratingVideoPrompt;
  // Disable live button if busy (generating) OR if already in Live Mode (viewing video)
  const isLiveDisabled = isBusy || isLiveMode;

  const getProviderLabel = (providerId?: string) => {
    if (!providerId) return "Hugging Face";
    if (providerId === "gitee") return "Gitee AI";
    if (providerId === "modelscope") return "Model Scope";
    if (providerId === "a4f") return "A4F";
    if (providerId === "huggingface") return "Hugging Face";

    // Check Custom Providers
    const customProviders = getCustomProviders();
    const custom = customProviders.find((p) => p.id === providerId);
    return custom ? custom.name : providerId; // Fallback to ID if not found
  };

  const getModelLabel = (modelValue: string, providerId?: string) => {
    const customProviders = getCustomProviders();
    // Limit to the named provider when given, otherwise search every provider.
    const candidates = providerId
      ? customProviders.filter((p) => p.id === providerId)
      : customProviders;

    for (const provider of candidates) {
      const allModels = [
        ...(provider.models.generate || []),
        ...(provider.models.edit || []),
        ...(provider.models.video || []),
        ...(provider.models.text || []),
      ];
      const customModel = allModels.find((m) => m.id === modelValue);
      if (customModel) return customModel.name;
    }

    return modelValue;
  };

  return (
    <div className="absolute bottom-4 md:bottom-6 inset-x-0 flex justify-center pointer-events-none z-40">
      {isComparing ? (
        /* Comparison Controls */
        <div className="pointer-events-auto flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300">
          <button
            onClick={handleCancelUpscale}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface/90 backdrop-blur-md border border-stroke text-ink-secondary hover:bg-fill hover:text-ink transition-all shadow-flyout hover:border-red-500/30"
          >
            <LucideX className="w-5 h-5 text-red-400" />
            <span className="font-medium text-sm">{t.discard}</span>
          </button>
          <button
            onClick={handleApplyUpscale}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface/90 backdrop-blur-md border border-stroke text-ink-secondary hover:bg-fill hover:text-ink transition-all shadow-flyout hover:border-accent/30"
          >
            <LucideCheck className="w-5 h-5 text-accent" />
            <span className="font-medium text-sm">{t.apply}</span>
          </button>
        </div>
      ) : (
        /* Standard Toolbar Container */
        <div className="relative pointer-events-auto">
          {/* Info Popover (Positioned relative to toolbar) */}
          {showInfo && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-[90vw] md:w-[400px] bg-surface backdrop-blur-md border border-stroke rounded-xl p-5 shadow-dialog text-sm text-ink-secondary animate-in slide-in-from-bottom-2 fade-in duration-200 z-50">
              <div className="flex items-center justify-between mb-3 border-b border-stroke pb-2">
                <h4 className="font-medium text-ink">{t.imageDetails}</h4>
                <button
                  onClick={() => setShowInfo(false)}
                  className="text-ink-tertiary hover:text-ink"
                >
                  <LucideX className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="block text-ink-tertiary text-[10px] uppercase tracking-wider font-semibold mb-0.5">
                      {t.provider}
                    </span>
                    <p
                      className="text-ink/90 capitalize truncate"
                      title={getProviderLabel(currentImage.provider)}
                    >
                      {getProviderLabel(currentImage.provider)}
                    </p>
                  </div>
                  <div>
                    <span className="block text-ink-tertiary text-[10px] uppercase tracking-wider font-semibold mb-0.5">
                      {t.model}
                    </span>
                    <p
                      className="text-ink/90 truncate"
                      title={getModelLabel(
                        currentImage.model,
                        currentImage.provider,
                      )}
                    >
                      {getModelLabel(currentImage.model, currentImage.provider)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="block text-ink-tertiary text-[10px] uppercase tracking-wider font-semibold mb-0.5">
                      {t.dimensions}
                    </span>
                    <p className="text-ink/90">
                      {imageDimensions
                        ? `${imageDimensions.width} x ${imageDimensions.height}`
                        : currentImage.aspectRatio}
                      {/* Show aspect ratio if not custom or if dimensions match */}
                      {currentImage.aspectRatio !== "custom" &&
                        imageDimensions &&
                        ` (${currentImage.aspectRatio})`}
                      {currentImage.isUpscaled && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] bg-accent-light text-accent font-bold">
                          HD
                        </span>
                      )}
                    </p>
                  </div>
                  {currentImage.duration !== undefined && (
                    <div>
                      <span className="block text-ink-tertiary text-[10px] uppercase tracking-wider font-semibold mb-0.5">
                        {t.duration}
                      </span>
                      <p className="font-mono text-ink/90 flex items-center gap-1">
                        <Timer className="w-3 h-3 text-accent" />
                        {currentImage.duration.toFixed(1)}s
                      </p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {currentImage.seed !== undefined && (
                    <div>
                      <span className="block text-ink-tertiary text-[10px] uppercase tracking-wider font-semibold mb-0.5">
                        {t.seed}
                      </span>
                      <p className="font-mono text-ink/90">
                        {currentImage.seed}
                      </p>
                    </div>
                  )}
                  {currentImage.guidanceScale !== undefined && (
                    <div>
                      <span className="block text-ink-tertiary text-[10px] uppercase tracking-wider font-semibold mb-0.5">
                        {t.guidanceScale}
                      </span>
                      <p className="font-mono text-ink/90">
                        {currentImage.guidanceScale.toFixed(1)}
                      </p>
                    </div>
                  )}
                  {currentImage.steps !== undefined && (
                    <div>
                      <span className="block text-ink-tertiary text-[10px] uppercase tracking-wider font-semibold mb-0.5">
                        {t.steps}
                      </span>
                      <p className="font-mono text-ink/90">
                        {currentImage.steps}
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="block text-ink-tertiary text-[10px] uppercase tracking-wider font-semibold">
                      {t.prompt}
                    </span>
                    <button
                      onClick={handleCopyPrompt}
                      className="flex items-center gap-1.5 text-[10px] font-medium text-accent hover:text-accent-hover transition-colors"
                    >
                      {copiedPrompt ? (
                        <>
                          <Check className="w-3 h-3" />
                          {t.copied}
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          {t.copy}
                        </>
                      )}
                    </button>
                  </div>
                  <div className="max-h-24 overflow-y-auto custom-scrollbar p-2 bg-fill-subtle rounded-lg border border-stroke-subtle">
                    <p className="text-xs leading-relaxed text-ink-secondary italic select-text">
                      {currentImage.prompt}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="max-w-[90vw] overflow-x-auto md:overflow-visible scrollbar-hide rounded-2xl bg-surface/90 backdrop-blur-md border border-stroke shadow-flyout transition-opacity duration-300 opacity-100 md:opacity-0 md:group-hover:opacity-100">
            <div className="flex items-center gap-1 p-1.5 min-w-max">
              <Tooltip content={t.details}>
                <button
                  onClick={() => setShowInfo(!showInfo)}
                  className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${showInfo ? "bg-accent text-on-accent shadow-card" : "text-ink-secondary hover:text-ink hover:bg-fill"}`}
                >
                  <LucideInfo className="w-5 h-5" />
                </button>
              </Tooltip>

              <div className="w-px h-5 bg-stroke mx-1"></div>

              {/* Live Button for Gitee or Hugging Face */}
              {showLiveButton && (
                <>
                  <Tooltip
                    content={
                      isGeneratingVideoPrompt
                        ? t.liveGeneratingDesc
                        : isLiveGenerating
                          ? t.liveGenerating
                          : t.live
                    }
                  >
                    <button
                      onClick={onLiveClick}
                      disabled={isLiveDisabled}
                      className={`
                                                flex items-center justify-center w-10 h-10 rounded-xl transition-all
                                                ${isLiveMode ? "text-red-500 bg-red-500/10" : "text-ink-secondary hover:text-red-500 hover:bg-fill"}
                                                ${isBusy ? "opacity-50 cursor-not-allowed" : ""}
                                                ${isLiveMode && !isBusy ? "cursor-default" : ""}
                                                ${!isLiveMode && !isBusy ? "cursor-pointer" : ""}
                                            `}
                    >
                      {isLiveGenerating || isGeneratingVideoPrompt ? (
                        <LucideLoader2 className="w-5 h-5 animate-spin text-red-400" />
                      ) : (
                        <LucideFilm className="w-5 h-5" />
                      )}
                    </button>
                  </Tooltip>
                  <div className="w-px h-5 bg-stroke mx-1"></div>
                </>
              )}

              {/* Upscale Button - Always shown if not live mode */}
              {showUpscaleButton && (
                <>
                  <Tooltip content={isUpscaling ? t.upscaling : t.upscale}>
                    <button
                      onClick={handleUpscale}
                      disabled={isUpscaling || currentImage.isUpscaled}
                      className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${currentImage.isUpscaled ? "text-accent bg-accent-light" : "text-ink-secondary hover:text-accent hover:bg-fill"} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isUpscaling ? (
                        <LucideLoader2 className="w-5 h-5 animate-spin text-accent" />
                      ) : (
                        <CustomIcon4x className="w-5 h-5 transition-colors duration-300" />
                      )}
                    </button>
                  </Tooltip>
                  <div className="w-px h-5 bg-stroke mx-1"></div>
                </>
              )}

              <Tooltip content={t.toggleBlur}>
                <button
                  onClick={handleToggleBlur}
                  className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${currentImage.isBlurred ? "text-accent bg-fill" : "text-ink-secondary hover:text-ink hover:bg-fill"}`}
                >
                  {currentImage.isBlurred ? (
                    <LucideEyeOff className="w-5 h-5" />
                  ) : (
                    <LucideEye className="w-5 h-5" />
                  )}
                </button>
              </Tooltip>

              <div className="w-px h-5 bg-stroke mx-1"></div>

              {/* Upload Button */}
              {showUploadButton && (
                <>
                  <Tooltip
                    content={
                      isUploading
                        ? t.uploading
                        : isUploaded
                          ? t.upload_success
                          : t.upload
                    }
                  >
                    <button
                      onClick={handleUploadToS3}
                      disabled={isUploading}
                      className={`
                                                flex items-center justify-center w-10 h-10 rounded-xl transition-all 
                                                ${
                                                  isUploading
                                                    ? "text-green-400 bg-green-500/10 cursor-not-allowed"
                                                    : isUploaded
                                                      ? "text-green-400 bg-green-500/20 border border-green-500/30 shadow-[0_0_10px_-3px_rgba(74,222,128,0.3)] hover:bg-green-500/30"
                                                      : "text-ink-secondary hover:text-green-500 hover:bg-fill"
                                                }
                                            `}
                    >
                      {isUploading ? (
                        <LucideLoader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <CloudUpload className="w-5 h-5" />
                      )}
                    </button>
                  </Tooltip>
                  <div className="w-px h-5 bg-stroke mx-1"></div>
                </>
              )}

              <Tooltip content={t.download}>
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${isDownloading ? "text-blue-400 bg-blue-500/10 cursor-not-allowed" : "text-ink-secondary hover:text-blue-500 hover:bg-fill"}`}
                >
                  {isDownloading ? (
                    <LucideLoader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <LucideDownload className="w-5 h-5" />
                  )}
                </button>
              </Tooltip>

              <div className="w-px h-5 bg-stroke mx-1"></div>

              <Tooltip content={t.delete}>
                <button
                  onClick={handleDelete}
                  className="flex items-center justify-center w-10 h-10 rounded-xl text-ink-secondary hover:text-red-400 transition-all hover:bg-red-500/10"
                >
                  <LucideTrash2 className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
