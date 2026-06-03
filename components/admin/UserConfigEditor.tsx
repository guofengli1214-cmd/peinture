import React, { useState, useEffect, useCallback } from "react";
import { Loader2, Save, KeyRound, Check } from "lucide-react";
import { ProviderId } from "../../types";
import { useSettingsStore } from "../../store/settingsStore";
import { translations } from "../../translations";
import {
  getUserConfig,
  updateUserConfig,
  AdminConfigPatch,
} from "../../services/adminService";

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "huggingface", label: "HuggingFace" },
  { id: "gitee", label: "Gitee" },
  { id: "modelscope", label: "ModelScope" },
  { id: "a4f", label: "A4F" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google" },
];

const emptyTokenInputs = (): Record<ProviderId, string> => ({
  huggingface: "",
  gitee: "",
  modelscope: "",
  a4f: "",
  openai: "",
  google: "",
});

interface UserConfigEditorProps {
  userId: number;
  onSaved: () => void;
  onError: () => void;
}

export const UserConfigEditor: React.FC<UserConfigEditorProps> = ({
  userId,
  onSaved,
  onError,
}) => {
  const { language } = useSettingsStore();
  const t = translations[language];

  const [hasTokens, setHasTokens] = useState<Record<ProviderId, boolean> | null>(null);
  const [tokenInputs, setTokenInputs] = useState<Record<ProviderId, string>>(emptyTokenInputs());
  const [openaiConfig, setOpenaiConfig] = useState({ apiUrl: "", modelId: "" });
  const [googleConfig, setGoogleConfig] = useState({ apiUrl: "", modelId: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setTokenInputs(emptyTokenInputs());
    try {
      const cfg = await getUserConfig(userId);
      setHasTokens(cfg.hasTokens);
      setOpenaiConfig(cfg.openaiConfig);
      setGoogleConfig(cfg.googleConfig);
    } catch {
      onError();
    } finally {
      setLoading(false);
    }
  }, [userId, onError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    // Only send token fields the admin actually filled in (set/replace).
    const tokens: Partial<Record<ProviderId, string>> = {};
    for (const { id } of PROVIDERS) {
      const v = tokenInputs[id].trim();
      if (v.length > 0) tokens[id] = v;
    }
    const patch: AdminConfigPatch = { openaiConfig, googleConfig };
    if (Object.keys(tokens).length > 0) patch.tokens = tokens;

    try {
      const cfg = await updateUserConfig(userId, patch);
      setHasTokens(cfg.hasTokens);
      setTokenInputs(emptyTokenInputs());
      onSaved();
    } catch {
      onError();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-ink-tertiary animate-spin" />
      </div>
    );
  }

  const inputCls =
    "w-full px-3 py-2 fluent-field rounded-md text-ink text-sm focus:outline-none transition-colors";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-ink-tertiary mb-3 flex items-center gap-2">
          <KeyRound className="w-3.5 h-3.5" />
          {t.admin_tokens}
        </h4>
        <div className="flex flex-col gap-3">
          {PROVIDERS.map(({ id, label }) => (
            <div key={id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-ink">{label}</span>
                {hasTokens?.[id] ? (
                  <span className="text-[11px] text-green-400 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    {t.admin_token_set}
                  </span>
                ) : (
                  <span className="text-[11px] text-ink-tertiary">{t.admin_token_unset}</span>
                )}
              </div>
              <input
                className={inputCls}
                type="password"
                placeholder={t.admin_token_placeholder}
                value={tokenInputs[id]}
                autoComplete="off"
                onChange={(e) =>
                  setTokenInputs((prev) => ({ ...prev, [id]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-ink-tertiary mb-3">
          {t.admin_endpoints}
        </h4>
        <div className="grid grid-cols-1 gap-2">
          <input
            className={inputCls}
            placeholder={`OpenAI ${t.admin_api_url}`}
            value={openaiConfig.apiUrl}
            onChange={(e) => setOpenaiConfig((p) => ({ ...p, apiUrl: e.target.value }))}
          />
          <input
            className={inputCls}
            placeholder={`OpenAI ${t.admin_model_id}`}
            value={openaiConfig.modelId}
            onChange={(e) => setOpenaiConfig((p) => ({ ...p, modelId: e.target.value }))}
          />
          <input
            className={inputCls}
            placeholder={`Google ${t.admin_api_url}`}
            value={googleConfig.apiUrl}
            onChange={(e) => setGoogleConfig((p) => ({ ...p, apiUrl: e.target.value }))}
          />
          <input
            className={inputCls}
            placeholder={`Google ${t.admin_model_id}`}
            value={googleConfig.modelId}
            onChange={(e) => setGoogleConfig((p) => ({ ...p, modelId: e.target.value }))}
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 bg-accent hover:bg-accent-hover text-on-accent text-sm font-bold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? t.admin_saving : t.admin_save_config}
      </button>
    </div>
  );
};
