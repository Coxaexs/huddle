"use client";

import { Search, Shield, GripVertical, Users, Pencil, MoreHorizontal } from "lucide-react";
import type { PublicRole } from "@/lib/servers";
import type { Member } from "@/lib/users";
import { PERMISSION_INFO, type PermissionFlag } from "@/lib/permissions";
import { Tab } from "./types";

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
