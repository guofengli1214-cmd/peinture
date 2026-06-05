import React, { useEffect, useState } from "react";
import { Eye, EyeOff, HardDrive, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useSettingsStore } from "../../store/settingsStore";
import { translations } from "../../translations";
import { AdminSystemStorage, S3Config, StorageType, WebDAVConfig } from "../../types";
import { getSystemStorage, updateSystemStorage } from "../../services/adminService";
import { DEFAULT_S3_CONFIG, DEFAULT_WEBDAV_CONFIG } from "../../services/storageService";

const managedTypes: Array<{ id: StorageType; labelKey: "storage_s3" | "storage_webdav" | "storage_opfs" | "storage_off" }> = [
  { id: "s3", labelKey: "storage_s3" },
  { id: "webdav", labelKey: "storage_webdav" },
  { id: "opfs", labelKey: "storage_opfs" },
  { id: "off", labelKey: "storage_off" },
];

export const AdminStorageSettings: React.FC = () => {
  const { language } = useSettingsStore();
  const t = translations[language];
  const [storage, setStorage] = useState<AdminSystemStorage | null>(null);
  const [storageType, setStorageType] = useState<StorageType>("opfs");
  const [s3Config, setS3Config] = useState<S3Config>(DEFAULT_S3_CONFIG);
  const [webdavConfig, setWebdavConfig] = useState<WebDAVConfig>(DEFAULT_WEBDAV_CONFIG);
  const [showS3Secret, setShowS3Secret] = useState(false);
  const [showWebdavPassword, setShowWebdavPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSystemStorage()
      .then((next) => {
        if (cancelled) return;
        setStorage(next);
        setStorageType(next.storageType);
        setS3Config({ ...DEFAULT_S3_CONFIG, ...next.s3Config });
        setWebdavConfig({ ...DEFAULT_WEBDAV_CONFIG, ...next.webdavConfig });
      })
      .catch(() => toast.error(t.admin_action_failed))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t.admin_action_failed]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const s3Patch: Partial<S3Config> = { ...s3Config };
      if (!s3Patch.secretAccessKey && storage?.hasS3Secret) {
        delete s3Patch.secretAccessKey;
      }

      const webdavPatch: Partial<WebDAVConfig> = { ...webdavConfig };
      if (!webdavPatch.password && storage?.hasWebDAVPassword) {
        delete webdavPatch.password;
      }

      const next = await updateSystemStorage({
        storageType,
        s3Config: s3Patch,
        webdavConfig: webdavPatch,
      });
      setStorage(next);
      setS3Config({ ...DEFAULT_S3_CONFIG, ...next.s3Config });
      setWebdavConfig({ ...DEFAULT_WEBDAV_CONFIG, ...next.webdavConfig });
      toast.success(t.admin_storage_saved);
    } catch {
      toast.error(t.admin_action_failed);
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-ink-tertiary">
            {t.admin_storage_title}
          </h4>
          <p className="text-xs text-ink-tertiary mt-1">{t.admin_storage_desc}</p>
        </div>
        <HardDrive className="w-5 h-5 text-accent shrink-0" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {managedTypes.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setStorageType(option.id)}
            className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-colors ${
              storageType === option.id
                ? "bg-accent border-accent text-on-accent"
                : "bg-fill-subtle border-stroke text-ink-secondary hover:bg-fill hover:text-ink"
            }`}
          >
            {t[option.labelKey]}
          </button>
        ))}
      </div>

      {storageType === "s3" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={t.s3_access_key}>
              <input
                value={s3Config.accessKeyId}
                onChange={(e) => setS3Config({ ...s3Config, accessKeyId: e.target.value })}
                className="w-full px-3 py-2 fluent-field rounded-md text-sm font-mono"
              />
            </Field>
            <Field label={t.s3_secret_key}>
              <div className="relative">
                <input
                  type={showS3Secret ? "text" : "password"}
                  value={s3Config.secretAccessKey}
                  onChange={(e) =>
                    setS3Config({ ...s3Config, secretAccessKey: e.target.value })
                  }
                  placeholder={storage?.hasS3Secret ? t.admin_secret_unchanged : ""}
                  className="w-full px-3 py-2 pr-8 fluent-field rounded-md text-sm font-mono"
                />
                <SecretButton
                  show={showS3Secret}
                  onClick={() => setShowS3Secret((v) => !v)}
                />
              </div>
            </Field>
            <Field label={t.s3_bucket}>
              <input
                value={s3Config.bucket || ""}
                onChange={(e) => setS3Config({ ...s3Config, bucket: e.target.value })}
                className="w-full px-3 py-2 fluent-field rounded-md text-sm"
              />
            </Field>
            <Field label={t.s3_region}>
              <input
                value={s3Config.region || ""}
                onChange={(e) => setS3Config({ ...s3Config, region: e.target.value })}
                className="w-full px-3 py-2 fluent-field rounded-md text-sm"
              />
            </Field>
          </div>
          <Field label={t.s3_endpoint}>
            <input
              value={s3Config.endpoint || ""}
              onChange={(e) => setS3Config({ ...s3Config, endpoint: e.target.value })}
              placeholder={t.s3_endpoint_placeholder}
              className="w-full px-3 py-2 fluent-field rounded-md text-sm font-mono"
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={t.s3_domain}>
              <input
                value={s3Config.publicDomain || ""}
                onChange={(e) => setS3Config({ ...s3Config, publicDomain: e.target.value })}
                placeholder={t.s3_domain_placeholder}
                className="w-full px-3 py-2 fluent-field rounded-md text-sm font-mono"
              />
            </Field>
            <Field label={t.s3_prefix}>
              <input
                value={s3Config.prefix || ""}
                onChange={(e) => setS3Config({ ...s3Config, prefix: e.target.value })}
                placeholder={t.s3_prefix_placeholder}
                className="w-full px-3 py-2 fluent-field rounded-md text-sm font-mono"
              />
            </Field>
          </div>
        </div>
      )}

      {storageType === "webdav" && (
        <div className="space-y-3">
          <Field label={t.webdav_url}>
            <input
              value={webdavConfig.url}
              onChange={(e) => setWebdavConfig({ ...webdavConfig, url: e.target.value })}
              placeholder={t.webdav_url_placeholder}
              className="w-full px-3 py-2 fluent-field rounded-md text-sm font-mono"
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={t.webdav_username}>
              <input
                value={webdavConfig.username}
                onChange={(e) =>
                  setWebdavConfig({ ...webdavConfig, username: e.target.value })
                }
                className="w-full px-3 py-2 fluent-field rounded-md text-sm font-mono"
              />
            </Field>
            <Field label={t.webdav_password}>
              <div className="relative">
                <input
                  type={showWebdavPassword ? "text" : "password"}
                  value={webdavConfig.password}
                  onChange={(e) =>
                    setWebdavConfig({ ...webdavConfig, password: e.target.value })
                  }
                  placeholder={storage?.hasWebDAVPassword ? t.admin_secret_unchanged : ""}
                  className="w-full px-3 py-2 pr-8 fluent-field rounded-md text-sm font-mono"
                />
                <SecretButton
                  show={showWebdavPassword}
                  onClick={() => setShowWebdavPassword((v) => !v)}
                />
              </div>
            </Field>
          </div>
          <Field label={t.webdav_directory}>
            <input
              value={webdavConfig.directory}
              onChange={(e) =>
                setWebdavConfig({ ...webdavConfig, directory: e.target.value })
              }
              className="w-full px-3 py-2 fluent-field rounded-md text-sm"
            />
          </Field>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-stroke-subtle">
        <span
          className={`text-xs ${
            storage?.storageConfigured ? "text-green-500" : "text-ink-tertiary"
          }`}
        >
          {storage?.storageConfigured ? t.configured : t.storage_not_configured}
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.save}
        </button>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1">
    <span className="text-xs font-medium text-ink-secondary">{label}</span>
    {children}
  </label>
);

const SecretButton: React.FC<{ show: boolean; onClick: () => void }> = ({ show, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink"
  >
    {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
  </button>
);
