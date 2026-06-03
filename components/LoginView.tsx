import React, { useState } from "react";
import { LogIn, Loader2 } from "lucide-react";
import { Logo } from "./Icons";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";
import { translations } from "../translations";

/**
 * Full-screen login gate. Replaces the old shared-password AuthModal: every
 * user must authenticate with their own account before the app renders.
 */
export const LoginView: React.FC = () => {
  const { language } = useSettingsStore();
  const t = translations[language];
  const login = useAuthStore((s) => s.login);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError(
        code === "invalid_credentials"
          ? t.login_error_invalid
          : t.login_error_generic,
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-gradient-brilliant">
      <div className="w-full max-w-sm bg-surface border border-stroke rounded-xl p-7 shadow-dialog flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-300">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="size-12" />
          <div>
            <h1 className="text-xl font-bold text-ink">{t.login_title}</h1>
            <p className="text-ink-secondary text-sm mt-1">{t.login_subtitle}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-secondary">
              {t.login_username}
            </span>
            <input
              type="text"
              value={username}
              autoFocus
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t.login_username_placeholder}
              className="w-full px-4 py-2.5 fluent-field rounded-md text-ink focus:outline-none transition-colors placeholder:text-ink-placeholder"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-secondary">
              {t.login_password}
            </span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.login_password_placeholder}
              className="w-full px-4 py-2.5 fluent-field rounded-md text-ink focus:outline-none transition-colors placeholder:text-ink-placeholder"
            />
          </label>

          {error && (
            <p className="text-red-600 text-xs font-medium text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3 bg-accent hover:bg-accent-hover text-on-accent font-bold rounded-md shadow-card transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t.login_signing_in}
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                {t.login_submit}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
