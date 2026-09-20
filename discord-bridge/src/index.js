/**
 * Hoffle <-> Discord Bidirectional Bridge
 *
 * Synchronizes messages in real-time between Discord channels and Hoffle channels.
 * - Discord -> Hoffle: forwards chat, attachments, and embeds.
 * - Hoffle -> Discord: streams real-time channel messages into Discord.
 * - Loop prevention: strictly ignores bot echoes and bridged messages.
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
const HUDDLE_URL = (process.env.HUDDLE_URL || "http://127.0.0.1:8730").replace(/\/+$/, "");
const HUDDLE_BASE_PATH = process.env.HUDDLE_BASE_PATH || "/hangout";
const HUDDLE_BOT_TOKEN = process.env.HUDDLE_BOT_TOKEN;
const HUDDLE_DEFAULT_CHANNEL = process.env.HUDDLE_DEFAULT_CHANNEL || "general";
const CHANNEL_MAP_RAW = process.env.DISCORD_TO_HUDDLE_MAP || "";

if (!DISCORD_TOKEN) {
  console.error("[discord-bridge] DISCORD_BOT_TOKEN is required. Set it in .env");
  process.exit(1);
}
if (!HUDDLE_BOT_TOKEN) {
  console.error(
    "[discord-bridge] HUDDLE_BOT_TOKEN is required. Set it to a Hoffle Bot Token.",
  );
  process.exit(1);
}

/**
 * Maps Discord channel (id or name) <-> Hoffle channel (id or name).
 * DISCORD_TO_HUDDLE_MAP=discord_id:huddle_id,discord_name:huddle_name
 */
const discordToHuddleMap = new Map();
const huddleToDiscordMap = new Map();

if (CHANNEL_MAP_RAW.trim()) {
  for (const pair of CHANNEL_MAP_RAW.split(",")) {
    const [discord, huddle] = pair.split(":").map((s) => s && s.trim());
    if (discord && huddle) {
      discordToHuddleMap.set(discord, huddle);
      huddleToDiscordMap.set(huddle, discord);
    }
  }
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

// ---------------------------------------------------------------------------
// Discord -> Hoffle Forwarding
// ---------------------------------------------------------------------------

async function forwardToHoffle(body, channelTarget) {
  try {
    const url = `${HUDDLE_URL}${HUDDLE_BASE_PATH}/api/v1/channels/${encodeURIComponent(channelTarget)}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${HUDDLE_BOT_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // Fallback to legacy bots/messages endpoint
      const legacyUrl = `${HUDDLE_URL}${HUDDLE_BASE_PATH}/api/bots/messages`;
      const fallbackResponse = await fetch(legacyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${HUDDLE_BOT_TOKEN}`,
        },
        body: JSON.stringify({ ...body, channel: channelTarget, channelId: channelTarget }),
      });
      if (!fallbackResponse.ok) {
        const text = await fallbackResponse.text().catch(() => "");
        console.error(`[discord-bridge] Failed to send to Hoffle: ${fallbackResponse.status} ${text}`);
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error("[discord-bridge] Error reaching Hoffle server:", error.message);
    return false;
  }
}

client.on(Events.MessageCreate, async (message) => {
  // Never process bot messages or messages originating from the bridge
  if (message.author.bot) return;
  if (!message.guild) return;

  // Determine destination Hoffle channel
  let huddleChannel = null;
  if (discordToHuddleMap.has(message.channelId)) {
    huddleChannel = discordToHuddleMap.get(message.channelId);
  } else if (discordToHuddleMap.has(message.channel.name)) {
    huddleChannel = discordToHuddleMap.get(message.channel.name);
  } else if (discordToHuddleMap.size === 0) {
    huddleChannel = HUDDLE_DEFAULT_CHANNEL;
  }

  if (!huddleChannel) return;

  const parts = [];
  if (message.content && message.content.trim()) parts.push(message.content.trim());
  for (const attachment of message.attachments.values()) {
    parts.push(attachment.url);
  }
  for (const embed of message.embeds) {
    if (embed.url) parts.push(embed.url);
    else if (embed.title) parts.push(embed.title);
  }

  const content = parts.join("\n").slice(0, 4000);
  if (!content) return;

  const authorName = (message.member && message.member.displayName) || message.author.username;
  const avatarUrl = message.author.displayAvatarURL();

  await forwardToHoffle(
    {
      content,
      username: `${authorName} (Discord)`,
      avatar_url: avatarUrl,
      avatar: "✦",
      link: message.url,
    },
    huddleChannel,
  );
});

// ---------------------------------------------------------------------------
// Hoffle -> Discord Forwarding (SSE Gateway Listener)
// ---------------------------------------------------------------------------

async function listenToHoffleGateway() {
  const eventsUrl = `${HUDDLE_URL}${HUDDLE_BASE_PATH}/api/v1/gateway/events?token=${encodeURIComponent(HUDDLE_BOT_TOKEN)}`;
  console.log(`[discord-bridge] Connecting to Hoffle event gateway at ${eventsUrl}...`);

  try {
    const response = await fetch(eventsUrl, {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bot ${HUDDLE_BOT_TOKEN}`,
      },
    });

    if (!response.ok || !response.body) {
      console.warn(`[discord-bridge] Event stream unavailable (${response.status}). Retrying in 8s...`);
      setTimeout(listenToHoffleGateway, 8000);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    console.log("[discord-bridge] Connected to Hoffle real-time event stream.");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const block of lines) {
        if (!block.trim()) continue;
        const dataMatch = block.match(/(?:^|\n)data:\s*(.+)$/m);
        if (!dataMatch) continue;

        try {
          const event = JSON.parse(dataMatch[1]);
          if (event.t === "MESSAGE_CREATE" && event.d) {
            await handleHoffleMessage(event.d);
          }
        } catch {
          // invalid json, ignore
        }
      }
    }
  } catch (err) {
    console.warn("[discord-bridge] Gateway stream disconnected:", err.message);
  }

  // Auto-reconnect after backoff
  setTimeout(listenToHoffleGateway, 5000);
}

async function handleHoffleMessage(msg) {
  // Loop prevention: ignore messages generated by Discord bridge or bots
  const authorName = msg.author?.username || msg.author?.name || "";
  if (authorName.endsWith("(Discord)") || msg.author?.bot) {
    return;
  }

  const channelId = msg.channel_id || msg.channel;
  if (!channelId) return;

  // Resolve target Discord channel
  let targetDiscord = null;
  if (huddleToDiscordMap.has(channelId)) {
    targetDiscord = huddleToDiscordMap.get(channelId);
  } else if (huddleToDiscordMap.size === 0) {
    // If no explicit map, find general or default
    targetDiscord = HUDDLE_DEFAULT_CHANNEL;
  }

  if (!targetDiscord) return;

  // Find Discord channel in client cache or fetch it
  let discordChannel = null;
  if (/^\d+$/.test(targetDiscord)) {
    discordChannel = await client.channels.fetch(targetDiscord).catch(() => null);
  } else {
    for (const guild of client.guilds.cache.values()) {
      const found = guild.channels.cache.find(
        (c) => c.name.toLowerCase() === targetDiscord.toLowerCase() && c.isTextBased()
      );
      if (found) {
        discordChannel = found;
        break;
      }
    }
  }

  if (!discordChannel || !discordChannel.isTextBased()) {
    return;
  }

  const text = msg.content || msg.text || "";
  if (!text.trim()) return;

  const formatted = `**${authorName}**: ${text}`;
  await discordChannel.send({ content: formatted }).catch((err) => {
    console.error("[discord-bridge] Failed to send message to Discord channel:", err.message);
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

client.once(Events.ClientReady, (readyClient) => {
  console.log(`[discord-bridge] Connected to Discord as ${readyClient.user.tag}`);
  if (discordToHuddleMap.size) {
    console.log("[discord-bridge] Channel mappings (Discord <-> Hoffle):");
    for (const [discord, huddle] of discordToHuddleMap) {
      console.log(`  ${discord} <--> ${huddle}`);
    }
  } else {
    console.log(`[discord-bridge] No mapping set: using default "${HUDDLE_DEFAULT_CHANNEL}".`);
  }

  // Start bidirectional listener
  listenToHoffleGateway();
});

client.on(Events.Error, (err) => console.error("[discord-bridge] Discord client error:", err));
client.on(Events.Warn, (warn) => console.warn("[discord-bridge] Discord client warning:", warn));

console.log("[discord-bridge] Starting Hoffle <-> Discord Bridge...");
client.login(DISCORD_TOKEN);
