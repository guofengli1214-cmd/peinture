import React from "react";
import { Layers, Film, Plus, Brain } from "lucide-react";
import { Select, OptionGroup } from "../Select";
import { useSettingsStore } from "../../store/settingsStore";
import { translations } from "../../translations";
import { CustomProvider } from "../../types";

interface ModelsTabProps {
  customProviders: CustomProvider[];
  editModelValue: string;
  setEditModelValue: (v: string) => void;
  liveModelValue: string;
  setLiveModelValue: (v: string) => void;
  upscalerModelValue: string;
  setUpscalerModelValue: (v: string) => void;
  textModelValue: string;
  setTextModelValue: (v: string) => void;
}

export const ModelsTab: React.FC<ModelsTabProps> = (props) => {
  const { language } = useSettingsStore();
  const t = translations[language];

  // serviceMode is permanently "server": model options come only from the
  // (admin-assigned) custom providers, grouped by capability.
  const getAvailableModelGroups = (
    type: "generate" | "edit" | "video" | "text" | "upscaler",
  ): OptionGroup[] => {
    const groups: OptionGroup[] = [];

    props.customProviders.forEach((cp) => {
      const models = cp.models[type];
      if (!models || models.length === 0) return;

      if (cp.id === "server") {
        const byProvider = new Map<string, typeof models>();
        models.forEach((m) => {
          const label = m.providerName || cp.name;
          byProvider.set(label, [...(byProvider.get(label) ?? []), m]);
        });
        byProvider.forEach((providerModels, label) => {
          groups.push({
            label,
            options: providerModels.map((m) => ({
              label: m.name,
              value: `${cp.id}:${m.id}`,
            })),
          });
        });
      } else {
        groups.push({
          label: cp.name,
          options: models.map((m) => ({
            label: m.name,
            value: `${cp.id}:${m.id}`,
          })),
        });
      }
    });

    return groups;
  };

  return (
    <div className="space-y-6">
      <Select
        label={t.model_edit}
        value={props.editModelValue}
        onChange={props.setEditModelValue}
        options={getAvailableModelGroups("edit")}
        icon={<Layers className="w-4 h-4" />}
        dense
      />
      <Select
        label={t.model_live}
        value={props.liveModelValue}
        onChange={props.setLiveModelValue}
        options={getAvailableModelGroups("video")}
        icon={<Film className="w-4 h-4" />}
        dense
      />
      <Select
        label={t.upscale}
        value={props.upscalerModelValue}
        onChange={props.setUpscalerModelValue}
        options={getAvailableModelGroups("upscaler")}
        icon={<Plus className="w-4 h-4" />}
        dense
      />
      <Select
        label={t.model_text}
        value={props.textModelValue}
        onChange={props.setTextModelValue}
        options={getAvailableModelGroups("text")}
        icon={<Brain className="w-4 h-4" />}
        dense
      />
    </div>
  );
};
