"use client";

import { Search, Hammer, Crown, Plus, X, Link as LinkIcon, UserMinus } from "lucide-react";
import { Avatar } from "../avatar";
import type { PublicRole, PublicServer } from "@/lib/servers";
import type { Member } from "@/lib/users";
import { Tab } from "./types";

export function ServerMembersTab({
  tab,
  filteredMembers,
  server,
  memberSearch,
  setMemberSearch,
  roles,
  roleAssignMenuUser,
  onlineUserIds,
  canManageRolesEffective,
  toggleMemberRole,
  setRoleAssignMenuUser,
  canKickEffective,
  canBanEffective,
  kickMember,
  banMember,
}: {
  tab: Tab;
  filteredMembers: Member[];
  server: PublicServer;
  memberSearch: string;
  setMemberSearch: React.Dispatch<React.SetStateAction<string>>;
  roles: PublicRole[];
  roleAssignMenuUser: string | null;
  onlineUserIds: Set<string> | undefined;
  canManageRolesEffective: boolean;
  toggleMemberRole: (userId: string, roleId: string, add: boolean) => Promise<void>;
  setRoleAssignMenuUser: React.Dispatch<React.SetStateAction<string | null>>;
  canKickEffective: boolean;
  canBanEffective: boolean;
  kickMember: (member: Member) => void;
  banMember: (member: Member) => void;
}) {
  return (
    <>
      {tab === "members" && (
          <div className="tab-pane members-pane">
            <h1 className="pane-title">Server Members</h1>
            <p className="pane-subtitle">
              {filteredMembers.length} {filteredMembers.length === 1 ? "member" : "members"} in {server.name}. Manage their server roles, view invite sources, and moderate members here.
            </p>

            <div className="members-toolbar">
              <div className="search-wrap">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  className="discord-search-input"
                  placeholder="Search Members, Roles, or Invites"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="members-table-head">
              <span>MEMBER</span>
              <span>JOINED VIA</span>
              <span>ROLES</span>
              <span style={{ textAlign: "right" }}>ACTIONS</span>
            </div>

            <div className="members-list-wrapper">
              {filteredMembers.map((member) => {
                const isOwner = member.id === server.ownerId;
                const assignedRoleIds = new Set(member.roleIds?.[server.id] || []);
                const memberRoles = roles.filter((r) => assignedRoleIds.has(r.id));
                const unassignedRoles = roles.filter((r) => !assignedRoleIds.has(r.id));
                const isMenuOpen = roleAssignMenuUser === member.id;

                return (
                  <div key={member.id} className="member-table-row">
                    <div className="member-user-col">
                      <div className="relative flex-shrink-0">
                        <Avatar
                          avatar={member.avatar}
                          avatarUrl={member.avatarUrl}
                          color={member.color}
                          size={36}
                        />
                        {onlineUserIds && (
                          <span
                            className={`member-online-dot ${
                              onlineUserIds.has(member.id) ? "online" : "offline"
                            }`}
                            title={
                              onlineUserIds.has(member.id)
                                ? "Online"
                                : "Offline"
                            }
                          />
                        )}
                      </div>
                      <div className="member-info-text">
                        <span className="member-info-name">
                          {member.displayName}
                          {isOwner && (
                            <span title="Server Owner" className="owner-crown">
                              <Crown size={14} />
                            </span>
                          )}
                        </span>
                        <span className="member-info-user">@{member.username}</span>
                      </div>
                    </div>

                    <div className="member-invite-col">
                      {member.joinedVia ? (
                        <div className="member-invite-info">
                          <span
                            className="member-invite-badge"
                            title={`Invite code: ${member.joinedVia.code}`}
                          >
                            <LinkIcon size={12} className="inline-icon" />
                            <code>{member.joinedVia.code}</code>
                          </span>
                          {member.joinedVia.creatorUsername || member.joinedVia.creatorName ? (
                            <span className="member-invite-by">
                              by @{member.joinedVia.creatorUsername || member.joinedVia.creatorName}
                            </span>
                          ) : null}
                        </div>
                      ) : isOwner ? (
                        <span className="member-invite-tag owner">
                          <Crown size={12} /> Server Owner
                        </span>
                      ) : (
                        <span className="member-invite-tag direct">
                          Direct / Default
                        </span>
                      )}
                    </div>

                    <div className="member-roles-col">
                      {memberRoles.map((role) => (
                        <span
                          key={role.id}
                          className="member-role-chip"
                          style={role.color ? { borderColor: `${role.color}66` } : undefined}
                        >
                          <span
                            className="member-role-dot"
                            style={{ background: role.color || "#99aab5" }}
                          />
                          <span style={{ color: role.color || "#dbdee1" }}>{role.name}</span>
                          {canManageRolesEffective && (
                            <button
                              type="button"
                              className="member-role-remove"
                              title={`Remove ${role.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleMemberRole(member.id, role.id, false);
                              }}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </span>
                      ))}

                      {canManageRolesEffective && (
                        <div className="relative">
                          <button
                            type="button"
                            className="add-role-btn"
                            title="Add Role"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRoleAssignMenuUser(isMenuOpen ? null : member.id);
                            }}
                          >
                            <Plus size={14} />
                          </button>

                          {isMenuOpen && (
                            <div
                              className="role-assign-menu"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {!unassignedRoles.length ? (
                                <div style={{ padding: "6px 8px", fontSize: 11, color: "#949ba4" }}>
                                  No more roles to add
                                </div>
                              ) : (
                                unassignedRoles.map((role) => (
                                  <button
                                    key={role.id}
                                    type="button"
                                    className="role-assign-option"
                                    onClick={() => {
                                      setRoleAssignMenuUser(null);
                                      void toggleMemberRole(member.id, role.id, true);
                                    }}
                                  >
                                    <span
                                      className="member-role-dot"
                                      style={{ background: role.color || "#99aab5" }}
                                    />
                                    <span style={{ color: role.color || "#dbdee1" }}>
                                      {role.name}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="member-actions-col">
                      {!isOwner && (canKickEffective || canBanEffective) && (
                        <>
                          {canKickEffective && (
                            <button
                              type="button"
                              className="member-action-btn"
                              title="Kick Member"
                              onClick={() => kickMember(member)}
                            >
                              <UserMinus size={15} />
                            </button>
                          )}
                          {canBanEffective && (
                            <button
                              type="button"
                              className="member-action-btn danger"
                              title="Ban Member"
                              onClick={() => banMember(member)}
                            >
                              <Hammer size={15} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
    </>
  );
}
