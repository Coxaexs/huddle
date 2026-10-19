"use client";

import type { PublicRole, PublicServer } from "@/lib/servers";
import type { Member } from "@/lib/users";
import { roleIconIsImage } from "@/lib/role-icon";

/** The highest-positioned role this member holds here that has an icon. */
export function topRoleWithIcon(
  member: Pick<Member, "roleIds"> | undefined,
  server: Pick<PublicServer, "id" | "roles"> | null | undefined,
): PublicRole | null {
  if (!member || !server) return null;
  const held = new Set(member.roleIds?.[server.id] || []);
  let best: PublicRole | null = null;
  for (const role of server.roles) {
    if (!role.icon || !held.has(role.id)) continue;
    if (!best || role.position > best.position) best = role;
  }
  return best;
}

/** A role's icon beside a member's name, as Discord shows it. */
export function RoleIcon({
  member,
  server,
}: {
  member: Pick<Member, "roleIds"> | undefined;
  server: Pick<PublicServer, "id" | "roles"> | null | undefined;
}) {
  const role = topRoleWithIcon(member, server);
  if (!role?.icon) return null;
  return (
    <span className="role-icon" title={role.name} aria-label={role.name} role="img">
      {roleIconIsImage(role.icon) ? <img src={role.icon} alt="" loading="lazy" /> : role.icon}
    </span>
  );
}
