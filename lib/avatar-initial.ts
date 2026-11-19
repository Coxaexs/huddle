/**
 * The letter tile shows the first letter of a name. Accounts start with the
 * first letter of their display name as `avatar`; with a per-server nickname
 * the tile should follow the name people actually see there, so "Deniz" is a
 * D even when the account is called Claude. A letter or emoji someone chose
 * on purpose (anything other than that automatic initial) is left alone.
 */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0] || "";
  return first.toLocaleUpperCase() || "?";
}

export function avatarForShownName(avatar: string, accountName: string, shownName: string | null | undefined): string {
  if (!shownName || shownName === accountName) return avatar;
  if (avatar !== initialOf(accountName) && avatar !== accountName.slice(0, 1).toUpperCase()) return avatar;
  return initialOf(shownName);
}
