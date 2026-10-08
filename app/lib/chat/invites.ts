/** Finding Hangout invite codes in message text. */

/** Extracts server invite codes from text that contain hangout invite links or codes. */
export function extractInviteCodes(text: string): string[] {
  if (!text) return [];
  const inviteRegex = /(?:https?:\/\/[^\s/?#]+|[a-zA-Z0-9.-]+)?\/hangout\?(?:(?:servercode|code|invite)=)?([A-Za-z0-9_-]{4,24})\b/gi;
  const codes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = inviteRegex.exec(text)) !== null) {
    const code = match[1]?.toUpperCase();
    if (code && !codes.includes(code)) {
      codes.push(code);
    }
  }
  return codes;
}
