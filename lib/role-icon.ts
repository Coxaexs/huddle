/**
 * Role icons: a small picture shown beside the names of a role's members.
 * Either a short emoji or an image uploaded to Hoffle; outside links are
 * refused, since every member's browser would fetch them.
 */

import { isSafeProfileImage } from "./users";

export type RoleIconResult = { ok: true; icon: string | null } | { ok: false; error: string };

/** True when an icon is an uploaded image rather than emoji text. */
export function roleIconIsImage(icon: string | null | undefined): boolean {
  return Boolean(icon && icon.startsWith("/"));
}

export function normalizeRoleIcon(value: unknown): RoleIconResult {
  if (value === null || value === undefined) return { ok: true, icon: null };
  if (typeof value !== "string") return { ok: false, error: "A role icon must be an emoji or an image." };
  const icon = value.trim();
  if (!icon) return { ok: true, icon: null };
  if (icon.startsWith("/")) {
    return isSafeProfileImage(icon)
      ? { ok: true, icon }
      : { ok: false, error: "Upload the role icon image to Hoffle first." };
  }
  // One emoji can be several code points (skin tones, ZWJ families, flags).
  if ([...icon].length > 8 || /[\s<>"'`]/.test(icon) || /[A-Za-z0-9]/.test(icon)) {
    return { ok: false, error: "A role icon is a single emoji or an uploaded image." };
  }
  return { ok: true, icon };
}
