"use client";

import { Gamepad2, Headphones } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n-context";
import { apiFetch } from "../lib/client";
import { useModuleOn } from "../lib/modules";
import { gameKeyForActivity, playGameInfo, type PlayGameId } from "@/lib/play-together";
import { liveActivity, liveSpotify, type ProfileActivity, type PublicUser, type SpotifyActivity } from "@/lib/users";
import { showToast } from "./toast";

interface Detected {
  key: PlayGameId;
  name: string;
}

/** Steam's answer is the best (real app id and name), then the game's mod, then the desktop app. */
type Source = "steam" | "mod" | "desktop";

const STEAM_POLL_MS = 60_000;

function fromActivity(activity: ProfileActivity | null | undefined): Detected | null {
  const live = liveActivity(activity);
  if (!live || live.kind !== "playing") return null;
  const key = gameKeyForActivity(live.name);
  return key ? { key, name: live.name } : null;
}

/**
 * "🎮 Invite to <game>" beside the composer's + button, shown while Hoffle
 * sees you playing something: posts a Play together invite into this chat.
 */
export function GameInviteButton({ channelId, user }: { channelId: string | null; user: PublicUser }) {
  const { t } = useI18n();
  const gamesOn = useModuleOn("games");
  const [found, setFound] = useState<Record<Source, Detected | null>>(() => ({
    steam: null,
    mod: null,
    desktop: fromActivity(user.activity),
  }));
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (source: Source, value: Detected | null) =>
    setFound((current) => (current[source]?.key === value?.key && current[source]?.name === value?.name ? current : { ...current, [source]: value }));

  // The desktop app's own detection (any game on its list).
  useEffect(() => {
    const onActivity = (event: Event) => set("desktop", fromActivity((event as CustomEvent<ProfileActivity | null>).detail));
    window.addEventListener("hoffle:activity-detected", onActivity);
    return () => window.removeEventListener("hoffle:activity-detected", onActivity);
  }, []);

  // A game mod hosting right now (Stardew).
  useEffect(() => {
    const onState = (event: Event) => {
      const play = (event as CustomEvent<Record<string, { party?: unknown } | undefined>>).detail || {};
      set("mod", play.stardew?.party ? { key: "stardew", name: "Stardew Valley" } : null);
    };
    window.addEventListener("hoffle:play-state", onState);
    return () => window.removeEventListener("hoffle:play-state", onState);
  }, []);

  // Steam: whatever Steam game you are in, with its real name. Only works
  // with Steam linked and the Hoffle's Steam key; checks rarely otherwise.
  const steamUsable = useRef(true);
  useEffect(() => {
    if (!gamesOn) return;
    let cancelled = false;
    let timer = 0;
    const check = async () => {
      if (document.visibilityState === "visible") {
        try {
          const data = (await apiFetch("/api/play", { method: "POST", body: JSON.stringify({ action: "detect" }) })) as {
            game: { key: PlayGameId; name: string } | null;
            steamLinked: boolean;
            keyConfigured: boolean;
          };
          if (cancelled) return;
          steamUsable.current = data.steamLinked && data.keyConfigured;
          set("steam", data.game ? { key: data.game.key, name: data.game.name || playGameInfo({ game: data.game.key }).name } : null);
        } catch {
          // Try again next round.
        }
      }
      if (!cancelled) timer = window.setTimeout(() => void check(), steamUsable.current ? STEAM_POLL_MS : 5 * STEAM_POLL_MS);
    };
    void check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [gamesOn]);

  const game = found.steam ?? found.mod ?? found.desktop;
  if (!gamesOn || !channelId || !game) return null;
  const name = playGameInfo({ game: game.key, name: game.name }).name;
  const done = sent === `${channelId}:${game.key}`;

  async function invite() {
    if (!channelId || !game || busy) return;
    setBusy(true);
    try {
      await apiFetch("/api/play", {
        method: "POST",
        body: JSON.stringify({ action: "start", channelId, game: game.key, name }),
      });
      setSent(`${channelId}:${game.key}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("play.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`game-invite-button ${done ? "done" : ""}`}
      onClick={() => void invite()}
      disabled={busy}
      title={t("play.button.title", { game: name })}
      aria-label={t("play.button.title", { game: name })}
    >
      <Gamepad2 size={16} aria-hidden="true" />
      <span>{done ? t("play.button.sent") : t("play.button.invite", { game: name })}</span>
    </button>
  );
}

/**
 * "🎧 Invite to listen along" beside the composer's + button, shown while
 * Hoffle sees you playing a song on Spotify: posts a card inviting the chat
 * to follow your Spotify (listen-along.tsx).
 */
export function ListenInviteButton({ channelId, user }: { channelId: string | null; user: PublicUser }) {
  const { t } = useI18n();
  const musicOn = useModuleOn("music");
  const [song, setSong] = useState<SpotifyActivity | null>(() => liveSpotify(user.spotifyActivity));
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onSong = (event: Event) => setSong((event as CustomEvent<SpotifyActivity | null>).detail ?? null);
    window.addEventListener("hoffle:spotify-detected", onSong);
    return () => window.removeEventListener("hoffle:spotify-detected", onSong);
  }, []);

  if (!musicOn || !channelId || !song) return null;
  const done = sent === `${channelId}:${song.song}`;

  async function invite() {
    if (!channelId || !song || busy) return;
    setBusy(true);
    try {
      await apiFetch("/api/listen", { method: "POST", body: JSON.stringify({ action: "invite", channelId }) });
      setSent(`${channelId}:${song.song}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("listen.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`game-invite-button listen ${done ? "done" : ""}`}
      onClick={() => void invite()}
      disabled={busy}
      title={t("listen.invite.title", { song: song.song })}
      aria-label={t("listen.invite.title", { song: song.song })}
    >
      <Headphones size={16} aria-hidden="true" />
      <span>{done ? t("play.button.sent") : t("listen.invite.button")}</span>
    </button>
  );
}
