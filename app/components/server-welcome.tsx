"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { apiFetch } from "../lib/client";
import { useI18n } from "../lib/i18n-context";
import { pickableRoles, type RolePick } from "@/lib/role-picker";
import type { PublicRole, PublicServer } from "@/lib/servers";
import type { WelcomeConfig, WelcomeField, WelcomeFieldType } from "@/lib/welcome";
import { RolePickerEditor, RolePickList } from "./role-picker";

interface WelcomeResponse {
  userId: string;
  displayName: string | null;
  username: string | null;
  answers: Record<string, string>;
  acceptedAt: string;
}

const TYPE_LABELS: Record<WelcomeFieldType, string> = {
  text: "Short answer",
  long: "Paragraph",
  date: "Date",
};

/** Server Settings → Welcome Screen: rules, an optional intro form and a role picker for newcomers. */
export function WelcomeTab({
  server,
  onNotice,
}: {
  server: PublicServer;
  onNotice: (text: string) => void;
}) {
  const { t } = useI18n();
  const serverId = server.id;
  const [config, setConfig] = useState<WelcomeConfig>({ enabled: false, rules: "", fields: [] });
  const [picks, setPicks] = useState<RolePick[]>(() =>
    pickableRoles(server.roles).map((role) => ({
      roleId: role.id,
      emoji: role.pick.emoji,
      note: role.pick.note,
    })),
  );
  const [responses, setResponses] = useState<WelcomeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<{ welcome: WelcomeConfig; responses?: WelcomeResponse[] }>(
      `/api/servers/${encodeURIComponent(serverId)}/welcome`,
    )
      .then((res) => {
        setConfig(res.welcome);
        setResponses(res.responses || []);
      })
      .catch(() => onNotice(t("welcome.loadFailed")))
      .finally(() => setLoading(false));
  }, [serverId, onNotice]);

  useEffect(load, [load]);

  function updateField(index: number, patch: Partial<WelcomeField>) {
    setConfig((current) => ({
      ...current,
      fields: current.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    }));
  }

  function addField(label = "", type: WelcomeFieldType = "text") {
    setConfig((current) => ({
      ...current,
      fields: [
        ...current.fields,
        { id: `f${Date.now().toString(36)}`, label, type, required: false },
      ].slice(0, 10),
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await apiFetch<{ welcome: WelcomeConfig }>(
        `/api/servers/${encodeURIComponent(serverId)}/welcome`,
        { method: "PUT", body: JSON.stringify(config) },
      );
      setConfig(res.welcome);
      await apiFetch(`/api/servers/${encodeURIComponent(serverId)}/role-picker`, {
        method: "PUT",
        body: JSON.stringify({ picks }),
      });
      onNotice(t("welcome.saved"));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : t("welcome.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="loading-state">{t("welcome.loading")}</p>;

  return (
    <div className="tab-pane">
      <div>
        <h1 className="pane-title">{t("serverSettings.tab.welcome")}</h1>
        <p className="pane-subtitle">{t("welcome.subtitle")}</p>
      </div>

      <label className="welcome-toggle">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
        />
        {t("welcome.enable")}
      </label>

      <div className="form-field">
        <label>{t("welcome.rules")}</label>
        <p className="field-hint">{t("welcome.rulesHint")}</p>
        <textarea
          className="discord-text-input welcome-rules-input"
          rows={7}
          maxLength={4000}
          value={config.rules}
          placeholder={t("welcome.rulesPlaceholder")}
          onChange={(e) => setConfig({ ...config, rules: e.target.value })}
        />
      </div>

      <div className="form-field">
        <label>{t("welcome.introForm")}</label>
        <p className="field-hint">{t("welcome.introFormHint")}</p>
        {config.fields.map((field, index) => (
          <div key={field.id} className="welcome-field-row">
            <input
              type="text"
              className="discord-text-input"
              placeholder={t("welcome.questionPlaceholder")}
              maxLength={80}
              value={field.label}
              onChange={(e) => updateField(index, { label: e.target.value })}
            />
            <select
              className="discord-text-input"
              value={field.type}
              onChange={(e) => updateField(index, { type: e.target.value as WelcomeFieldType })}
            >
              {(Object.keys(TYPE_LABELS) as WelcomeFieldType[]).map((type) => (
                <option key={type} value={type}>
                  {t(`welcome.type.${type}` as "welcome.type.text")}
                </option>
              ))}
            </select>
            <label className="welcome-required">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => updateField(index, { required: e.target.checked })}
              />
              {t("welcome.required")}
            </label>
            <button
              type="button"
              className="icon-action-btn"
              aria-label={t("welcome.removeQuestion")}
              onClick={() =>
                setConfig({ ...config, fields: config.fields.filter((_, i) => i !== index) })
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {config.fields.length < 10 && (
          <div className="button-group">
            <button type="button" className="discord-btn secondary-gray" onClick={() => addField()}>
              <Plus size={14} /> {t("welcome.addQuestion")}
            </button>
            {config.fields.length === 0 && (
              <button
                type="button"
                className="discord-btn secondary-gray"
                onClick={() => {
                  addField(t("welcome.presetName"));
                  addField(t("welcome.presetBirthdate"), "date");
                  addField(t("welcome.presetAbout"), "long");
                }}
              >
                {t("welcome.preset")}
              </button>
            )}
          </div>
        )}
      </div>

      <RolePickerEditor
        server={server}
        picks={picks}
        onChange={setPicks}
        welcomeOn={config.enabled}
        onNotice={onNotice}
      />

      <div className="button-group">
        <button type="button" className="discord-btn primary-indigo" disabled={saving} onClick={save}>
          {saving ? t("serverRoles.saving") : t("serverOverview.save")}
        </button>
      </div>

      {responses.length > 0 && (
        <div className="form-field">
          <label>{t("welcome.answers", { count: responses.length })}</label>
          <div className="welcome-responses">
            {responses.map((response) => (
              <div key={response.userId} className="welcome-response">
                <div className="welcome-response-head">
                  <strong>{response.displayName || response.username || "Deleted user"}</strong>
                  {response.username && <span>@{response.username}</span>}
                  <span>{new Date(response.acceptedAt).toLocaleString()}</span>
                </div>
                {config.fields
                  .filter((field) => response.answers[field.id])
                  .map((field) => (
                    <div key={field.id} className="welcome-response-answer">
                      <span>{field.label}</span>
                      <p>{response.answers[field.id]}</p>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Shown to a newcomer the first time they open a server with a welcome screen. */
export function WelcomeGate({
  serverId,
  serverName,
  roles = [],
  onDone,
  onLeave,
}: {
  serverId: string;
  serverName: string;
  /** The server's roles; the ones on offer are shown to pick from. */
  roles?: PublicRole[];
  onDone: () => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  const [config, setConfig] = useState<WelcomeConfig | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ welcome: WelcomeConfig; pending: boolean }>(
      `/api/servers/${encodeURIComponent(serverId)}/welcome`,
    )
      .then((res) => {
        if (cancelled) return;
        if (res.pending) setConfig(res.welcome);
        else onDone();
      })
      .catch(() => {
        if (!cancelled) onDone();
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, onDone]);

  if (!config) return null;

  async function accept() {
    setSending(true);
    setError("");
    try {
      await apiFetch(`/api/servers/${encodeURIComponent(serverId)}/welcome`, {
        method: "POST",
        body: JSON.stringify({ answers, roles: [...picked] }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("welcome.gateFailed"));
    } finally {
      setSending(false);
    }
  }

  const missing = config.fields.some((field) => field.required && !answers[field.id]?.trim());
  const offered = pickableRoles(roles);

  return (
    <div className="poll-dialog-backdrop welcome-gate-backdrop">
      <div className="poll-dialog-card welcome-gate" role="dialog" aria-modal="true" aria-label={`Welcome to ${serverName}`}>
        <h2>{t("welcome.gateTitle", { server: serverName })}</h2>
        {config.rules.trim() && (
          <>
            <h3>{t("welcome.rules")}</h3>
            <div className="welcome-gate-rules">{config.rules}</div>
          </>
        )}
        {config.fields.length > 0 && (
          <form
            className="welcome-gate-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!missing) void accept();
            }}
          >
            <h3>{t("welcome.gateIntro")}</h3>
            {config.fields.map((field) => (
              <label key={field.id} className="welcome-gate-field">
                <span>
                  {field.label}
                  {field.required ? " *" : ""}
                </span>
                {field.type === "long" ? (
                  <textarea
                    className="discord-text-input"
                    rows={3}
                    maxLength={1000}
                    value={answers[field.id] || ""}
                    onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.value })}
                  />
                ) : (
                  <input
                    type={field.type === "date" ? "date" : "text"}
                    className="discord-text-input"
                    maxLength={field.type === "date" ? undefined : 200}
                    max={field.type === "date" ? new Date().toISOString().slice(0, 10) : undefined}
                    value={answers[field.id] || ""}
                    onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.value })}
                  />
                )}
              </label>
            ))}
          </form>
        )}
        {offered.length > 0 && (
          <>
            <h3>{t("rolePicker.title")}</h3>
            <RolePickList
              roles={roles}
              selected={picked}
              onToggle={(id) =>
                setPicked((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            />
            <p className="role-picker-hint">{t("rolePicker.later")}</p>
          </>
        )}
        {error && <p className="welcome-gate-error">{error}</p>}
        <div className="welcome-gate-actions">
          <button type="button" className="discord-btn secondary-gray" onClick={onLeave}>
            {t("welcome.gateLeave")}
          </button>
          <button
            type="button"
            className="discord-btn primary-indigo"
            disabled={sending || missing}
            onClick={() => void accept()}
          >
            {config.fields.length ? t("welcome.gateSubmit") : t("welcome.gateAgree")}
          </button>
        </div>
      </div>
    </div>
  );
}
