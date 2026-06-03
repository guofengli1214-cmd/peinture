import React, { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Pencil, Trash2, Server } from "lucide-react";
import { toast } from "sonner";
import { CustomApiProvider, CustomApiProviderInput } from "../types";
import { useSettingsStore } from "../store/settingsStore";
import { translations } from "../translations";
import { ProviderForm } from "./ProviderForm";

interface ProvidersManagerProps {
  title: string;
  load: () => Promise<CustomApiProvider[]>;
  onCreate: (input: CustomApiProviderInput) => Promise<unknown>;
  onUpdate: (id: string, patch: Partial<CustomApiProviderInput>) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

/** List + create/edit/delete for custom providers. Reused for self, global, and per-user. */
export const ProvidersManager: React.FC<ProvidersManagerProps> = ({ title, load, onCreate, onUpdate, onDelete }) => {
  const { language } = useSettingsStore();
  const t = translations[language];

  const [items, setItems] = useState<CustomApiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    return load()
      .then(setItems)
      .catch(() => toast.error(t.admin_action_failed))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // Load once on mount. Parents pass a `key` to remount when the source changes
  // (self vs global vs a specific user), avoiding an unstable-callback loop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (input: CustomApiProviderInput) => {
    await onCreate(input);
    setAdding(false);
    toast.success(t.admin_config_saved);
    await refresh();
  };
  const handleUpdate = async (id: string, patch: Partial<CustomApiProviderInput>) => {
    await onUpdate(id, patch);
    setEditingId(null);
    toast.success(t.admin_config_saved);
    await refresh();
  };
  const handleDelete = async (id: string) => {
    try {
      await onDelete(id);
      toast.success(t.admin_user_deleted);
      await refresh();
    } catch {
      toast.error(t.admin_action_failed);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wide text-ink-tertiary flex items-center gap-2">
          <Server className="w-3.5 h-3.5" />
          {title}
        </h4>
        {!adding && (
          <button onClick={() => { setAdding(true); setEditingId(null); }}
            className="text-xs text-accent hover:text-accent-hover flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />{t.prov_add}
          </button>
        )}
      </div>

      {adding && <ProviderForm onSubmit={handleCreate} onCancel={() => setAdding(false)} />}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 text-ink-tertiary animate-spin" /></div>
      ) : items.length === 0 && !adding ? (
        <p className="text-xs text-ink-tertiary">{t.prov_none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((p) => (
            <li key={p.id} className="border border-stroke rounded-lg">
              {editingId === p.id ? (
                <ProviderForm initial={p} onSubmit={(input) => handleUpdate(p.id, input)} onCancel={() => setEditingId(null)} />
              ) : (
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink truncate">{p.name}</span>
                      <span className="text-[10px] uppercase text-ink-tertiary border border-stroke rounded px-1">{p.format}</span>
                      {p.scope === "global" && <span className="text-[10px] text-blue-300 bg-blue-500/15 rounded px-1">{t.prov_global_badge}</span>}
                      {!p.enabled && <span className="text-[10px] text-ink-tertiary">off</span>}
                    </div>
                    <div className="text-[11px] text-ink-tertiary truncate">{p.apiUrl} · {p.models.length} model(s){p.hasSecret ? " · 🔑" : ""}</div>
                  </div>
                  {p.editable ? (
                    <>
                      <button onClick={() => { setEditingId(p.id); setAdding(false); }} className="p-1.5 text-ink-secondary hover:text-ink"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <span className="text-[10px] text-ink-tertiary">{t.prov_managed_admin}</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
