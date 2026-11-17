"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Check, Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "../lib/client";
import { useI18n } from "../lib/i18n-context";
import { pickableRoles, type RolePick } from "@/lib/role-picker";
import type { PublicRole, PublicServer } from "@/lib/servers";

/** How a role is pinged in a message: spaces become dashes (@Game-Master). */
export function roleHandle(name: string): string {
  return name.trim().replace(/\s+/g, "-");
}

/** The role buttons members toggle (welcome screen and Pick your roles). */
export function RolePickList({
  roles,
  selected,
  onToggle,
  disabled,
}: {
  roles: PublicRole[];
  selected: Set<string>;
  onToggle: (roleId: string) => void;
  disabled?: boolean;
}) {
  const offered = pickableRoles(roles);
  return (
    <div className="role-pick-list">
      {offered.map((role) => {
        const on = selected.has(role.id);
        return (
          <button
            key={role.id}
            type="button"
            className={`role-pick${on ? " is-on" : ""}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onToggle(role.id)}
          >
            <span className="role-pick-emoji" aria-hidden>
              {role.pick.emoji || "•"}
            </span>
            <span className="role-pick-text">
              <span className="role-pick-name" style={{ color: role.color }}>
                {role.name}
              </span>
              {role.pick.note && <span className="role-pick-note">{role.pick.note}</span>}
            </span>
            <span className="role-pick-check" aria-hidden>
              {on && <Check size={14} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Server menu → Pick your roles. Each tap saves straight away. */
export function RolePickerDialog({ server, onClose }: { server: PublicServer; onClose: () => void }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "failed">("");
  const latest = useRef(0);
  const offered = pickableRoles(server.roles);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ roleIds: string[] }>(`/api/servers/${encodeURIComponent(server.id)}/role-picker`)
      .then((res) => !cancelled && setSelected(new Set(res.roleIds)))
      .catch(() => !cancelled && setSelected(new Set()));
    return () => {
      cancelled = true;
    };
  }, [server.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggle(roleId: string) {
    if (!selected) return;
    const next = new Set(selected);
    if (next.has(roleId)) next.delete(roleId);
    else next.add(roleId);
    setSelected(next);
    setStatus("saving");
    const call = ++latest.current;
    try {
      const res = await apiFetch<{ roleIds: string[] }>(
        `/api/servers/${encodeURIComponent(server.id)}/role-picker`,
        { method: "POST", body: JSON.stringify({ roleIds: [...next] }) },
      );
      if (call !== latest.current) return;
      setSelected(new Set(res.roleIds));
      setStatus("saved");
    } catch {
      if (call !== latest.current) return;
      setSelected(selected);
      setStatus("failed");
    }
  }

  const example = offered[0] ? `@${roleHandle(offered[0].name)}` : "@role";
  const dialog = (
    <div className="poll-dialog-backdrop role-picker-backdrop" onClick={onClose}>
      <div
        className="poll-dialog-card role-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("rolePicker.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="role-picker-head">
          <h2>{t("rolePicker.title")}</h2>
          <button type="button" className="icon-action-btn" aria-label={t("rolePicker.done")} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="role-picker-hint">{t("rolePicker.hint", { example })}</p>
        {selected ? (
          offered.length ? (
            <RolePickList roles={server.roles} selected={selected} onToggle={(id) => void toggle(id)} />
          ) : (
            <p className="role-picker-hint">{t("rolePicker.none")}</p>
          )
        ) : (
          <p className="loading-state">…</p>
        )}
        <div className="role-picker-foot">
          <span className={`role-picker-status ${status}`} aria-live="polite">
            {status === "saving" ? "…" : status === "saved" ? t("rolePicker.saved") : status === "failed" ? t("rolePicker.failed") : ""}
          </span>
          <button type="button" className="discord-btn primary-indigo" onClick={onClose}>
            {t("rolePicker.done")}
          </button>
        </div>
      </div>
    </div>
  );
  // Out of the sidebar, which is a sliding drawer on phones.
  return typeof document === "undefined" ? null : createPortal(dialog, document.body);
}

/** Server Settings → Welcome Screen: which roles members can pick, with an emoji and a line each. */
export function RolePickerEditor({
  server,
  picks,
  onChange,
  welcomeOn,
  onNotice,
}: {
  server: PublicServer;
  picks: RolePick[];
  onChange: (picks: RolePick[]) => void;
  welcomeOn: boolean;
  onNotice: (text: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  // Roles made here, until the server list catches up with them.
  const [made, setMade] = useState<PublicRole[]>([]);
  const rolesById = new Map([...made, ...server.roles].map((role) => [role.id, role]));
  const pickedIds = new Set(picks.map((pick) => pick.roleId));
  const addable = [...server.roles]
    .filter((role) => !pickedIds.has(role.id))
    .sort((a, b) => b.position - a.position);

  function update(index: number, patch: Partial<RolePick>) {
    onChange(picks.map((pick, i) => (i === index ? { ...pick, ...patch } : pick)));
  }

  function move(index: number, by: number) {
    const next = [...picks];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onChange(next);
  }

  async function createRole(name: string, emoji = "", note = "") {
    const clean = name.trim();
    if (!clean) return;
    setCreating(true);
    try {
      const before = new Set(server.roles.map((role) => role.id));
      const res = await apiFetch<{ servers: PublicServer[] }>("/api/roles", {
        method: "POST",
        // At the bottom, so picking it never changes anyone's name colour.
        body: JSON.stringify({ serverId: server.id, name: clean, atBottom: true }),
      });
      const created = res.servers
        .find((s) => s.id === server.id)
        ?.roles.find((role) => !before.has(role.id));
      if (created) {
        setMade((list) => [...list, created]);
        onChange([...picks, { roleId: created.id, emoji, note }]);
      }
      setNewName("");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not create the role.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="form-field">
      <label>Role picker (optional)</label>
      <p className="field-hint">
        Let members pick roles for themselves, like a Notifications role (anyone who pings{" "}
        <code>@Notifications</code> reaches everyone who took it) or one role per game. New members
        see these on the welcome screen, and everyone can change them any time from the server
        menu → Pick your roles. Only roles without permissions can be offered.
      </p>
      {!welcomeOn && picks.length > 0 && (
        <p className="field-hint role-picker-warn">
          The welcome screen is off, so new members will only find these in the server menu.
        </p>
      )}

      {picks.map((pick, index) => {
        const role = rolesById.get(pick.roleId);
        if (!role) return null;
        return (
          <div key={pick.roleId} className="role-pick-row">
            <input
              type="text"
              className="discord-text-input role-pick-emoji-input"
              aria-label={`Emoji for ${role.name}`}
              placeholder="🙂"
              value={pick.emoji}
              onChange={(e) => update(index, { emoji: Array.from(e.target.value).slice(-8).join("") })}
            />
            <span className="role-pick-row-name" style={{ color: role.color }}>
              {role.name}
            </span>
            <input
              type="text"
              className="discord-text-input"
              aria-label={`Description for ${role.name}`}
              placeholder="What is this role for?"
              maxLength={200}
              value={pick.note}
              onChange={(e) => update(index, { note: e.target.value })}
            />
            {role.permissions !== 0 && (
              <span className="role-picker-warn" title="Members cannot pick a role that gives permissions">
                has permissions
              </span>
            )}
            <button
              type="button"
              className="icon-action-btn"
              aria-label="Move up"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={15} />
            </button>
            <button
              type="button"
              className="icon-action-btn"
              aria-label="Move down"
              disabled={index === picks.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={15} />
            </button>
            <button
              type="button"
              className="icon-action-btn"
              aria-label={`Stop offering ${role.name}`}
              onClick={() => onChange(picks.filter((_, i) => i !== index))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        );
      })}

      {picks.length < 25 && (
        <div className="role-pick-add">
          {addable.length > 0 && (
            <select
              className="discord-text-input"
              aria-label="Offer an existing role"
              value=""
              onChange={(e) => {
                if (e.target.value) onChange([...picks, { roleId: e.target.value, emoji: "", note: "" }]);
              }}
            >
              <option value="">Offer an existing role…</option>
              {addable.map((role) => (
                <option key={role.id} value={role.id} disabled={role.permissions !== 0}>
                  {role.name}
                  {role.permissions !== 0 ? " (gives permissions)" : ""}
                </option>
              ))}
            </select>
          )}
          <form
            className="role-pick-new"
            onSubmit={(e) => {
              e.preventDefault();
              void createRole(newName);
            }}
          >
            <input
              type="text"
              className="discord-text-input"
              aria-label="New role name"
              placeholder="New role, e.g. Minecraft"
              maxLength={40}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="discord-btn secondary-gray" disabled={creating || !newName.trim()}>
              <Plus size={14} /> Create
            </button>
          </form>
          {picks.length === 0 && !server.roles.some((role) => /^notifications?$/i.test(role.name)) && (
            <button
              type="button"
              className="discord-btn secondary-gray"
              disabled={creating}
              onClick={() => void createRole("Notifications", "🔔", "Get pinged when something is happening.")}
            >
              🔔 Add a Notifications role
            </button>
          )}
        </div>
      )}
      {picks.length > 0 && <p className="field-hint">Remember to press Save Changes below.</p>}
    </div>
  );
}
