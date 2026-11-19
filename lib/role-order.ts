import type { RoleAuthority } from "./permissions";

/**
 * Why `order` (every role id, highest first) may not replace `roles` (as they
 * stand, highest first), or null when it may. Without full authority the roles
 * at or above your own highest one must keep their places at the top.
 */
export function reorderRefusal(
  roles: { id: string; position: number }[],
  order: string[],
  authority: Pick<RoleAuthority, "unlimited" | "canManage" | "top">,
): string | null {
  if (!authority.canManage) return "You do not have permission to manage roles.";
  const ids = new Set(roles.map((role) => role.id));
  if (order.length !== roles.length || new Set(order).size !== order.length || order.some((id) => !ids.has(id))) {
    return "The role list changed; reload and try again.";
  }
  if (authority.unlimited) return null;
  const locked = roles.filter((role) => role.position >= authority.top).map((role) => role.id);
  for (let i = 0; i < locked.length; i++) {
    if (order[i] !== locked[i]) return "You can only move roles below your highest role.";
  }
  return null;
}
