"use client";

import { useEffect, useState } from "react";
import { PERMISSION_INFO, type PermissionFlag } from "@/lib/permissions";
import type { PublicRole, PublicServer } from "@/lib/servers";
import { type Member } from "@/lib/users";
import { apiFetch } from "../../lib/client";
import { comboFromEvent, comboLabel, isModifierOnly, loadKeyboardLayout } from "../../lib/hotkeys";
import { useI18n } from "../../lib/i18n-context";

/**
 * A button that records the next key combination pressed. Modifier-only
 * presses are ignored so you can hold Ctrl+Shift before choosing the letter,
 * and Escape cancels without changing anything.
 */
export function ComboButton({
  label,
  combo,
  onChange,
}: {
  label: string;
  combo: string;
  onChange: (combo: string) => void;
}) {
  const { t } = useI18n();
  const [listening, setListening] = useState(false);
  const [, setLayoutReady] = useState(false);

  // Name keys the way this keyboard prints them (ö, ç, ş on a Turkish one).
  useEffect(() => {
    let live = true;
    void loadKeyboardLayout().then(() => {
      if (live) setLayoutReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!listening) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        setListening(false);
        return;
      }
      if (isModifierOnly(event.code)) return;
      onChange(comboFromEvent(event));
      setListening(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, onChange]);

  return (
    <button
      type="button"
      className={`ptt-key-button ${listening ? "listening" : ""}`}
      onClick={() => setListening(true)}
    >
      <span>{label}</span>
      <kbd>{listening ? t("settings.combo.pressKeys") : comboLabel(combo)}</kbd>
    </button>
  );
}
/**
 * Server roles: create roles, edit their colour and permissions, and assign
 * them to members. Every mutation broadcasts a structure change, so the parent's
 * server/member state refreshes over the socket without extra plumbing here.
 */
export function RolesTab({
  server,
  members,
  onError,
}: {
  server: PublicServer;
  members: Member[];
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const roles = [...server.roles].sort((a, b) => b.position - a.position);

  async function createRole() {
    try {
      await apiFetch("/api/roles", {
        method: "POST",
        body: JSON.stringify({ serverId: server.id, name: "new role" }),
      });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : t("settings.roles.createError"));
    }
  }

  return (
    <div className="roles-tab">
      <p className="modal-hint">{t("settings.roles.hint")}</p>
      <button type="button" className="primary" onClick={() => void createRole()}>
        {t("settings.roles.createBtn")}
      </button>

      <div className="roles-list">
        {roles.map((role) => (
          <RoleEditor key={role.id} role={role} onError={onError} />
        ))}
        {!roles.length && <p className="modal-hint">{t("settings.roles.empty")}</p>}
      </div>

      {roles.length > 0 && (
        <>
          <span className="field-label">{t("settings.roles.assign")}</span>
          <div className="assign-list">
            {members.map((member) => (
              <MemberRoles
                key={member.id}
                serverId={server.id}
                member={member}
                roles={roles}
                onError={onError}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
export function RoleEditor({
  role,
  onError,
}: {
  role: PublicRole;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [permissions, setPermissions] = useState(role.permissions);
  const [saving, setSaving] = useState(false);

  function toggle(flag: PermissionFlag) {
    setPermissions((current) => current ^ flag);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/roles/${role.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, color, permissions }),
      });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : t("settings.roles.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("settings.roles.deleteConfirm", { name: role.name }))) return;
    try {
      await apiFetch(`/api/roles/${role.id}`, { method: "DELETE" });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : t("settings.roles.deleteError"));
    }
  }

  const dirty =
    name !== role.name || color !== role.color || permissions !== role.permissions;

  return (
    <div className="role-editor">
      <div className="role-editor-head">
        <input
          type="color"
          value={color}
          aria-label={t("settings.roles.colorAria")}
          onChange={(event) => setColor(event.target.value)}
        />
        <input
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          style={{ color }}
        />
        <button type="button" className="role-delete" onClick={() => void remove()}>
          {t("common.delete")}
        </button>
      </div>
      <div className="role-perms">
        {PERMISSION_INFO.map((info) => (
          <label key={info.flag} title={info.description}>
            <input
              type="checkbox"
              checked={(permissions & info.flag) !== 0}
              onChange={() => toggle(info.flag)}
            />
            {info.label}
          </label>
        ))}
      </div>
      {dirty && (
        <button
          type="button"
          className="primary role-save"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? t("settings.roles.saving") : t("settings.roles.saveChanges")}
        </button>
      )}
    </div>
  );
}
export function MemberRoles({
  serverId,
  member,
  roles,
  onError,
}: {
  serverId: string;
  member: Member;
  roles: PublicRole[];
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const held = new Set(member.roleIds?.[serverId] || []);

  async function toggle(roleId: string, add: boolean) {
    try {
      await apiFetch("/api/roles/assign", {
        method: "POST",
        body: JSON.stringify({ serverId, userId: member.id, roleId, add }),
      });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : t("settings.roles.assignError"));
    }
  }

  return (
    <div className="assign-row">
      <strong>{member.displayName}</strong>
      <div className="assign-chips">
        {roles.map((role) => {
          const on = held.has(role.id);
          return (
            <button
              type="button"
              key={role.id}
              className={`assign-chip ${on ? "on" : ""}`}
              style={on ? { borderColor: role.color, color: role.color } : undefined}
              onClick={() => void toggle(role.id, !on)}
            >
              {role.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}