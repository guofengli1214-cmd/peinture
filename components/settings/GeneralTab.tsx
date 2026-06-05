import React, { useState } from "react";
import {
  Languages,
  HardDrive,
  Trash2,
  AlertCircle,
  Lock,
} from "lucide-react";
import { useSettingsStore } from "../../store/settingsStore";
import { translations } from "../../translations";
import { StorageType } from "../../types";

interface GeneralTabProps {
  storageType: StorageType;
  storageConfigured: boolean;
  onClearData: () => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({
  storageType,
  storageConfigured,
  onClearData,
}) => {
  const { language, setLanguage } = useSettingsStore();
  const t = translations[language];
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const storageLabel =
    storageType === "s3"
      ? t.storage_s3
      : storageType === "webdav"
        ? t.storage_webdav
        : storageType === "opfs"
          ? t.storage_opfs
          : t.storage_off;

  return (
    <div className="space-y-6">
      <div>
        <label className="flex items-center gap-2 text-xs font-medium text-ink mb-2">
          <Languages className="w-3.5 h-3.5 text-accent" />
          {t.language}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setLanguage("en")}
            className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 border ${language === "en" ? "bg-accent border-accent text-on-accent shadow-card" : "bg-fill-subtle border-stroke text-ink-secondary hover:bg-fill hover:text-ink hover:border-stroke"}`}
          >
            English
          </button>
          <button
            onClick={() => setLanguage("zh")}
            className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 border ${language === "zh" ? "bg-accent border-accent text-on-accent shadow-card" : "bg-fill-subtle border-stroke text-ink-secondary hover:bg-fill hover:text-ink hover:border-stroke"}`}
          >
            中文
          </button>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-xs font-medium text-ink mb-2">
          <HardDrive className="w-3.5 h-3.5 text-green-400" />
          {t.storage_service}
        </label>
        <div className="rounded-xl border border-stroke bg-fill-subtle px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink truncate">
                {storageLabel}
              </div>
              <div className="text-xs text-ink-tertiary mt-0.5">
                {t.storage_admin_managed}
              </div>
            </div>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                storageConfigured
                  ? "bg-green-500/10 border-green-500/20 text-green-500"
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}
            >
              <Lock className="w-3 h-3" />
              {storageConfigured ? t.configured : t.storage_not_configured}
            </div>
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-stroke-subtle">
        <label className="flex items-center gap-2 text-xs font-medium text-red-400 mb-2">
          <Trash2 className="w-3.5 h-3.5" />
          {t.clearData}
        </label>
        <p className="text-xs text-ink-tertiary mb-3">{t.clearDataDesc}</p>
        {!showClearConfirm ? (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-medium transition-colors"
          >
            {t.clearData}
          </button>
        ) : (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span className="text-xs text-red-200 leading-relaxed">
                {t.clearDataConfirm}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 bg-fill-subtle hover:bg-fill text-ink-secondary hover:text-ink rounded-lg text-xs font-medium transition-colors"
              >
                {t.cancel}
              </button>
              <button
                onClick={onClearData}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-colors shadow-card"
              >
                {t.confirm}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
