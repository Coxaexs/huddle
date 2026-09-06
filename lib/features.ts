/**
 * Feature flags for Huddle.
 *
 * Flags live in the Worker environment (wrangler.jsonc `vars` or platform
 * secrets), so a feature can be switched off per host without deleting code.
 * Everything is enabled by default when the flag is missing.
 */

export interface FeatureFlags {
  /** The consent-gated D&D session recorder (director UI, /record, portal). */
  recordSessions: boolean;
}

export function featureFlags(env: {
  FEATURE_RECORD_SESSIONS?: string;
}): FeatureFlags {
  return {
    recordSessions:
      env.FEATURE_RECORD_SESSIONS == null ||
      !["0", "false", "off", "no"].includes(
        env.FEATURE_RECORD_SESSIONS.trim().toLowerCase(),
      ),
  };
}
