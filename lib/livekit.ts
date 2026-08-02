import { AccessToken } from "livekit-server-sdk";
import { bindings } from "./storage";

/**
 * LiveKit SFU configuration. Everything is optional: until LIVEKIT_URL is set
 * on the deploy (in `.dev.vars`), `livekitConfig()` returns null and voice
 * rooms keep using the peer-to-peer mesh — so landing this code cannot change
 * behaviour on its own.
 */
export function livekitConfig(): {
  url: string;
  apiKey: string;
  apiSecret: string;
} | null {
  const b = bindings();
  const url = b.LIVEKIT_URL?.trim();
  const apiKey = b.LIVEKIT_API_KEY?.trim();
  const apiSecret = b.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export interface LivekitJoin {
  url: string;
  apiKey: string;
  token: string;
}

/**
 * Signs a short-lived access token so a browser can join a LiveKit room for the
 * given Huddle channel. Returns null (rather than throwing) when the SFU is not
 * configured, so callers can fall back to the mesh.
 */
export async function livekitToken(opts: {
  identity: string;
  name: string;
  room: string;
}): Promise<LivekitJoin | null> {
  const cfg = livekitConfig();
  if (!cfg) return null;
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: opts.identity,
    name: opts.name,
  });
  at.addGrant({
    room: opts.room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });
  const token = await at.toJwt();
  return { url: cfg.url, apiKey: cfg.apiKey, token };
}
