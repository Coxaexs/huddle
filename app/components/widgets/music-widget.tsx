"use client";

import { proxiedImage } from "@/app/lib/image-proxy";
import { useEffect, useState, type FormEvent } from "react";
import { Globe, Music2, Pause, Play, Plus, SkipForward } from "lucide-react";
import { apiFetch } from "@/app/lib/client";
import { useI18n } from "@/app/lib/i18n-context";
import { heard, playbackPosition } from "@/lib/protocol";
import type { WidgetArea, WidgetSize } from "@/lib/layout-prefs";
import { useWidgetHost } from "./widget-host";
import { openWebView } from "./web-view";

function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The music bot's widget: what your voice room hears, play/pause, skip, a box
 * to queue a song next, and the bot's dashboard in a web view. Commands go
 * through /api/music/command like the slash commands do, so the DJ booth
 * (which owns playback while it is on air) gets them too. In the call view a
 * large one is a single wide line beside the call controls.
 */
export function MusicWidget({ size, area }: { size: WidgetSize; area?: WidgetArea }) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const [, setTick] = useState(0);
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const room = host.voiceChannelId;
  const elsewhere = room
    ? null
    : host.voiceRooms.find((candidate) => host.players[candidate.id]?.track) ?? null;
  const state = heard(host.players[room ?? elsewhere?.id ?? ""] ?? null);
  const track = state?.track ?? null;
  const playing = Boolean(track && !state?.paused);

  useEffect(() => {
    if (!playing || size === "small") return;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [playing, size]);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  const run = async (command: string) => {
    if (!room || busy) return;
    setBusy(true);
    try {
      const data = await apiFetch<{ text?: string }>("/api/music/command", {
        method: "POST",
        body: JSON.stringify({ command, voiceChannelId: room, textChannelId: null, silent: true }),
      });
      if (command.startsWith("/play") && data.text) setNote(data.text);
    } catch (error) {
      setNote(error instanceof Error ? error.message : t("widget.failed"));
    } finally {
      setBusy(false);
    }
  };

  const queue = (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    setQuery("");
    setAsking(false);
    void run(`${track ? "/playnext" : "/play"} ${text}`);
  };

  const openDashboard = async () => {
    const target = room ?? elsewhere?.id ?? host.voiceRooms[0]?.id;
    if (!target) return;
    try {
      const { url } = await apiFetch<{ url: string }>("/api/integrations/musicwatch/web-link", {
        method: "POST",
        body: JSON.stringify({ voiceChannelId: target }),
      });
      openWebView({ url, title: "Music + Watch" });
    } catch (error) {
      setNote(error instanceof Error ? error.message : t("widget.failed"));
    }
  };

  const duration = track?.duration ? track.duration * 1000 : 0;
  const position = state && track ? Math.min(playbackPosition(state), duration || Infinity) : 0;
  const progress = duration ? Math.min(100, (position / duration) * 100) : 0;
  const controls = room && track && (
    <span className="mw-controls">
      <button
        type="button"
        className="mw-btn mw-btn-main"
        disabled={busy}
        onClick={() => void run(playing ? "/pause" : "/resume")}
        title={playing ? t("widget.music.pause") : t("widget.music.play")}
        aria-label={playing ? t("widget.music.pause") : t("widget.music.play")}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button
        type="button"
        className="mw-btn"
        disabled={busy}
        onClick={() => void run("/skip")}
        title={t("widget.music.skip")}
        aria-label={t("widget.music.skip")}
      >
        <SkipForward size={14} />
      </button>
    </span>
  );
  const queueBox = room && (
    <form className="mw-queue" onSubmit={queue}>
      <Plus size={13} aria-hidden="true" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={track ? t("widget.music.queueNext") : t("widget.music.queueAdd")}
        aria-label={track ? t("widget.music.queueNext") : t("widget.music.queueAdd")}
        maxLength={300}
        autoFocus={asking}
        onBlur={() => !query && setAsking(false)}
      />
    </form>
  );
  const webButton = host.voiceRooms.length > 0 && (
    <button
      type="button"
      className="mw-btn"
      onClick={() => void openDashboard()}
      title={t("widget.openWebTitle", { name: "Music + Watch" })}
      aria-label={t("widget.openWebTitle", { name: "Music + Watch" })}
    >
      <Globe size={14} />
    </button>
  );
  const subtitle = track
    ? elsewhere
      ? t("widget.music.playingIn", { room: elsewhere.name })
      : track.artist || ""
    : room
      ? t("widget.music.idle")
      : t("widget.music.joinFirst");
  const join = elsewhere && (
    <button type="button" className="mw-join" onClick={() => host.joinVoice(elsewhere.id)}>
      {t("widget.music.join")}
    </button>
  );
  const art = track?.thumbnail ? (
    <img className="mw-art" src={proxiedImage(track.thumbnail)} alt="" loading="lazy" />
  ) : (
    <span className="mw-art mw-art-empty" aria-hidden="true"><Music2 size={size === "small" ? 13 : 18} /></span>
  );

  if (size === "small") {
    return (
      <div className="mw mw-small" title={track ? `${track.title} · ${track.artist}` : subtitle}>
        {art}
        {asking ? (
          queueBox
        ) : (
          <span className="mw-line">
            <strong>{track?.title || t("widget.music")}</strong>
            {!track && <small>{subtitle}</small>}
          </span>
        )}
        {controls}
        {room && !asking && (
          <button
            type="button"
            className="mw-btn"
            onClick={() => setAsking(true)}
            title={track ? t("widget.music.queueNext") : t("widget.music.queueAdd")}
            aria-label={track ? t("widget.music.queueNext") : t("widget.music.queueAdd")}
          >
            <Plus size={14} />
          </button>
        )}
        {join}
      </div>
    );
  }

  if (area === "call") {
    return (
      <div className="mw mw-wide">
        {art}
        <span className="mw-text">
          <strong title={track?.title}>{track?.title || t("widget.music")}</strong>
          <small>{subtitle}</small>
        </span>
        {track && duration > 0 && (
          <div className="mw-progress" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
            <small>{clock(position)}</small>
            <small>{clock(duration)}</small>
          </div>
        )}
        {controls}
        {join}
        {queueBox}
        {webButton}
        {note && <span className="mw-note mw-wide-note" role="status">{note}</span>}
      </div>
    );
  }

  const upNext = state?.queue ?? [];
  return (
    <div className={`mw mw-${size}`}>
      <div className="mw-top">
        {art}
        <span className="mw-text">
          <strong title={track?.title}>{track?.title || t("widget.music")}</strong>
          <small>{subtitle}</small>
        </span>
      </div>
      {track && duration > 0 && (
        <div className="mw-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
          <small>{clock(position)}</small>
          <small>{clock(duration)}</small>
        </div>
      )}
      <div className="mw-row">
        {controls}
        {join}
        <span className="mw-spacer" />
        {webButton}
      </div>
      {queueBox}
      {note && <p className="mw-note">{note}</p>}
      {size === "large" && upNext.length > 0 && (
        <div className="mw-next">
          <span className="mw-next-label">{t("widget.music.upNext")}</span>
          <ol>
            {upNext.slice(0, 4).map((item) => (
              <li key={item.id}>
                <span>{item.title}</span>
                <small>{item.artist}</small>
              </li>
            ))}
          </ol>
          {upNext.length > 4 && <small className="mw-more">{t("widget.music.more", { count: upNext.length - 4 })}</small>}
        </div>
      )}
    </div>
  );
}
