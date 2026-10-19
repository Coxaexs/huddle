"use client";



/** Human-friendly label for an audit action verb. */
export const AUDIT_LABELS: Record<string, string> = {
  "server.create": "created the server",
  "server.update": "updated server settings",
  "channel.create": "created a channel",
  "channel.update": "edited a channel",
  "channel.delete": "deleted a channel",
  "role.create": "created a role",
  "role.update": "edited a role",
  "role.delete": "deleted a role",
  "member.join": "joined",
  "member.leave": "left",
  "member.kick": "kicked a member",
  "member.move": "moved a member",
  "member.ban": "banned a member",
  "member.unban": "unbanned a member",
  "member.nickname": "changed a nickname",
  "member.timeout": "timed out a member",
  "member.timeout_remove": "lifted a timeout",
  "invite.create": "created an invite",
  "invite.revoke": "revoked an invite",
  "moderation.raid_on": "enabled raid lockdown",
  "moderation.raid_off": "disabled raid lockdown",
  "moderation.verification": "changed the verification level",
  "server.vanity": "changed the vanity invite",
  "message.purge": "bulk-purged messages in",
  "report.resolve": "resolved a moderation report",
  "server.import": "imported server structure from",
  "webhook.create": "created a webhook",
  "webhook.rotate": "rotated a webhook URL",
  "webhook.delete": "deleted a webhook",
};
export const BANNER_COLORS = [
  { label: "Dark", value: "linear-gradient(135deg, #1e1f29, #111218)" },
  { label: "Soul", value: "linear-gradient(135deg, #ff4081, #ff80ab)" },
  { label: "Crimson", value: "linear-gradient(135deg, #f44336, #ff7961)" },
  { label: "Amber", value: "linear-gradient(135deg, #ff9800, #ffc947)" },
  { label: "Gold", value: "linear-gradient(135deg, #ffeb3b, #fff350)" },
  { label: "Purple", value: "linear-gradient(135deg, #9c27b0, #ba68c8)" },
  { label: "Cyan", value: "linear-gradient(135deg, #00bcd4, #4dd0e1)" },
  { label: "Teal", value: "linear-gradient(135deg, #009688, #4db6ac)" },
  { label: "Green", value: "linear-gradient(135deg, #4caf50, #81c784)" },
  { label: "Charcoal", value: "linear-gradient(135deg, #37474f, #263238)" },
];