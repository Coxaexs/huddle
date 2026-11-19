"use client";

import { Search, Shield, GripVertical, Users, Pencil, Trash2 } from "lucide-react";
import type { PublicRole, PublicServer } from "@/lib/servers";
import type { Member } from "@/lib/users";
import { PERMISSION_INFO, type PermissionFlag } from "@/lib/permissions";
import { Tab } from "./types";
import { useEffect, useRef, useState } from "react";
import { roleIconIsImage } from "@/lib/role-icon";
import { useI18n } from "../../lib/i18n-context";

/** The id the editor uses for @everyone, which lives on the server, not in roles. */
export const EVERYONE_ROLE_ID = "@everyone";

/** @everyone as a role the editor can open, below every real one. */
export function everyoneRoleOf(server: PublicServer): PublicRole {
  return {
    id: EVERYONE_ROLE_ID,
    name: "@everyone",
    color: "",
    permissions: server.everyonePermissions || 0,
    position: -1,
  };
}

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
  serverId,
  roleSearch,
  setRoleSearch,
  canManageRolesEffective,
  handleCreateRole,
  filteredRoles,
  allRoleIds,
  reorderRoles,
  everyoneRole,
  activeRole,
  setActiveRole,
  members,
  toggleRolePermission,
  updateRoleIcon,
  uploadRoleIcon,
  updateRoleDetails,
  handleDeleteRole,
  toggleMemberRole,
}: {
  tab: Tab;
  serverId: string;
  roleSearch: string;
  setRoleSearch: React.Dispatch<React.SetStateAction<string>>;
  canManageRolesEffective: boolean;
  handleCreateRole: () => void;
  filteredRoles: PublicRole[];
  /** Every role id in order, highest first (the list may be filtered by a search). */
  allRoleIds: string[];
  reorderRoles: (order: string[]) => Promise<void>;
  everyoneRole: PublicRole;
  activeRole: PublicRole | null;
  setActiveRole: React.Dispatch<React.SetStateAction<PublicRole | null>>;
  members: Member[];
  toggleRolePermission: (flag: PermissionFlag) => Promise<void>;
  updateRoleIcon: (icon: string | null) => Promise<void>;
  uploadRoleIcon: (file: File) => Promise<void>;
  updateRoleDetails: (roleId: string, patch: { name?: string; color?: string }) => Promise<void>;
  handleDeleteRole: (role: PublicRole) => void;
  toggleMemberRole: (userId: string, roleId: string, add: boolean) => Promise<void>;
}) {
  const [nameDraft, setNameDraft] = useState("");
  const [colorDraft, setColorDraft] = useState("#99aab5");
  const [savingDetails, setSavingDetails] = useState(false);
  const [draggingRoleId, setDraggingRoleId] = useState<string | null>(null);
  const [dropRoleId, setDropRoleId] = useState<string | null>(null);
  // Moving roles only makes sense on the full list, not a search result.
  const canReorder = canManageRolesEffective && !roleSearch.trim() && allRoleIds.length > 1;
  const moveRole = (id: string, toIndex: number) => {
    const from = allRoleIds.indexOf(id);
    if (from < 0 || toIndex < 0 || toIndex >= allRoleIds.length || toIndex === from) return;
    const order = allRoleIds.filter((x) => x !== id);
    order.splice(toIndex, 0, id);
    void reorderRoles(order);
  };

  useEffect(() => {
    if (!activeRole || activeRole.id === EVERYONE_ROLE_ID) return;
    setNameDraft(activeRole.name);
    setColorDraft(activeRole.color || "#99aab5");
  }, [activeRole?.id, activeRole?.name, activeRole?.color]);

  // Permissions save the moment they are switched, so the name and colour do
  // too: the colour shortly after the picker settles, the name when you leave
  // the box or press Enter. There used to be a separate "Save changes" button
  // that was easy to miss, and a new colour was lost on switching roles.
  const colorTimer = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);
  const flushColor = () => {
    const pending = colorTimer.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    colorTimer.current = null;
    pending.run();
  };
  useEffect(() => flushColor, [activeRole?.id]);

  async function saveDetails(patch: { name?: string; color?: string }, roleId = activeRole?.id) {
    if (!roleId || roleId === EVERYONE_ROLE_ID) return;
    setSavingDetails(true);
    try {
      await updateRoleDetails(roleId, patch);
    } finally {
      setSavingDetails(false);
    }
  }

  function changeColor(color: string) {
    setColorDraft(color);
    const roleId = activeRole?.id;
    if (!roleId) return;
    if (colorTimer.current) clearTimeout(colorTimer.current.timer);
    const run = () => void saveDetails({ color }, roleId);
    colorTimer.current = { timer: setTimeout(() => { colorTimer.current = null; run(); }, 600), run };
  }

  function commitName() {
    if (!activeRole) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(activeRole.name);
      return;
    }
    if (trimmed !== activeRole.name) void saveDetails({ name: trimmed });
  }

  return (
    <>
      {tab === "roles" && (
          <div className="tab-pane roles-pane">
            <h1 className="pane-title">Roles</h1>
            <p className="pane-subtitle">Use roles to group your server members and assign permissions.</p>

            <button
              type="button"
              className={`default-permissions-card ${activeRole?.id === EVERYONE_ROLE_ID ? "selected" : ""}`}
              onClick={() => setActiveRole((prev) => (prev?.id === EVERYONE_ROLE_ID ? prev : everyoneRole))}
            >
              <div className="card-info">
                <strong>Default Permissions</strong>
                <span>@everyone · applies to all server members</span>
              </div>
              <span className="chevron-arrow">›</span>
            </button>

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
              {filteredRoles.map((role) => {
                const roleMemberCount = members.filter((m) =>
                  (m.roleIds?.[serverId] || []).includes(role.id),
                ).length;
                return (
                  <div
                    key={role.id}
                    className={`role-table-row ${activeRole?.id === role.id ? "selected" : ""} ${draggingRoleId === role.id ? "dragging" : ""} ${dropRoleId === role.id && draggingRoleId && draggingRoleId !== role.id ? (allRoleIds.indexOf(draggingRoleId) < allRoleIds.indexOf(role.id) ? "drop-target drop-below" : "drop-target") : ""}`}
                    onClick={() => setActiveRole(role)}
                    draggable={canReorder}
                    onDragStart={(e) => {
                      if (!canReorder) return;
                      setDraggingRoleId(role.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", role.id);
                    }}
                    onDragOver={(e) => {
                      if (!draggingRoleId) return;
                      e.preventDefault();
                      if (dropRoleId !== role.id) setDropRoleId(role.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingRoleId) moveRole(draggingRoleId, allRoleIds.indexOf(role.id));
                      setDraggingRoleId(null);
                      setDropRoleId(null);
                    }}
                    onDragEnd={() => {
                      setDraggingRoleId(null);
                      setDropRoleId(null);
                    }}
                  >
                    <div className="role-name-col">
                      {canReorder ? (
                        <button
                          type="button"
                          className="drag-dots"
                          title="Drag to move. Arrow keys move it up or down. Higher roles outrank lower ones."
                          aria-label={`Move ${role.name}: use the up and down arrow keys`}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            const index = allRoleIds.indexOf(role.id);
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              moveRole(role.id, index - 1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              moveRole(role.id, index + 1);
                            }
                          }}
                        >
                          <GripVertical size={14} />
                        </button>
                      ) : (
                        <span className="drag-dots drag-dots-off" aria-hidden="true"><GripVertical size={14} /></span>
                      )}
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
                      <span>{roleMemberCount}</span>
                      <Users size={14} />
                    </div>
                    <div className="role-actions-col">
                      <button
                        type="button"
                        className="icon-action-btn"
                        title="Edit Role"
                        aria-label={`Edit ${role.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveRole(role);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      {canManageRolesEffective && (
                        <button
                          type="button"
                          className="icon-action-btn"
                          title="Delete Role"
                          aria-label={`Delete ${role.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRole(role);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {activeRole && canManageRolesEffective && (
              <div className="active-role-permissions-editor">
                {activeRole.id !== EVERYONE_ROLE_ID && (
                  <>
                    <div className="role-editor-head" style={{ marginBottom: 14 }}>
                      <input
                        type="color"
                        aria-label="Role colour"
                        value={colorDraft}
                        onChange={(e) => changeColor(e.target.value)}
                      />
                      <input
                        type="text"
                        className="discord-search-input"
                        aria-label="Role name"
                        maxLength={40}
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setNameDraft(activeRole.name);
                          }
                        }}
                        style={{ color: colorDraft }}
                      />
                      <span className="role-save-state" aria-live="polite" style={{ fontSize: 12, opacity: 0.7, minWidth: 52 }}>
                        {savingDetails ? "Saving…" : ""}
                      </span>
                      <button
                        type="button"
                        className="role-delete"
                        onClick={() => handleDeleteRole(activeRole)}
                      >
                        Delete
                      </button>
                    </div>
                    <RoleIconEditor role={activeRole} updateRoleIcon={updateRoleIcon} uploadRoleIcon={uploadRoleIcon} />
                  </>
                )}
                <h3>Edit Permissions for {activeRole.name}</h3>
                {activeRole.id === EVERYONE_ROLE_ID && (
                  <p className="pane-subtitle" style={{ margin: "0 0 12px" }}>
                    Every member has these, whatever roles they hold.
                  </p>
                )}
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
                {filteredRoles.length > 0 && members.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <span className="field-label" style={{ display: "block", marginBottom: 8 }}>
                      Assign roles
                    </span>
                    <div className="assign-list">
                      {members.map((member) => {
                        const held = new Set(member.roleIds?.[serverId] || []);
                        return (
                          <div key={member.id} className="assign-row">
                            <strong>{member.displayName}</strong>
                            <div className="assign-chips">
                              {filteredRoles.map((role) => {
                                const on = held.has(role.id);
                                return (
                                  <button
                                    type="button"
                                    key={role.id}
                                    className={`assign-chip ${on ? "on" : ""}`}
                                    style={
                                      on && role.color
                                        ? { borderColor: role.color, color: role.color }
                                        : undefined
                                    }
                                    onClick={() => void toggleMemberRole(member.id, role.id, !on)}
                                  >
                                    {role.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
    </>
  );
}
