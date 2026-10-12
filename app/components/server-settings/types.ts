"use client";



export interface ServerBot {
  id: string;
  server_id: string;
  name: string;
  avatar: string;
  token: string;
  description: string;
  kind: string;
  enabled: number;
  created_at: string;
}
export interface ServerInvite {
  code: string;
  createdAt: string;
  maxUses: number;
  uses: number;
  revoked: boolean;
  note: string;
  spent: boolean;
}
export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  targetId: string | null;
  targetName: string | null;
  detail: string | null;
  createdAt: string;
}
export type Tab =
  | "profile"
  | "tag"
  | "engagement"
  | "boost"
  | "emoji"
  | "stickers"
  | "soundboard"
  | "members"
  | "roles"
  | "invites"
  | "access"
  | "integrations"
  | "app_directory"
  | "safety"
  | "audit_log"
  | "bans"
  | "automod"
  | "welcome"
  | "community"
  | "template";
export interface CustomEmoji {
  id: string;
  serverId: string;
  name: string;
  url: string;
}
export interface ServerBan {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  bannedAt: string;
  bannedBy: string | null;
}