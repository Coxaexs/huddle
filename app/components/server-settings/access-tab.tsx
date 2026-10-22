"use client";

import { useEffect, useState } from "react";
import { Globe, Lock, Layers } from "lucide-react";
import type { PublicServer } from "@/lib/servers";
import { FEATURE_MODULES, FEATURE_MODULE_KEYS, normalizeDisabledModules, type FeatureModuleKey } from "@/lib/features";
import { apiFetch } from "../../lib/client";
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
  const [isPublic, setIsPublic] = useState<boolean>(Boolean(server.isPublic));
  const [webPublic, setWebPublic] = useState<boolean>(Boolean(server.webPublic));
  const [description, setDescription] = useState<string>(server.description || "");
  const [disabledModules, setDisabledModules] = useState<FeatureModuleKey[]>(() =>
    normalizeDisabledModules(server.disabledModules || []),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIsPublic(Boolean(server.isPublic));
    setWebPublic(Boolean(server.webPublic));
    setDescription(server.description || "");
    setDisabledModules(normalizeDisabledModules(server.disabledModules || []));
  }, [server]);

  if (tab !== "access" && tab !== "community") return null;

  const saveAccessSettings = async (
    nextPublic = isPublic,
    nextDescription = description,
    nextDisabled = disabledModules,
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
        }),
      });
      onServerUpdated();
      setNotice("Server access and feature modules updated.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not save access settings.");
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
      <h1 className="pane-title">Access, Community &amp; Feature Modules</h1>
      <p className="pane-subtitle">
        Control whether anyone on this Hoffle can discover and join {server.name}, and choose which feature modules are active here.
      </p>

      <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              {isPublic ? <Globe size={16} className="text-emerald-400" /> : <Lock size={16} className="text-amber-400" />}
              Public Server Directory
            </h3>
            <p className="text-xs opacity-75 mt-1">
              When enabled, {server.name} appears in the Public Servers directory so new users without an invite code can discover and join it after the tutorial.
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
              Readable on the web
            </h3>
            <p className="text-xs opacity-75 mt-1">
              Anyone can read this server's open channels at{" "}
              <a href={`https://hoffle.online/s/${encodeURIComponent((server.vanityCode || server.id).toLowerCase())}`} target="_blank" rel="noopener noreferrer" className="underline">
                hoffle.online/s/{(server.vanityCode || server.id).toLowerCase()}
              </a>
              , and search engines can list them. Private channels, 18+ channels and any channel with its own permissions stay hidden. Tell your members before you turn this on.
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
                setNotice(next ? "Open channels are now readable on the web." : "This server is no longer readable on the web.");
              } catch (err) {
                setWebPublic(!next);
                setNotice(err instanceof Error ? err.message : "Could not change that.");
              }
            }}
          />
        </div>

        <div>
          <label className="field-label block text-xs uppercase tracking-wider opacity-75 mb-1">
            Community Description (shown in Public Server Directory)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              className="discord-input flex-1"
              maxLength={240}
              value={description}
              disabled={!canManageServer}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this server about? (e.g. Cozy gaming nights, D&D campaigns, and music)"
            />
            <button
              type="button"
              className="discord-btn primary-indigo"
              disabled={!canManageServer || saving}
              onClick={() => void saveAccessSettings(isPublic, description, disabledModules)}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Layers size={16} className="text-indigo-400" />
            Server Feature Modules (&ldquo;Simple by default, deep when you want it&rdquo;)
          </h3>
          <p className="text-xs opacity-75 mt-1">
            Switch off optional modules your community doesn&apos;t use to keep slash commands and toolbars clean for everyone in {server.name}.
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
