/**
 * Huddle Discord Bridge
 *
 * A standalone Discord bot that forwards Discord messages into Huddle channels.
 * One-way only: Discord → Huddle (never Huddle → Discord).
 *
 * Setup:
 *   1. Create a Discord application at https://discord.com/developers/applications
 *   2. Enable the Message Content Intent (Bot → Privileged Gateway Intents)
 *   3. Invite the bot to your server with "Read Messages" + "Read Message History"
 *   4. Copy .env.example to .env and fill in the values
 *   5. npm install && npm start
 *
 * Channel mapping is configured in .env:
 *   DISCORD_TO_HUDDLE_MAP=discord_channel_id_1:huddle_channel_id_1,discord_channel_id_2:huddle_channel_id_2
 * Or by channel name:
 *   DISCORD_TO_HUDDLE_MAP=general:general,memes:memes
 *
 * If no mapping is provided, all messages from all channels are forwarded to
 * the Huddle channel named "general" (or the HUDDLE_DEFAULT_CHANNEL env var).
 */
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} from "discord.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const HUDDLE_URL = process.env.HUDDLE_URL || "http://127.0.0.1:8730";
const HUDDLE_BASE_PATH = process.env.HUDDLE_BASE_PATH || "/hangout";
const HUDDLE_BOT_TOKEN = process.env.HUDDLE_BOT_TOKEN;
const HUDDLE_DEFAULT_CHANNEL =
  process.env.HUDDLE_DEFAULT_CHANNEL || "general";
const CHANNEL_MAP_RAW = process.env.DISCORD_TO_HUDDLE_MAP || "";

if (!DISCORD_TOKEN) {
  console.error("[discord-bridge] DISCORD_BOT_TOKEN is required. Set it in .env");
  process.exit(1);
}
if (!HUDDLE_BOT_TOKEN) {
  console.error(
    "[discord-bridge] HUDDLE_BOT_TOKEN is required. Set it to Huddle's BOT_TOKEN (from .dev.vars).",
  );
  process.exit(1);
}

/** Resolves a Discord channel id or name to a Huddle channel id or name. */
function parseChannelMap(raw) {
  const map = new Map();
  if (!raw.trim()) return map;
  for (const pair of raw.split(",")) {
    const [discord, huddle] = pair.split(":").map((s) => s && s.trim());
    if (discord && huddle) map.set(discord, huddle);
  }
  return map;
}

const channelMap = parseChannelMap(CHANNEL_MAP_RAW);

// ---------------------------------------------------------------------------
// Huddle API client
// ---------------------------------------------------------------------------

/**
 * Posts a message into a Huddle channel via the bot messages API.
 * Returns true on success, false on failure.
 */
async function forwardToHuddle(body) {
  try {
    const url = `${HUDDLE_URL}${HUDDLE_BASE_PATH}/api/bots/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HUDDLE_BOT_TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(
        `[discord-bridge] Huddle API returned ${response.status}: ${text}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("[discord-bridge] Failed to reach Huddle:", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Message formatting
// ---------------------------------------------------------------------------

/**
 * Converts a Discord message into the body to send to Huddle.
 * - The author's Discord display name is prefixed so Huddle users know the source.
 * - Attachments are included as links.
 * - Embeds (link previews, etc.) are included as links.
 */
function formatMessage(message) {
  // Skip empty messages (e.g. messages with only attachments that failed to load)
  const parts = [];
  if (message.content && message.content.trim()) parts.push(message.content.trim());

  // Append attachment URLs so Huddle users can see them
  for (const attachment of message.attachments.values()) {
    parts.push(attachment.url);
  }

  // Append embed URLs (link previews, video embeds, etc.)
  for (const embed of message.embeds) {
    if (embed.url) parts.push(embed.url);
    else if (embed.title) parts.push(embed.title);
  }

  const content = parts.join("\n").slice(0, 4000);
  if (!content) return null;

  const authorName =
    (message.member && message.member.displayName) ||
    message.author.username;

  return {
    content,
    channel: undefined, // Set by the caller based on the channel map
    name: `${authorName} (Discord)`,
    avatar: "✦",
    link: message.url,
  };
}

// ---------------------------------------------------------------------------
// Discord client
// ---------------------------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(
    `[discord-bridge] Connected to Discord as ${readyClient.user.tag}`,
  );
  if (channelMap.size) {
    console.log("[discord-bridge] Channel mapping:");
    for (const [discord, huddle] of channelMap) {
      console.log(`  ${discord} → ${huddle}`);
    }
  } else {
    console.log(
      `[discord-bridge] No channel map configured — forwarding all channels to "${HUDDLE_DEFAULT_CHANNEL}".`,
    );
  }
});

client.on(Events.MessageCreate, async (message) => {
  // Ignore our own messages and messages from other bots.
  if (message.author.bot) return;

  // Only process messages from guilds (servers), not DMs.
  if (!message.guild) return;

  // Determine the target Huddle channel.
  let huddleChannel;
  if (channelMap.has(message.channelId)) {
    huddleChannel = channelMap.get(message.channelId);
  } else if (channelMap.has(message.channel.name)) {
    huddleChannel = channelMap.get(message.channel.name);
  } else if (channelMap.size > 0) {
    // A map is configured but this channel isn't in it — skip.
    return;
  } else {
    // No map at all — use the default channel.
    huddleChannel = HUDDLE_DEFAULT_CHANNEL;
  }

  const body = formatMessage(message);
  if (!body) return;
  body.channel = huddleChannel;

  await forwardToHuddle(body);
});

client.on(Events.Error, (error) => {
  console.error("[discord-bridge] Discord client error:", error);
});

client.on(Events.Warn, (warning) => {
  console.warn("[discord-bridge] Discord client warning:", warning);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

console.log("[discord-bridge] Starting Discord bridge bot...");
client.login(DISCORD_TOKEN);