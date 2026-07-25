import { env } from "cloudflare:workers";

export interface HuddleBindings {
  DB?: D1Database;
  UPLOADS?: R2Bucket;
  HUB?: DurableObjectNamespace;
  BOT_TOKEN?: string;
  MUSICWATCH_BASE_URL?: string;
  MUSICWATCH_PUBLIC_URL?: string;
  MUSICWATCH_PASSWORD?: string;
  MUSIC_HELPER_BASE_URL?: string;
  DND_BASE_URL?: string;
  DND_PUBLIC_URL?: string;
  /** JSON array of RTCIceServer entries; falls back to public STUN. */
  HUDDLE_ICE_SERVERS?: string;
}

export function bindings(): HuddleBindings {
  return env as unknown as HuddleBindings;
}

export interface StoredMessage {
  id: string;
  channel: string;
  channel_id?: string | null;
  user_id?: string | null;
  author: string;
  avatar: string;
  color: string;
  content: string;
  attachment_key: string | null;
  is_bot: number;
  created_at: string;
  link?: string | null;
  action_label?: string | null;
  audio_url?: string | null;
  kind?: string | null;
  payload?: string | null;
}
