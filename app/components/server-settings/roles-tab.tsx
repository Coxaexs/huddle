"use client";

import { Search, Shield, GripVertical, Users, Pencil, MoreHorizontal } from "lucide-react";
import type { PublicRole } from "@/lib/servers";
import type { Member } from "@/lib/users";
import { PERMISSION_INFO, type PermissionFlag } from "@/lib/permissions";
import { Tab } from "./types";
import { useEffect, useRef, useState } from "react";
import { roleIconIsImage } from "@/lib/role-icon";
import { useI18n } from "../../lib/i18n-context";

/** Emoji or uploaded image beside the names of this role's members. */
function RoleIconEditor({
  role,
  updateRoleIcon,
  uploadRoleIcon,
}: {
  role: PublicRole;
  updateRoleIcon: (icon: string | null) => Promise<void>;
  uploadRoleIcon: (file: File) => Promise<void>;
}) {
  const { t } = useI18n();
  const isImage = roleIconIsImage(role.icon);
  const [emoji, setEmoji] = useState(isImage ? "" : role.icon || "");
  useEffect(() => setEmoji(roleIconIsImage(role.icon) ? "" : role.icon || ""), [role.id, role.icon]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="role-icon-editor" style={{ margin: "12px 0 20px", display: "grid", gap: "8px" }}>
      <h3>{t("roleIcon.title")}</h3>
      <p className="pane-subtitle" style={{ margin: 0 }}>{t("roleIcon.desc")}</p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
        <span className="role-icon" style={{ width: 28, height: 28, fontSize: 22 }} aria-hidden="true">
          {role.icon ? isImage ? <img src={role.icon} alt="" style={{ width: 28, height: 28 }} /> : role.icon : "—"}
        </span>
        <input
          type="text"
          className="discord-search-input"
          style={{ width: 120 }}
          placeholder={t("roleIcon.emoji")}
          aria-label={t("roleIcon.emoji")}
          value={emoji}
          maxLength={16}
          onChange={(e) => setEmoji(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && emoji.trim()) void updateRoleIcon(emoji.trim());
          }}
        />
        <button
          type="button"
          className="discord-btn primary-indigo"
          disabled={!emoji.trim() || emoji.trim() === role.icon}
          onClick={() => void updateRoleIcon(emoji.trim())}
        >
          {t("roleIcon.save")}
        </button>
        <button type="button" className="discord-btn" onClick={() => fileRef.current?.click()}>
          {t("roleIcon.upload")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void uploadRoleIcon(file);
          }}
        />
        {role.icon && (
          <button type="button" className="discord-btn" onClick={() => void updateRoleIcon(null)}>
            {t("roleIcon.remove")}
          </button>
        )}
      </div>
    </div>
  );
}

export function ServerRolesTab({
  tab,
  roleSearch,
  setRoleSearch,
  canManageRolesEffective,
  handleCreateRole,
  filteredRoles,
  activeRole,
  setActiveRole,
  members,
  toggleRolePermission,
  updateRoleIcon,
  uploadRoleIcon,
}: {
  tab: Tab;
  roleSearch: string;
  setRoleSearch: React.Dispatch<React.SetStateAction<string>>;
  canManageRolesEffective: boolean;
  handleCreateRole: () => void;
  filteredRoles: PublicRole[];
  activeRole: PublicRole | null;
  setActiveRole: React.Dispatch<React.SetStateAction<PublicRole | null>>;
  members: Member[];
  toggleRolePermission: (flag: PermissionFlag) => Promise<void>;
  updateRoleIcon: (icon: string | null) => Promise<void>;
  uploadRoleIcon: (file: File) => Promise<void>;
}) {
  return (
    <>
      {tab === "roles" && (
          <div className="tab-pane roles-pane">
            <h1 className="pane-title">Roles</h1>
            <p className="pane-subtitle">Use roles to group your server members and assign permissions.</p>

            <div className="default-permissions-card">
              <div className="card-info">
                <strong>Default Permissions</strong>
                <span>@everyone · applies to all server members</span>
              </div>
              <span className="chevron-arrow">›</span>
            </div>

            <div className="roles-toolbar">
              <div className="search-wrap">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  className="discord-search-input"
                  placeholder="Search Roles"
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                />
              </div>
              {canManageRolesEffective && (
                <button
                  type="button"
                  className="discord-btn primary-indigo"
                  onClick={handleCreateRole}
                >
                  Create Role
                </button>
              )}
            </div>

            <div className="roles-table-head">
              <span>ROLES - {filteredRoles.length}</span>
              <span>MEMBERS</span>
            </div>

            <div className="roles-list-wrapper">
              {filteredRoles.map((role) => (
                <div
                  key={role.id}
                  className={`role-table-row ${activeRole?.id === role.id ? "selected" : ""}`}
                  onClick={() => setActiveRole(role)}
                >
                  <div className="role-name-col">
                    <span className="drag-dots"><GripVertical size={14} /></span>
                    <span
                      className="role-shield-icon"
                      style={{ color: role.color || "#99aab5" }}
                    >
                      <Shield size={16} />
                    </span>
                    <strong>{role.name}</strong>
                    {role.icon && (
                      <span className="role-icon" aria-hidden="true">{roleIconIsImage(role.icon) ? <img src={role.icon} alt="" /> : role.icon}</span>
                    )}
                  </div>
                  <div className="role-members-col flex items-center gap-1">
                    <span>{members.length}</span>
                    <Users size={14} />
                  </div>
                  <div className="role-actions-col">
                    <button type="button" className="icon-action-btn" title="Edit Role">
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="icon-action-btn" title="More">
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {activeRole && canManageRolesEffective && (
              <div className="active-role-permissions-editor">
                <RoleIconEditor role={activeRole} updateRoleIcon={updateRoleIcon} uploadRoleIcon={uploadRoleIcon} />
                <h3>Edit Permissions for {activeRole.name}</h3>
                <div className="permissions-toggle-grid">
                  {PERMISSION_INFO.map((info) => {
                    const enabled = (activeRole.permissions & info.flag) === info.flag;
                    return (
                      <label key={info.flag} className="perm-item-row">
                        <div>
                          <strong>{info.label}</strong>
                          <p>{info.description}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => toggleRolePermission(info.flag)}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
    </>
  );
}
