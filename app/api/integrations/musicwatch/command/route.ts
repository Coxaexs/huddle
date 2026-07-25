import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function baseUrl(): URL {
  return new URL(
    bindings().MUSICWATCH_BASE_URL?.trim() || "https://deeppixel.online",
  );
}

function helperBaseUrl(): URL {
  return new URL(
    bindings().MUSIC_HELPER_BASE_URL?.trim() || "http://127.0.0.1:8731",
  );
}

/** Logs into the music bot dashboard and returns its session cookie. */
async function botSession(): Promise<string> {
  const password = bindings().MUSICWATCH_PASSWORD;
  if (!password) throw new Error("Music dashboard access is not configured.");

  const response = await fetch(new URL("/api/session", baseUrl()), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error("Music dashboard login failed.");

  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Music dashboard returned no session.");
  return cookie;
}

async function botFetch(
  path: string,
  cookie: string,
  init?: RequestInit,
): Promise<Record<string, any>> {
  const response = await fetch(new URL(path, baseUrl()), {
    ...init,
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  const raw = await response.text();
  let data: Record<string, any> = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = {};
  }

  if (!response.ok) {
    const detail =
      typeof data.error === "string" && data.error.trim()
        ? data.error
        : raw.trim() || `Music bot returned ${response.status}.`;
    throw new Error(detail);
  }
  return data;
}

function stateSummary(state: Record<string, any>): string {
  const current = state.current;
  return `Now playing: ${
    current
      ? `${current.title || "Unknown track"}${current.artist ? ` — ${current.artist}` : ""}`
      : "nothing"
  }. Queue: ${state.queue?.length || 0}. Volume: ${state.volume ?? 0}%. Loop: ${
    state.loop || "off"
  }.`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { command?: string };
  const [rawName, ...parts] = (body.command?.trim().slice(0, 1000) || "").split(
    /\s+/,
  );
  const name = rawName.replace(/^\//, "").toLowerCase();
  const value = parts.join(" ").trim();

  try {
    if (name === "join") {
      return Response.json({
        text: "Huddle playback is browser-based, so no voice join is required. Use `/play song name or URL`, then use the audio controls in the bot message. To make the Discord bot join a Discord voice channel, run `/join` inside Discord.",
      });
    }
    if (name === "disconnect") {
      return Response.json({
        text: "Use `/disconnect` in Discord for the connected voice channel. Huddle can control playback, but Discord decides which voice channel the bot joins.",
      });
    }

    const cookie = await botSession();
    const guilds = ((await botFetch("/api/guilds", cookie)).guilds ||
      []) as Array<Record<string, any>>;
    const connectedGuild = guilds.find((item) => item.connected);
    const guild = connectedGuild || guilds[0];
    if (!guild) throw new Error("The music bot is not connected to a Discord server.");
    const guildPath = `/api/guilds/${encodeURIComponent(guild.id)}`;

    if (name === "play") {
      if (!value) throw new Error("Use `/play song name or URL`.");

      // No Discord voice connection: resolve the track ourselves and hand the
      // stream to the browser.
      if (!connectedGuild) {
        const helperResponse = await fetch(new URL("/resolve", helperBaseUrl()), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: value }),
          signal: AbortSignal.timeout(45000),
        });
        const helper = (await helperResponse.json().catch(() => ({}))) as Record<
          string,
          any
        >;
        if (!helperResponse.ok || !helper.audio_url) {
          throw new Error(helper.error || "The Huddle music resolver failed.");
        }
        return Response.json({
          text: `Ready to play ${helper.title || value}${
            helper.artist ? ` — ${helper.artist}` : ""
          } in Huddle.`,
          audio: helper.audio_url,
          link: helper.page_url,
        });
      }

      const result = await botFetch(`${guildPath}/play`, cookie, {
        method: "POST",
        body: JSON.stringify({ query: value }),
      });
      return Response.json({
        text: `Added ${String(result.first_title || value)} to ${guild.name}.`,
      });
    }

    if (name === "queue" || name === "nowplaying" || name === "np") {
      const state = await botFetch(guildPath, cookie);
      const queue =
        name === "queue" && state.queue?.length
          ? ` Next: ${state.queue
              .slice(0, 8)
              .map(
                (song: Record<string, any>, index: number) =>
                  `${index + 1}. ${song.title || "Unknown"}`,
              )
              .join(" · ")}`
          : "";
      return Response.json({ text: `${stateSummary(state)}${queue}` });
    }

    if (name === "lyrics") {
      const lyrics = await botFetch(`${guildPath}/lyrics`, cookie);
      const excerpt = ((lyrics.lines || []) as Array<[number, string]>)
        .slice(0, 8)
        .map((line) => line[1])
        .filter(Boolean)
        .join(" / ");
      return Response.json({
        text: excerpt
          ? `${String(lyrics.track || "Lyrics")}: ${excerpt}`
          : "No synced lyrics are available for the current track.",
      });
    }

    if (name === "playlists") {
      const playlists = ((await botFetch(`${guildPath}/playlists`, cookie))
        .playlists || []) as Array<Record<string, any>>;
      return Response.json({
        text: playlists.length
          ? `Playlists: ${playlists
              .map((item) => `${item.name} (${item.count || 0})`)
              .join(" · ")}`
          : "There are no saved playlists yet.",
      });
    }

    const actionBody: Record<string, any> = {
      action: new Set([
        "pause",
        "resume",
        "skip",
        "previous",
        "stop",
        "shuffle",
        "clear",
      ]).has(name)
        ? name
        : "",
    };

    if (name === "volume") {
      actionBody.action = "volume";
      actionBody.level = Number(value);
    } else if (name === "loop") {
      actionBody.action = "loop";
      actionBody.mode = value || "off";
    } else if (name === "remove") {
      actionBody.action = "remove";
      actionBody.index = Math.max(0, Number(value) - 1);
    } else if (name === "seek") {
      actionBody.action = "seek";
      actionBody.seconds = Number(value);
    } else if (name === "filter") {
      actionBody.action = "filter";
      actionBody.preset = value || "off";
    } else if (name === "crossfade") {
      actionBody.action = "crossfade";
      actionBody.seconds = Number(value);
    } else if (name === "sleep") {
      actionBody.action = "sleep_timer";
      actionBody.minutes = Number(value);
    } else if (["autoplay", "automix", "karaoke"].includes(name)) {
      actionBody.action = name;
      actionBody.enabled = !["off", "false", "0"].includes(value.toLowerCase());
    }

    if (!actionBody.action) {
      throw new Error(
        "Music commands: /play, /pause, /resume, /skip, /previous, /stop, /queue, /nowplaying, /volume, /loop, /shuffle, /clear, /remove, /seek, /lyrics, /playlists, /filter, /crossfade, /autoplay, /automix, /karaoke, /sleep, /watch, /reels.",
      );
    }

    const state = await botFetch(`${guildPath}/action`, cookie, {
      method: "POST",
      body: JSON.stringify(actionBody),
    });
    return Response.json({
      text: `${name} updated on ${guild.name}. ${stateSummary(state)}`,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Music command failed.",
      },
      { status: 502 },
    );
  }
}
