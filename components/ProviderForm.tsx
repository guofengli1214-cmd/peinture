import React, { useState } from "react";
import { Loader2, Plus, Trash2, Save, X } from "lucide-react";
import {
  ApiProviderFormat,
  ApiProviderCapability,
  ApiProviderModelDef,
  GradioModelConfig,
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

const CAPS: ApiProviderCapability[] = ["image", "edit", "text", "video", "upscale"];
const FORMATS: ApiProviderFormat[] = ["openai", "claude", "gemini", "gradio"];

const inputCls =
  "w-full px-3 py-2 fluent-field rounded-md text-ink text-sm focus:outline-none transition-colors";

const emptyGradio = (): GradioModelConfig => ({
  baseUrl: "",
  fnIndex: 0,
  triggerId: 0,
  argsTemplate: [],
  outputPath: "data[0]",
});

/**
 * Build the cleaned model list in a single pass keyed by the ORIGINAL index of
 * `models`, so the parallel `argsText[]` (which is aligned to `models[]`) always
 * lines up with the right row. Incomplete rows are skipped. For gradio, the
 * per-row argsTemplate JSON is parsed; invalid/non-array JSON aborts with an error.
 */
export function buildCleanModels(
  models: ApiProviderModelDef[],
  argsText: string[],
  format: ApiProviderFormat,
): { models: ApiProviderModelDef[] } | { error: "args_invalid" } {
  const out: ApiProviderModelDef[] = [];
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    if (!(m.modelId.trim() && m.capabilities.length > 0)) continue; // skip incomplete rows
    const base: ApiProviderModelDef = {
      modelId: m.modelId.trim(),
      name: m.name.trim() || m.modelId.trim(),
      capabilities: m.capabilities,
      enabled: m.enabled !== false,
    };
    if (format === "openai" && m.endpointPath) base.endpointPath = m.endpointPath;
    if (format === "gradio") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(argsText[i] ?? "[]");
      } catch {
        return { error: "args_invalid" };
      }
      if (!Array.isArray(parsed)) return { error: "args_invalid" };
      base.gradio = { ...(m.gradio ?? emptyGradio()), argsTemplate: parsed };
    }
    out.push(base);
  }
  return { models: out };
}

export const ProviderForm: React.FC<ProviderFormProps> = ({ initial, onSubmit, onCancel }) => {
  const { language } = useSettingsStore();
  const t = translations[language];

  const [name, setName] = useState(initial?.name ?? "");
  const [apiUrl, setApiUrl] = useState(initial?.apiUrl ?? "");
  const [format, setFormat] = useState<ApiProviderFormat>(initial?.format ?? "openai");
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [models, setModels] = useState<ApiProviderModelDef[]>(
    initial?.models?.length
      ? initial.models
      : [{ modelId: "", name: "", capabilities: ["image"], enabled: true }],
  );
  // Raw JSON text per-model for the gradio argsTemplate textarea (parsed on submit).
  const [argsText, setArgsText] = useState<string[]>(() =>
    (initial?.models?.length ? initial.models : [null]).map((m) =>
      JSON.stringify(m?.gradio?.argsTemplate ?? []),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capLabel = (c: ApiProviderCapability) =>
    c === "image"
      ? t.cap_image
      : c === "edit"
        ? t.cap_edit
        : c === "text"
          ? t.cap_text
          : c === "video"
            ? t.cap_video
            : t.cap_upscale;

  const updateModel = (i: number, patch: Partial<ApiProviderModelDef>) =>
    setModels((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  const updateGradio = (i: number, patch: Partial<GradioModelConfig>) =>
    setModels((prev) =>
      prev.map((m, idx) =>
        idx === i ? { ...m, gradio: { ...(m.gradio ?? emptyGradio()), ...patch } } : m,
      ),
    );

  const updateArgsText = (i: number, value: string) =>
    setArgsText((prev) => prev.map((s, idx) => (idx === i ? value : s)));

  const toggleCap = (i: number, cap: ApiProviderCapability) =>
    setModels((prev) =>
      prev.map((m, idx) => {
        if (idx !== i) return m;
        const has = m.capabilities.includes(cap);
        return {
          ...m,
          capabilities: has ? m.capabilities.filter((c) => c !== cap) : [...m.capabilities, cap],
        };
      }),
    );

  const addModel = () => {
    setModels((p) => [...p, { modelId: "", name: "", capabilities: ["image"], enabled: true }]);
    setArgsText((p) => [...p, "[]"]);
  };

  const removeModel = (i: number) => {
    setModels((p) => p.filter((_, idx) => idx !== i));
    setArgsText((p) => p.filter((_, idx) => idx !== i));
  };

  const canSubmit =
    name.trim() &&
    (format === "gradio" || apiUrl.trim()) &&
    models.some((m) => m.modelId.trim() && m.capabilities.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setError(null);

    // Build cleaned models in a single pass keyed by the original index so each
    // row's gradio argsTemplate (parsed here) lines up with its argsText entry.
    const result = buildCleanModels(models, argsText, format);
    if ("error" in result) {
      setError(t.prov_gradio_args_invalid);
      return;
    }
    const cleanModels = result.models;

    setSubmitting(true);
    const input: CustomApiProviderInput = {
      name: name.trim(),
      apiUrl: apiUrl.trim(),
      format,
      models: cleanModels,
      enabled,
    };
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
                <button type="button" onClick={() => removeModel(i)}
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

            <label className="flex items-center gap-2 text-[11px] text-ink-secondary">
              <input type="checkbox" checked={m.enabled !== false} onChange={(e) => updateModel(i, { enabled: e.target.checked })} />
              {t.prov_model_enabled}
            </label>

            {format === "openai" && (
              <input className={inputCls} placeholder={t.prov_endpoint_path}
                value={m.endpointPath ?? ""}
                onChange={(e) => updateModel(i, { endpointPath: e.target.value || undefined })} />
            )}

            {format === "gradio" && (
              <div className="flex flex-col gap-2 border-t border-stroke pt-2">
                <input className={inputCls} placeholder={t.prov_gradio_base_url}
                  value={m.gradio?.baseUrl ?? ""}
                  onChange={(e) => updateGradio(i, { baseUrl: e.target.value })} />
                <div className="flex gap-2">
                  <input className={inputCls} type="number" placeholder={t.prov_gradio_fn_index}
                    value={m.gradio?.fnIndex ?? 0}
                    onChange={(e) => updateGradio(i, { fnIndex: Number(e.target.value) })} />
                  <input className={inputCls} type="number" placeholder={t.prov_gradio_trigger_id}
                    value={m.gradio?.triggerId ?? 0}
                    onChange={(e) => updateGradio(i, { triggerId: Number(e.target.value) })} />
                </div>
                <div className="flex gap-2">
                  <input className={inputCls} placeholder={t.prov_gradio_output_path}
                    value={m.gradio?.outputPath ?? ""}
                    onChange={(e) => updateGradio(i, { outputPath: e.target.value })} />
                  <input className={inputCls} placeholder={t.prov_gradio_seed_path}
                    value={m.gradio?.seedPath ?? ""}
                    onChange={(e) => updateGradio(i, { seedPath: e.target.value || undefined })} />
                </div>
                <div className="flex gap-2">
                  <input className={inputCls} type="number" placeholder={t.prov_gradio_steps_default}
                    value={m.gradio?.stepsDefault ?? ""}
                    onChange={(e) => updateGradio(i, { stepsDefault: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  <input className={inputCls} type="number" placeholder={t.prov_gradio_guidance_default}
                    value={m.gradio?.guidanceDefault ?? ""}
                    onChange={(e) => updateGradio(i, { guidanceDefault: e.target.value === "" ? undefined : Number(e.target.value) })} />
                </div>
                <textarea className={inputCls} rows={2} placeholder={t.prov_gradio_negative}
                  value={m.gradio?.negativePrompt ?? ""}
                  onChange={(e) => updateGradio(i, { negativePrompt: e.target.value || undefined })} />
                <label className="text-[11px] text-ink-secondary">{t.prov_gradio_args}</label>
                <textarea className={inputCls} rows={2}
                  placeholder={'["$prompt","$height","$width","$steps","$seed",false]'}
                  value={argsText[i] ?? "[]"}
                  onChange={(e) => updateArgsText(i, e.target.value)} />
              </div>
            )}
          </div>
        ))}
        <button type="button" onClick={addModel}
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
