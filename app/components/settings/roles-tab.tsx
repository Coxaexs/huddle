"use client";

import { useEffect, useState } from "react";
import { PERMISSION_INFO, type PermissionFlag } from "@/lib/permissions";
import type { PublicRole, PublicServer } from "@/lib/servers";
import { type Member } from "@/lib/users";
import { apiFetch } from "../../lib/client";
import { comboFromEvent, comboLabel, isModifierOnly } from "../../lib/hotkeys";

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
  const [listening, setListening] = useState(false);

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
      <kbd>{listening ? "Press keys… (Esc to cancel)" : comboLabel(combo)}</kbd>
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
  const roles = [...server.roles].sort((a, b) => b.position - a.position);

  async function createRole() {
    try {
      await apiFetch("/api/roles", {
        method: "POST",
        body: JSON.stringify({ serverId: server.id, name: "new role" }),
      });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "Could not create role.");
    }
  }

  return (
    <div className="roles-tab">
      <p className="modal-hint">
        Roles paint member names their colour and grant permissions. The highest
        role a member holds decides their name colour.
      </p>
      <button type="button" className="primary" onClick={() => void createRole()}>
        Create a role
      </button>

      <div className="roles-list">
        {roles.map((role) => (
          <RoleEditor key={role.id} role={role} onError={onError} />
        ))}
        {!roles.length && <p className="modal-hint">No roles yet.</p>}
      </div>

      {roles.length > 0 && (
        <>
          <span className="field-label">Assign roles</span>
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
      onError(failure instanceof Error ? failure.message : "Could not save role.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the "${role.name}" role?`)) return;
    try {
      await apiFetch(`/api/roles/${role.id}`, { method: "DELETE" });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "Could not delete role.");
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
          aria-label="Role colour"
          onChange={(event) => setColor(event.target.value)}
        />
        <input
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          style={{ color }}
        />
        <button type="button" className="role-delete" onClick={() => void remove()}>
          Delete
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
          {saving ? "Saving…" : "Save changes"}
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
  const held = new Set(member.roleIds?.[serverId] || []);

  async function toggle(roleId: string, add: boolean) {
    try {
      await apiFetch("/api/roles/assign", {
        method: "POST",
        body: JSON.stringify({ serverId, userId: member.id, roleId, add }),
      });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "Could not assign role.");
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