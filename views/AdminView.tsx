import React, { useState, useEffect, useCallback } from "react";
import { X, Users, UserPlus, Loader2, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { AdminUser } from "../types";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";
import { translations } from "../translations";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  CreateUserInput,
  UpdateUserInput,
} from "../services/adminService";
import { CreateUserForm } from "../components/admin/CreateUserForm";
import { UserAccountActions } from "../components/admin/UserAccountActions";
import { ProvidersManager } from "../components/ProvidersManager";
import {
  listGlobalProviders,
  createGlobalProvider,
  adminUpdateProvider,
  adminDeleteProvider,
} from "../services/providerService";

interface AdminViewProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({ isOpen, onClose }) => {
  const { language } = useSettingsStore();
  const t = translations[language];
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    const list = await listUsers();
    setUsers(list);
    return list;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    refresh()
      .catch(() => toast.error(t.admin_action_failed))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleCreate = async (input: CreateUserInput) => {
    const user = await createUser(input);
    await refresh();
    setSelectedId(user.id);
    setShowCreate(false);
    toast.success(t.admin_user_created);
  };

  const handlePatch = async (id: number, patch: UpdateUserInput) => {
    try {
      await updateUser(id, patch);
      await refresh();
      toast.success(t.admin_user_updated);
    } catch {
      toast.error(t.admin_action_failed);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteUser(id);
      await refresh();
      if (selectedId === id) setSelectedId(null);
      toast.success(t.admin_user_deleted);
    } catch {
      toast.error(t.admin_action_failed);
    }
  };

  if (!isOpen) return null;

  const selectedUser = users.find((u) => u.id === selectedId) ?? null;

  return (
    <div className="fixed inset-0 z-[150] bg-gradient-brilliant flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-stroke bg-card backdrop-blur-md">
        <h2 className="text-lg font-bold text-ink flex items-center gap-2">
          <Users className="w-5 h-5 text-accent" />
          {t.admin_title}
        </h2>
        <button
          onClick={onClose}
          className="group p-2 rounded-lg text-ink-tertiary hover:text-ink hover:bg-fill transition-all"
        >
          <X className="w-5 h-5 transition-transform duration-500 ease-out group-hover:rotate-180" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* User list */}
        <div className="md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-stroke flex flex-col min-h-0">
          <div className="p-3">
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover text-on-accent text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              {t.admin_create_user}
            </button>
          </div>

          {showCreate && (
            <div className="px-3 pb-3">
              <CreateUserForm onCreate={handleCreate} onCancel={() => setShowCreate(false)} />
            </div>
          )}

          <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-ink-tertiary animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-ink-tertiary text-center py-8">{t.admin_no_users}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {users.map((u) => (
                  <li key={u.id}>
                    <button
                      onClick={() => setSelectedId(u.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        selectedId === u.id
                          ? "bg-accent-light text-accent"
                          : "text-ink-secondary hover:bg-fill"
                      }`}
                    >
                      {u.role === "admin" ? (
                        <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
                      ) : (
                        <UserIcon className="w-4 h-4 text-ink-tertiary shrink-0" />
                      )}
                      <span className="flex-1 min-w-0 truncate text-sm font-medium">
                        {u.displayName || u.username}
                      </span>
                      {!u.isActive && (
                        <span className="text-[10px] text-ink-tertiary shrink-0">{t.admin_inactive}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Detail */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 min-h-0">
          {!selectedUser ? (
            <div className="max-w-xl mx-auto flex flex-col gap-6">
              <p className="text-sm text-ink-tertiary">{t.admin_select_user}</p>
              <section className="pt-4 border-t border-stroke-subtle">
                <ProvidersManager
                  title={t.prov_global}
                  load={listGlobalProviders}
                  onCreate={createGlobalProvider}
                  onUpdate={adminUpdateProvider}
                  onDelete={adminDeleteProvider}
                />
              </section>
            </div>
          ) : (
            <div className="max-w-xl mx-auto flex flex-col gap-6">
              <div>
                <h3 className="text-xl font-bold text-ink">
                  {selectedUser.displayName || selectedUser.username}
                </h3>
                <p className="text-sm text-ink-tertiary">@{selectedUser.username}</p>
              </div>

              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-tertiary mb-3">
                  {t.admin_account}
                </h4>
                <UserAccountActions
                  key={selectedUser.id}
                  user={selectedUser}
                  isSelf={selectedUser.id === currentUserId}
                  onPatch={(patch) => handlePatch(selectedUser.id, patch)}
                  onDelete={() => handleDelete(selectedUser.id)}
                />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
