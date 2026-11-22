"use client";

import { Headphones, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n-context";
import { apiFetch } from "../lib/client";
import { useModuleOn } from "../lib/modules";
import {
  nextListenStep,
  spotifyTrackUrl,
  type ListenState,
  type LocalSpotify,
} from "@/lib/listen-along";
import type { SpotifyActivity } from "@/lib/users";
import { stripTextStyle } from "@/lib/text-style";

type SpotifyCommand =
  | { action: "play"; trackId: string; positionMs: number }
  | { action: "seek"; positionMs: number }
  | { action: "pause" }
  | { action: "state" };

type Shell = { spotifyControl?: (command: SpotifyCommand) => Promise<LocalSpotify | null> };

function spotifyShell(): Shell["spotifyControl"] | null {
  if (typeof window === "undefined") return null;
  const control = (window as unknown as { huddle?: Shell }).huddle?.spotifyControl;
  return typeof control === "function" ? control : null;
}

/** Starts listening along with someone; the Listen along bar picks it up. */
export function startListenAlong(hostId: string, hostName: string): void {
  window.dispatchEvent(new CustomEvent("hoffle:listen-along", { detail: { hostId, hostName } }));
}

/** Whether this app can play songs in Spotify for you (the desktop app can). */
export function canControlSpotify(): boolean {
  return Boolean(spotifyShell());
}

const TICK_MS = 4000;

/**
 * Listen along (lib/listen-along.ts): while on, every few seconds it reads what
 * the host plays and has this computer's Spotify app play the same song at the
 * same point. Off when you press Stop, put on something else yourself, or the
 * host has played nothing for a while.
 */
export function ListenAlong() {
  const { t } = useI18n();
  const listenOn = useModuleOn("music");
  const [host, setHost] = useState<{ id: string; name: string } | null>(null);
  const [song, setSong] = useState<SpotifyActivity | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const state = useRef<ListenState>({ applied: null, pausedByUs: false });
  const idleSince = useRef(0);

  const stop = (silent = false) => {
    setHost((current) => {
      if (current) {
        void apiFetch("/api/listen", { method: "POST", body: JSON.stringify({ hostId: current.id, on: false }) }).catch(() => undefined);
      }
      return null;
    });
    setSong(null);
    state.current = { applied: null, pausedByUs: false };
    if (!silent) setNotice(null);
  };

  useEffect(() => {
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<{ hostId: string; hostName: string }>).detail;
      if (!detail?.hostId) return;
      state.current = { applied: null, pausedByUs: false };
      idleSince.current = 0;
      setNotice(null);
      setHost({ id: detail.hostId, name: detail.hostName });
      void apiFetch("/api/listen", { method: "POST", body: JSON.stringify({ hostId: detail.hostId, on: true }) }).catch((err) => {
        setNotice(err instanceof Error ? err.message : t("listen.error"));
        setHost(null);
      });
    };
    window.addEventListener("hoffle:listen-along", onStart);
    return () => window.removeEventListener("hoffle:listen-along", onStart);
  }, [t]);

  // Closing Hoffle stops it, so the host's "listening along" list stays true.
  useEffect(() => {
    if (!host) return;
    const leave = () => {
      try {
        void fetch("/hangout/api/listen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostId: host.id, on: false }),
          credentials: "include",
          keepalive: true,
        });
      } catch {
        // The host sees a stale name until you next open Hoffle.
      }
    };
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [host]);

  useEffect(() => {
    if (!host) return;
    let cancelled = false;
    let running = false;
    const control = spotifyShell();

    const tick = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        const data = (await apiFetch(`/api/listen?host=${encodeURIComponent(host.id)}`)) as {
          activity: SpotifyActivity | null;
          serverNow: number;
        };
        if (cancelled) return;
        const offset = data.serverNow - Date.now();
        const activity = data.activity;
        setSong(activity);
        // Nothing played for 10 minutes: they've stopped, so do we.
        if (!activity) {
          idleSince.current ||= Date.now();
          if (Date.now() - idleSince.current > 10 * 60_000) {
            stop(true);
            setNotice(t("listen.ended", { name: stripTextStyle(host.name) }));
            return;
          }
        } else idleSince.current = 0;
        if (!control) return; // The browser can't drive Spotify: the bar offers the song instead.
        const local = await control({ action: "state" }).catch(() => null);
        const step = nextListenStep(activity, local, state.current, Date.now() + offset);
        if (step.do === "play") {
          state.current = { applied: step.trackId, pausedByUs: false };
          await control({ action: "play", trackId: step.trackId, positionMs: step.positionMs });
        } else if (step.do === "seek") {
          await control({ action: "seek", positionMs: step.positionMs });
        } else if (step.do === "pause") {
          state.current = { ...state.current, pausedByUs: true };
          await control({ action: "pause" });
        } else if (step.do === "stop") {
          stop(true);
          setNotice(t("listen.tookOver"));
        }
      } catch (err) {
        if (!cancelled) {
          stop(true);
          setNotice(err instanceof Error ? err.message : t("listen.error"));
        }
      } finally {
        running = false;
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), TICK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host?.id]);

  // Notices fade on their own.
  useEffect(() => {
    if (!notice || host) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice, host]);

  if (!listenOn || (!host && !notice)) return null;
  const name = host ? stripTextStyle(host.name) : "";
  const control = spotifyShell();
  return (
    <div className="listen-bar" role="status" aria-live="polite">
      <Headphones size={16} aria-hidden="true" />
      <div className="listen-text">
        {host ? (
          <>
            <strong>{t("listen.with", { name })}</strong>
            <small>
              {song
                ? song.trackId
                  ? `${song.song} · ${song.artist}`
                  : t("listen.noId", { song: song.song })
                : t("listen.paused", { name })}
            </small>
            {!control && <small>{t("listen.noControl")}</small>}
          </>
        ) : (
          <small>{notice}</small>
        )}
      </div>
      {host && !control && song?.trackId && (
        <a className="listen-open" href={spotifyTrackUrl(song.trackId)} target="_blank" rel="noreferrer">
          {t("listen.open")}
        </a>
      )}
      {host && (
        <button type="button" onClick={() => stop()}>
          {t("listen.stop")}
        </button>
      )}
    </div>
  );
}

/**
 * A "listen along with me" card in chat: the song when it was posted, and a
 * Listen along button that follows whatever the host plays from then on.
 */
export function ListenCard({
  invite,
  userId,
}: {
  invite: { host: { id: string; name: string }; song: string; artist: string; albumArt?: string; trackId: string };
  userId: string;
}) {
  const { t } = useI18n();
  const isHost = invite.host.id === userId;
  const host = stripTextStyle(invite.host.name);
  return (
    <div className="listen-card">
      <div className="listen-card-art" aria-hidden="true">
        {invite.albumArt ? <img src={invite.albumArt} alt="" /> : <Headphones size={20} />}
      </div>
      <div className="listen-card-text">
        <small>{t("listen.card.title", { name: host })}</small>
        <strong>{invite.song}</strong>
        <span>{invite.artist}</span>
      </div>
      {isHost ? (
        <small className="listen-card-note">{t("listen.card.host")}</small>
      ) : (
        <button type="button" className="listen-along-button" onClick={() => startListenAlong(invite.host.id, invite.host.name)}>
          <Headphones size={14} aria-hidden="true" /> {t("listen.button")}
        </button>
      )}
    </div>
  );
}

/**
 * "Join the Jam": a Spotify Jam someone shared (lib/listen-along.ts). In a
 * Jam everyone adds to one queue inside Spotify; Hoffle only carries the
 * invite link, which opens Spotify.
 */
export function JamCard({ invite, userId }: { invite: { host: { id: string; name: string }; url: string }; userId: string }) {
  const { t } = useI18n();
  const isHost = invite.host.id === userId;
  return (
    <div className="listen-card jam-card">
      <div className="listen-card-art" aria-hidden="true">
        <Users size={20} />
      </div>
      <div className="listen-card-text">
        <small>{t("jam.card.title", { name: stripTextStyle(invite.host.name) })}</small>
        <strong>{t("jam.card.what")}</strong>
      </div>
      {isHost ? (
        <small className="listen-card-note">{t("jam.card.host")}</small>
      ) : (
        <a className="listen-along-button" href={invite.url} target="_blank" rel="noreferrer">
          <Users size={14} aria-hidden="true" /> {t("jam.join")}
        </a>
      )}
    </div>
  );
}

/** The profile card's Jam line: "Join the Jam" for others, "End Jam" for you. */
export function ProfileJam({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const { t } = useI18n();
  const [jam, setJam] = useState<{ url: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/listen?jamOf=${encodeURIComponent(userId)}`)
      .then((data) => !cancelled && setJam((data as { jam: { url: string } | null }).jam))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);
  if (!jam) return null;
  if (isSelf) {
    return (
      <button
        type="button"
        className="listen-along-button jam-end"
        onClick={() =>
          void apiFetch("/api/listen", { method: "POST", body: JSON.stringify({ action: "jam-end" }) })
            .then(() => setJam(null))
            .catch(() => undefined)
        }
      >
        <Users size={14} aria-hidden="true" /> {t("jam.end")}
      </button>
    );
  }
  return (
    <a className="listen-along-button" href={jam.url} target="_blank" rel="noreferrer">
      <Users size={14} aria-hidden="true" /> {t("jam.join")}
    </a>
  );
}
