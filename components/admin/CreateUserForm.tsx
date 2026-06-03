import React, { useState } from "react";
import { UserPlus, Loader2, X } from "lucide-react";
import { UserRole } from "../../types";
import { useSettingsStore } from "../../store/settingsStore";
import { translations } from "../../translations";
import { CreateUserInput } from "../../services/adminService";

interface CreateUserFormProps {
  onCreate: (input: CreateUserInput) => Promise<void>;
  onCancel: () => void;
}

export const CreateUserForm: React.FC<CreateUserFormProps> = ({ onCreate, onCancel }) => {
  const { language } = useSettingsStore();
  const t = translations[language];

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({
        username: username.trim(),
        password,
        role,
        displayName: displayName.trim() || null,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError(code === "username_taken" ? t.err_username_taken : t.admin_action_failed);
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 fluent-field rounded-md text-ink text-sm focus:outline-none transition-colors";

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-fill-subtle border border-stroke rounded-xl p-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-accent" />
          {t.admin_create_user}
        </h3>
        <button type="button" onClick={onCancel} className="text-ink-tertiary hover:text-ink">
          <X className="w-4 h-4" />
        </button>
      </div>

      <input
        className={inputCls}
        placeholder={t.admin_username}
        value={username}
        autoComplete="off"
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        className={inputCls}
        type="password"
        placeholder={t.admin_password}
        value={password}
        autoComplete="new-password"
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        className={inputCls}
        placeholder={`${t.admin_display_name} (${t.admin_optional})`}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      <div className="flex gap-2">
        {(["user", "admin"] as UserRole[]).map((r) => (
          <button
            type="button"
            key={r}
            onClick={() => setRole(r)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
              role === r
                ? "bg-accent border-accent text-on-accent"
                : "bg-fill-subtle border-stroke text-ink-secondary hover:text-ink"
            }`}
          >
            {r === "admin" ? t.account_role_admin : t.account_role_user}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full py-2.5 bg-accent hover:bg-accent-hover text-on-accent text-sm font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
        {submitting ? t.admin_creating : t.admin_create}
      </button>
    </form>
  );
};
