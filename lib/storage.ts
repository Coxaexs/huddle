import { env } from "cloudflare:workers";

export interface HuddleBindings {
  DB?: D1Database;
  UPLOADS?: R2Bucket;
  HUB?: DurableObjectNamespace;
  /** Durable Object holding connected Discord-compatible bot sockets. */
  DISCORD_GATEWAY?: DurableObjectNamespace;
  BOT_TOKEN?: string;
  /** When set, the first account must present this code too. */
  BOOTSTRAP_CODE?: string;
  MUSICWATCH_BASE_URL?: string;
  MUSICWATCH_PUBLIC_URL?: string;
  MUSICWATCH_PASSWORD?: string;
  MUSIC_HELPER_BASE_URL?: string;
  DND_BASE_URL?: string;
  DND_PUBLIC_URL?: string;
  /** Host-side recorder control endpoint; never returned to browsers. */
  RECORDER_SERVICE_URL?: string;
  /** Shared bearer secret for Huddle ↔ recorder-service callbacks. */
  RECORDER_SERVICE_TOKEN?: string;
  /** Set to "0"/"false"/"off" to disable the D&D session recorder feature. */
  FEATURE_RECORD_SESSIONS?: string;
  /** JSON array of RTCIceServer entries; falls back to public STUN. */
  HUDDLE_ICE_SERVERS?: string;
  /** "1" lets users point phone notifications at LAN/compose-network ntfy servers. */
  HUDDLE_PUSH_ALLOW_PRIVATE?: string;
  /** Optional: enables GIF and sticker search (Klipy) in the composer. */
  KLIPY_API_KEY?: string;
  /** Optional: answers /ask with Claude, falling back to Gemini when that is set too. */
  ANTHROPIC_API_KEY?: string;
  /** Claude model for /ask. Default claude-haiku-5-5. */
  ANTHROPIC_MODEL?: string;
  /** Optional: enables /ask (Gemini free tier). */
  GEMINI_API_KEY?: string;
  /** Comma-separated Gemini models for /ask, tried in order. */
  GEMINI_MODEL?: string;
  /** Instance-wide /ask answers per day; keeps a free key inside its quota. */
  AI_DAILY_LIMIT?: string;
  /** Last.fm API key for live scrobbler integration. */
  LASTFM_API_KEY?: string;
  LASTFM_SECRET?: string;
  /** LiveKit SFU server WebSocket URL (e.g. wss://host/livekit or ws://host:7880) */
  LIVEKIT_URL?: string;
  /** LiveKit API Key for minting room tokens */
  LIVEKIT_API_KEY?: string;
  /** LiveKit API Secret for minting room tokens */
  LIVEKIT_API_SECRET?: string;
  /** Public origin for links in mail, e.g. "https://chat.hoffle.online". */
  PUBLIC_URL?: string;
  /** Resend API key for password-reset mail; without it links are only logged. */
  RESEND_API_KEY?: string;
  /** Sender for outgoing mail, e.g. "Hoffle <noreply@hoffle.online>". */
  MAIL_FROM?: string;
}

let testBindings: HuddleBindings | null = null;

export function setBindings(b: HuddleBindings | null) {
  testBindings = b;
}

export function bindings(): HuddleBindings {
  if (testBindings) return testBindings;
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
  pinned_at?: string | null;
  pinned_by?: string | null;
  deleted_at?: string | null;
  reply_to?: string | null;
  edited_at?: string | null;
  /** JSON array of extra R2 keys beyond `attachment_key`. */
  attachments?: string | null;
  /** Set on thread replies: the id of the message that started the thread. */
  thread_id?: string | null;
  /** On a bot answer to a slash command: the command run and who ran it. */
  command_text?: string | null;
  command_by?: string | null;
}
