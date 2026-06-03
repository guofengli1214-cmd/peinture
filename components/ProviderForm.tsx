import React, { useState } from "react";
import { Loader2, Plus, Trash2, Save, X } from "lucide-react";
import {
  ApiProviderFormat,
  ApiProviderCapability,
  ApiProviderModelDef,
  CustomApiProvider,
  CustomApiProviderInput,
} from "../types";
import { useSettingsStore } from "../store/settingsStore";
import { translations } from "../translations";

interface ProviderFormProps {
  initial?: CustomApiProvider;
  onSubmit: (input: CustomApiProviderInput) => Promise<void>;
  onCancel: () => void;
}

const CAPS: ApiProviderCapability[] = ["image", "edit", "text"];
const FORMATS: ApiProviderFormat[] = ["openai", "claude", "gemini"];

const inputCls =
  "w-full px-3 py-2 fluent-field rounded-md text-ink text-sm focus:outline-none transition-colors";

export const ProviderForm: React.FC<ProviderFormProps> = ({ initial, onSubmit, onCancel }) => {
  const { language } = useSettingsStore();
  const t = translations[language];

  const [name, setName] = useState(initial?.name ?? "");
  const [apiUrl, setApiUrl] = useState(initial?.apiUrl ?? "");
  const [format, setFormat] = useState<ApiProviderFormat>(initial?.format ?? "openai");
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [models, setModels] = useState<ApiProviderModelDef[]>(
    initial?.models?.length ? initial.models : [{ modelId: "", name: "", capabilities: ["image"] }],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capLabel = (c: ApiProviderCapability) =>
    c === "image" ? t.cap_image : c === "edit" ? t.cap_edit : t.cap_text;

  const updateModel = (i: number, patch: Partial<ApiProviderModelDef>) =>
    setModels((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  const toggleCap = (i: number, cap: ApiProviderCapability) =>
    setModels((prev) =>
      prev.map((m, idx) => {
        if (idx !== i) return m;
        const has = m.capabilities.includes(cap);
        return { ...m, capabilities: has ? m.capabilities.filter((c) => c !== cap) : [...m.capabilities, cap] };
      }),
    );

  const canSubmit =
    name.trim() && apiUrl.trim() && models.some((m) => m.modelId.trim() && m.capabilities.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const cleanModels = models
      .filter((m) => m.modelId.trim() && m.capabilities.length > 0)
      .map((m) => ({ modelId: m.modelId.trim(), name: m.name.trim() || m.modelId.trim(), capabilities: m.capabilities }));
    const input: CustomApiProviderInput = { name: name.trim(), apiUrl: apiUrl.trim(), format, models: cleanModels, enabled };
    if (secret) input.secret = secret; // omit on edit keeps current key
    try {
      await onSubmit(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.admin_action_failed);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-fill-subtle border border-stroke rounded-xl p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-ink">{initial ? t.prov_save : t.prov_add}</span>
        <button type="button" onClick={onCancel} className="text-ink-tertiary hover:text-ink"><X className="w-4 h-4" /></button>
      </div>

      <input className={inputCls} placeholder={t.prov_name} value={name} onChange={(e) => setName(e.target.value)} />
      <input className={inputCls} placeholder={`${t.prov_url} (https://...)`} value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />

      <div className="flex gap-2">
        {FORMATS.map((f) => (
          <button type="button" key={f} onClick={() => setFormat(f)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium border capitalize transition-colors ${format === f ? "bg-accent border-accent text-on-accent" : "bg-fill-subtle border-stroke text-ink-secondary hover:text-ink"}`}>
            {f}
          </button>
        ))}
      </div>
      {format === "claude" && <p className="text-[11px] text-amber-300/80">{t.prov_claude_note}</p>}

      <input className={inputCls} type="password" autoComplete="off"
        placeholder={initial ? t.prov_secret_keep : t.prov_secret}
        value={secret} onChange={(e) => setSecret(e.target.value)} />

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-ink-secondary">{t.prov_models}</span>
        {models.map((m, i) => (
          <div key={i} className="border border-stroke rounded-lg p-2 flex flex-col gap-2">
            <div className="flex gap-2">
              <input className={inputCls} placeholder={t.prov_model_id} value={m.modelId} onChange={(e) => updateModel(i, { modelId: e.target.value })} />
              <input className={inputCls} placeholder={t.prov_model_name} value={m.name} onChange={(e) => updateModel(i, { name: e.target.value })} />
              {models.length > 1 && (
                <button type="button" onClick={() => setModels((p) => p.filter((_, idx) => idx !== i))}
                  className="px-2 text-red-400 hover:text-red-300 shrink-0"><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {CAPS.map((c) => (
                <button type="button" key={c} onClick={() => toggleCap(i, c)}
                  className={`px-2 py-1 rounded text-[11px] border transition-colors ${m.capabilities.includes(c) ? "bg-accent-light border-accent/40 text-accent" : "border-stroke text-ink-tertiary hover:text-ink"}`}>
                  {capLabel(c)}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setModels((p) => [...p, { modelId: "", name: "", capabilities: ["image"] }])}
          className="self-start text-xs text-accent hover:text-accent-hover flex items-center gap-1"><Plus className="w-3.5 h-3.5" />{t.prov_add_model}</button>
      </div>

      <label className="flex items-center gap-2 text-xs text-ink-secondary">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {t.prov_enabled}
      </label>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button type="submit" disabled={!canSubmit || submitting}
        className="w-full py-2.5 bg-accent hover:bg-accent-hover text-on-accent text-sm font-bold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {submitting ? t.prov_saving : t.prov_save}
      </button>
    </form>
  );
};
