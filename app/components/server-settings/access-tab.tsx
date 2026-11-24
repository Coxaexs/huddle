"use client";

import { useEffect, useState } from "react";
import { Globe, Lock, Layers } from "lucide-react";
import type { PublicServer } from "@/lib/servers";
import { DISCOVER_CATEGORIES, isDiscoverCategory, type DiscoverCategory } from "@/lib/server-templates";
import { FEATURE_MODULES, FEATURE_MODULE_KEYS, normalizeDisabledModules, type FeatureModuleKey } from "@/lib/features";
import { apiFetch } from "../../lib/client";
import { useI18n } from "../../lib/i18n-context";
import type { Tab } from "./types";

export function ServerAccessTab({
  tab,
  server,
  canManageServer,
  onServerUpdated,
  setNotice,
}: {
  tab: Tab;
  server: PublicServer;
  canManageServer: boolean;
  onServerUpdated: () => void;
  setNotice: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [isPublic, setIsPublic] = useState<boolean>(Boolean(server.isPublic));
  const [webPublic, setWebPublic] = useState<boolean>(Boolean(server.webPublic));
  const [description, setDescription] = useState<string>(server.description || "");
  const [discoverCategory, setDiscoverCategory] = useState<DiscoverCategory>(
    isDiscoverCategory(server.discoverCategory) ? server.discoverCategory : "community",
  );
  const [disabledModules, setDisabledModules] = useState<FeatureModuleKey[]>(() =>
    normalizeDisabledModules(server.disabledModules || []),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIsPublic(Boolean(server.isPublic));
    setWebPublic(Boolean(server.webPublic));
    setDescription(server.description || "");
    setDiscoverCategory(
      isDiscoverCategory(server.discoverCategory) ? server.discoverCategory : "community",
    );
    setDisabledModules(normalizeDisabledModules(server.disabledModules || []));
  }, [server]);

  if (tab !== "access" && tab !== "community") return null;

  const saveAccessSettings = async (
    nextPublic = isPublic,
    nextDescription = description,
    nextDisabled = disabledModules,
    nextCategory = discoverCategory,
  ) => {
    if (!canManageServer) return;
    setSaving(true);
    try {
      await apiFetch(`/api/servers/${server.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          isPublic: nextPublic,
          description: nextDescription,
          disabledModules: nextDisabled,
          discoverCategory: nextCategory,
        }),
      });
      onServerUpdated();
      setNotice(t("serverSettings.access.updated"));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t("serverSettings.access.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const toggleModule = (modKey: FeatureModuleKey, enabled: boolean) => {
    const next = enabled
      ? disabledModules.filter((k) => k !== modKey)
      : Array.from(new Set([...disabledModules, modKey]));
    setDisabledModules(next);
    void saveAccessSettings(isPublic, description, next);
  };

  return (
    <div className="tab-pane">
      <h1 className="pane-title">{t("serverSettings.access.title")}</h1>
      <p className="pane-subtitle">
        {t("serverSettings.access.subtitle", { server: server.name })}
      </p>

      <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              {isPublic ? <Globe size={16} className="text-emerald-400" /> : <Lock size={16} className="text-amber-400" />}
              {t("serverSettings.access.publicTitle")}
            </h3>
            <p className="text-xs opacity-75 mt-1">
              {t("serverSettings.access.publicDesc", { server: server.name })}
            </p>
          </div>
          <input
            type="checkbox"
            checked={isPublic}
            disabled={!canManageServer || saving}
            onChange={(e) => {
              const next = e.target.checked;
              setIsPublic(next);
              void saveAccessSettings(next, description, disabledModules);
            }}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Globe size={16} className={webPublic ? "text-sky-400" : "opacity-60"} />
              {t("serverSettings.access.webTitle")}
            </h3>
            <p className="text-xs opacity-75 mt-1">
              {t("serverSettings.access.webDescBefore")}
              <a href={`https://hoffle.online/s/${encodeURIComponent((server.vanityCode || server.id).toLowerCase())}`} target="_blank" rel="noopener noreferrer" className="underline">
                hoffle.online/s/{(server.vanityCode || server.id).toLowerCase()}
              </a>
              {t("serverSettings.access.webDescAfter")}
            </p>
          </div>
          <input
            type="checkbox"
            checked={webPublic}
            disabled={!canManageServer || saving}
            onChange={async (e) => {
              const next = e.target.checked;
              setWebPublic(next);
              try {
                await apiFetch(`/api/servers/${server.id}`, { method: "PATCH", body: JSON.stringify({ webPublic: next }) });
                onServerUpdated();
                setNotice(next ? t("serverSettings.access.webOnNotice") : t("serverSettings.access.webOffNotice"));
              } catch (err) {
                setWebPublic(!next);
                setNotice(err instanceof Error ? err.message : t("serverSettings.access.webError"));
              }
            }}
          />
        </div>

        <div>
          <label className="field-label block text-xs uppercase tracking-wider opacity-75 mb-1">
            {t("discover.category.label")}
          </label>
          <select
            className="discord-input w-full mb-3"
            value={discoverCategory}
            disabled={!canManageServer || saving}
            onChange={(e) => {
              const next = isDiscoverCategory(e.target.value) ? e.target.value : "community";
              setDiscoverCategory(next);
              void saveAccessSettings(isPublic, description, disabledModules, next);
            }}
          >
            {DISCOVER_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {t(cat === "other" ? "discover.category.misc" : (`discover.category.${cat}` as const))}
              </option>
            ))}
          </select>
          <label className="field-label block text-xs uppercase tracking-wider opacity-75 mb-1">
            {t("serverSettings.access.descLabel")}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              className="discord-input flex-1"
              maxLength={240}
              value={description}
              disabled={!canManageServer}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("serverSettings.access.descPlaceholder")}
            />
            <button
              type="button"
              className="discord-btn primary-indigo"
              disabled={!canManageServer || saving}
              onClick={() => void saveAccessSettings(isPublic, description, disabledModules)}
            >
              {saving ? t("serverSettings.access.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Layers size={16} className="text-indigo-400" />
            {t("serverSettings.access.modulesTitle")}
          </h3>
          <p className="text-xs opacity-75 mt-1">
            {t("serverSettings.access.modulesDesc", { server: server.name })}
          </p>
        </div>

        <div className="space-y-2 pt-2">
          {FEATURE_MODULE_KEYS.map((modKey) => {
            const mod = FEATURE_MODULES[modKey];
            const enabled = !disabledModules.includes(modKey);
            return (
              <label key={modKey} className="appearance-switch flex items-center justify-between py-2 border-b border-white/5 last:border-b-0">
                <span>
                  <strong className="block text-sm">{mod.label}</strong>
                  <small className="text-xs opacity-70">{mod.description}</small>
                </span>
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={!canManageServer || saving}
                  onChange={(e) => toggleModule(modKey, e.target.checked)}
                />
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
