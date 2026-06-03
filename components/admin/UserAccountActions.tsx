import React, { useState } from "react";
import { Loader2, Trash2, ShieldCheck, ShieldOff, KeyRound, Save } from "lucide-react";
import { AdminUser, UserRole } from "../../types";
import { useSettingsStore } from "../../store/settingsStore";
import { translations } from "../../translations";
import { UpdateUserInput } from "../../services/adminService";

interface UserAccountActionsProps {
  user: AdminUser;
  isSelf: boolean;
  onPatch: (patch: UpdateUserInput) => Promise<void>;
  onDelete: () => Promise<void>;
}

// Remounted per user via a `key` prop, so local fields initialize straight from
// the selected user — no sync-from-prop effect needed.
export const UserAccountActions: React.FC<UserAccountActionsProps> = ({
  user,
  isSelf,
  onPatch,
  onDelete,
}) => {
  const { language } = useSettingsStore();
  const t = translations[language];

  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "flex-1 px-3 py-2 fluent-field rounded-md text-ink text-sm focus:outline-none transition-colors";
  const btnCls =
    "px-3 py-2 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0";

  const otherRole: UserRole = user.role === "admin" ? "user" : "admin";

  return (
    <div className="flex flex-col gap-4">
      {/* Status + role */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-xs font-medium px-2 py-1 rounded ${
            user.isActive ? "bg-green-500/15 text-green-300" : "bg-fill text-ink-tertiary"
          }`}
        >
          {user.isActive ? t.admin_active : t.admin_inactive}
        </span>

        {!isSelf && (
          <>
            <button
              disabled={busy}
              onClick={() => run(() => onPatch({ isActive: !user.isActive }))}
              className={`${btnCls} ${
                user.isActive
                  ? "border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                  : "border-green-500/30 text-green-300 hover:bg-green-500/10"
              }`}
            >
              {user.isActive ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              {user.isActive ? t.admin_deactivate : t.admin_activate}
            </button>

            <button
              disabled={busy}
              onClick={() => run(() => onPatch({ role: otherRole }))}
              className={`${btnCls} border-stroke text-ink-secondary hover:bg-fill`}
            >
              {otherRole === "admin" ? t.account_role_admin : t.account_role_user}
            </button>
          </>
        )}
        {isSelf && <span className="text-xs text-ink-tertiary">({t.admin_you})</span>}
      </div>

      {/* Display name */}
      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder={t.admin_display_name}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <button
          disabled={busy}
          onClick={() => run(() => onPatch({ displayName: displayName.trim() || null }))}
          className={`${btnCls} border-stroke text-ink-secondary hover:bg-fill`}
        >
          <Save className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Reset password */}
      <div className="flex gap-2">
        <input
          className={inputCls}
          type="password"
          placeholder={t.admin_new_password}
          value={newPassword}
          autoComplete="new-password"
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <button
          disabled={busy || newPassword.length === 0}
          onClick={() => run(async () => { await onPatch({ password: newPassword }); setNewPassword(""); })}
          className={`${btnCls} border-stroke text-ink-secondary hover:bg-fill`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          {t.admin_reset_password}
        </button>
      </div>

      {/* Delete */}
      {!isSelf && (
        <div className="pt-2 border-t border-stroke-subtle">
          {!confirmDelete ? (
            <button
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className={`${btnCls} border-red-500/20 text-red-400 hover:bg-red-500/10`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t.admin_delete_user}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-200 flex-1">{t.admin_delete_confirm}</span>
              <button
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
                className={`${btnCls} border-stroke text-ink-secondary`}
              >
                {t.cancel}
              </button>
              <button
                disabled={busy}
                onClick={() => run(onDelete)}
                className={`${btnCls} bg-red-600 border-red-600 text-white hover:bg-red-500`}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {t.confirm}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
