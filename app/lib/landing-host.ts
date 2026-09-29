/**
 * The hosts that show the public landing page instead of the chat app. Keep in
 * step with LANDING_DOMAINS in worker/index.ts, which routes "/" for them.
 */
const LANDING_HOSTS = new Set([
  "hoffle.online",
  "www.hoffle.online",
  "hoffle.com",
  "www.hoffle.com",
]);

export function isLandingHost(host: string | null | undefined): boolean {
  return LANDING_HOSTS.has((host || "").split(":")[0].toLowerCase());
}
