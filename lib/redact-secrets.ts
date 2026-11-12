/**
 * Hides secrets in a slash command before it is shown to a channel.
 *
 * A bot's answer carries the command that asked for it ("mewis used /watch
 * https://…"), and a link pasted into a command can hold a key in its query
 * string: a media server's `api_key`, a signed URL's `token`. The person who
 * ran it meant to play something, not to publish the key to everyone there.
 * The value is replaced and the rest of the link is left readable.
 */
const SECRET_PARAM =
  /([?&#;](?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|token|key|secret|password|passwd|pwd|sig|signature|auth|session(?:id)?|x-amz-signature|x-amz-credential|x-amz-security-token)=)[^&#\s]+/gi;

/** `https://user:pass@host` */
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi;

export function redactSecrets(text: string): string {
  return text.replace(SECRET_PARAM, "$1•••").replace(URL_CREDENTIALS, "$1•••@");
}
