"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Clapperboard,
  Play,
  Pause,
  Square,
  RefreshCw,
  Settings,
  Users,
  Video,
  Plus,
  Loader2,
  ArrowLeft,
  User,
  Upload,
} from "lucide-react";
import type { RecordingState, RecordingScene } from "@/lib/protocol";
import type { CharacterPresentation } from "@/lib/protocol";
import type { PublicServer } from "@/lib/servers";
import type { PublicUser } from "@/lib/users";
import { apiFetch, basePath } from "../lib/client";

const SCENES: Array<{ id: RecordingScene; label: string }> = [
  { id: "party", label: "Party" },
  { id: "speaker", label: "Speaker" },
  { id: "battlemap", label: "Battlemap" },
  { id: "split", label: "Split" },
  { id: "intermission", label: "Intermission" },
];

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return [h, m, r].map((n) => String(n).padStart(2, "0")).join(":");
}

function statusLabel(status: RecordingState["status"]): string {
  const map: Record<string, string> = {
    "awaiting-consent": "Awaiting consent",
    countdown: "Starting…",
    recording: "● Rec",
    paused: "Paused",
    finalizing: "Finalizing",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return map[status] || status;
}

export function RecordingsPortal() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [servers, setServers] = useState<PublicServer[]>([]);
  const [recordings, setRecordings] = useState<RecordingState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);

  // New-recording settings.
  const [serverId, setServerId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [title, setTitle] = useState("");
  const [campaign, setCampaign] = useState("");
  const [episode, setEpisode] = useState("");
  const [resolution, setResolution] = useState("1920x1080");
  const [frameRate, setFrameRate] = useState("30");
  const [theme, setTheme] = useState("tavern");
  const [separateAudio, setSeparateAudio] = useState(false);
  const [retentionDays, setRetentionDays] = useState("90");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const voiceChannels = useMemo(
    () =>
      servers
        .find((s) => s.id === serverId)
        ?.channels.filter((c) => c.kind === "voice") || [],
    [servers, serverId],
  );

  async function refresh() {
    try {
      const data = await apiFetch<{ recordings: RecordingState[] }>(
        "/api/recordings/list",
      );
      setRecordings(data.recordings || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load recordings.");
    }
  }

  useEffect(() => {
    Promise.all([
      apiFetch<{ user: PublicUser | null }>("/api/auth/session"),
      apiFetch<{ servers: PublicServer[] }>("/api/servers"),
    ])
      .then(async ([session, serversData]) => {
        setUser(session.user);
        setServers(serversData.servers || []);
        if (serversData.servers?.[0]) {
          setServerId(serversData.servers[0].id);
          const voice =
            serversData.servers[0].channels.find((c) => c.kind === "voice");
          if (voice) setChannelId(voice.id);
        }
        await refresh();
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not load the portal."),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Keep active sessions fresh.
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function act(recording: RecordingState, action: string) {
    setBusy(true);
    try {
      await apiFetch("/api/recordings", {
        method: "POST",
        body: JSON.stringify({ action, sessionId: recording.id }),
      });
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Control failed.");
    } finally {
      setBusy(false);
    }
  }

  async function startNew(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setBusy(true);
    try {
      const data = await apiFetch<{ recording: RecordingState }>(
        "/api/recordings",
        {
          method: "POST",
          body: JSON.stringify({
            action: "setup",
            channelId,
            title,
            campaign: campaign || undefined,
            episodeNumber: episode ? Number(episode) : undefined,
            resolution,
            frameRate: Number(frameRate),
            theme,
            separateAudio,
            retentionDays: Number(retentionDays),
            automaticDirection: true,
          }),
        },
      );
      setShowNew(false);
      setTitle("");
      setCampaign("");
      setEpisode("");
      setNotice("Recording session created — awaiting consent.");
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not set up recording.");
    } finally {
      setBusy(false);
    }
  }

  /** Uploads an image and returns its upload key for the character card. */
  async function uploadImage(file: File): Promise<string | null> {
    try {
      const form = new FormData();
      form.append("file", file);
      const uploaded = await apiFetch<{ key: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      return uploaded.key;
    } catch {
      setNotice("Image upload failed.");
      return null;
    }
  }

  if (loading) {
    return (
      <div className="recordings-portal">
        <div className="portal-loading">
          <Loader2 size={28} className="animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="recordings-portal">
        <div className="portal-card portal-empty">
          <p>Sign in to Huddle to manage recordings.</p>
          <a className="portal-btn" href={`${basePath}/`}>
            <ArrowLeft size={16} /> Go to Huddle
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="recordings-portal">
      <header className="portal-head">
        <div className="portal-title">
          <Clapperboard size={22} />
          <div>
            <h1>Recordings</h1>
            <span>{recordings.length} session(s)</span>
          </div>
        </div>
        <div className="portal-actions">
          <button className="portal-btn" onClick={() => void refresh()}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="portal-btn primary" onClick={() => setShowNew((v) => !v)}>
            <Plus size={16} /> New recording
          </button>
        </div>
      </header>

      {notice && (
        <div className="portal-notice" onClick={() => setNotice("")}>
          {notice} <span>×</span>
        </div>
      )}
      {error && (
        <div className="portal-notice error" onClick={() => setError("")}>
          {error} <span>×</span>
        </div>
      )}

      {showNew && (
        <form className="portal-card portal-new" onSubmit={startNew}>
          <h2>Start a recording</h2>
          <div className="portal-form-grid">
            <label>
              <span>Server</span>
              <select
                value={serverId}
                onChange={(e) => {
                  setServerId(e.target.value);
                  const s = servers.find((x) => x.id === e.target.value);
                  const v = s?.channels.find((c) => c.kind === "voice");
                  setChannelId(v?.id || "");
                }}
              >
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Voice room</span>
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                {voiceChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Session title"
                required
              />
            </label>
            <label>
              <span>Campaign</span>
              <input
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="Campaign name"
              />
            </label>
            <label>
              <span>Episode</span>
              <input
                type="number"
                min={0}
                value={episode}
                onChange={(e) => setEpisode(e.target.value)}
                placeholder="1"
              />
            </label>
            <label>
              <span>Resolution</span>
              <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                <option value="1920x1080">1920×1080</option>
                <option value="1280x720">1280×720</option>
              </select>
            </label>
            <label>
              <span>Frame rate</span>
              <select value={frameRate} onChange={(e) => setFrameRate(e.target.value)}>
                <option value="30">30 fps</option>
                <option value="60">60 fps</option>
              </select>
            </label>
            <label>
              <span>Theme</span>
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value="tavern">Tavern</option>
                <option value="parchment">Parchment</option>
                <option value="minimal">Minimal</option>
                <option value="arcane">Arcane</option>
                <option value="noir">Noir</option>
              </select>
            </label>
            <label>
              <span>Retention (days)</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
              />
            </label>
            <label className="portal-check">
              <input
                type="checkbox"
                checked={separateAudio}
                onChange={(e) => setSeparateAudio(e.target.checked)}
              />
              <span>Separate per-person audio</span>
            </label>
          </div>
          <div className="portal-form-actions">
            <button type="button" className="portal-btn" onClick={() => setShowNew(false)}>
              Cancel
            </button>
            <button type="submit" className="portal-btn primary" disabled={busy || !channelId}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Create &amp; request consent
            </button>
          </div>
        </form>
      )}

      <div className="portal-grid">
        {recordings.length === 0 && (
          <div className="portal-card portal-empty">
            <Users size={28} />
            <p>No recordings yet. Start one to capture a session.</p>
          </div>
        )}
        {recordings.map((r) => {
          const active = ["awaiting-consent", "countdown", "recording", "paused", "finalizing"].includes(
            r.status,
          );
          return (
            <div className={`portal-card portal-rec ${active ? "active" : ""}`} key={r.id}>
              <div className="portal-rec-head">
                <div className="portal-rec-icon">
                  <Video size={20} />
                </div>
                <div className="portal-rec-meta">
                  <strong>{r.title}</strong>
                  <span>
                    {r.campaign || "—"} {r.episodeNumber ? `· Ep ${r.episodeNumber}` : ""}
                  </span>
                </div>
                <span className={`portal-status status-${r.status}`}>
                  {statusLabel(r.status)}
                </span>
              </div>

              <div className="portal-rec-preview">
                {r.status === "completed" ? (
                  <video
                    className="portal-video"
                    controls
                    preload="metadata"
                    src={`${basePath}/api/recordings/file/${encodeURIComponent(r.id)}/session.mp4?${Date.now()}`}
                  />
                ) : (
                  <div className="portal-preview-placeholder">
                    <Clapperboard size={26} />
                    <span>Preview available after the session completes</span>
                  </div>
                )}
              </div>

              <CharacterEditor
                sessionId={r.id}
                onNotice={setNotice}
              />

              <div className="portal-rec-body">
                <div className="portal-rec-row">
                  <span>Elapsed</span>
                  <strong>{fmtTime(r.elapsedMs)}</strong>
                </div>
                <div className="portal-rec-row">
                  <span>Resolution</span>
                  <strong>{r.resolution} @ {r.frameRate}fps</strong>
                </div>
                <div className="portal-rec-row">
                  <span>Theme</span>
                  <strong>{r.theme}</strong>
                </div>
                <div className="portal-rec-row">
                  <span>Recorder</span>
                  <strong className={r.recorderHealthy ? "ok" : "bad"}>
                    {r.recorderHealthy ? "Healthy" : "Offline"}
                  </strong>
                </div>
              </div>

              {active && (
                <div className="portal-rec-controls">
                  {(r.status === "recording" || r.status === "countdown") && (
                    <button className="portal-btn" onClick={() => act(r, "pause")} disabled={busy}>
                      <Pause size={16} /> Pause
                    </button>
                  )}
                  {r.status === "paused" && (
                    <button className="portal-btn" onClick={() => act(r, "resume")} disabled={busy}>
                      <Play size={16} /> Resume
                    </button>
                  )}
                  {r.status === "awaiting-consent" && (
                    <button className="portal-btn" onClick={() => act(r, "start")} disabled={busy}>
                      <Play size={16} /> Start
                    </button>
                  )}
                  <button className="portal-btn danger" onClick={() => act(r, "stop")} disabled={busy}>
                    <Square size={16} /> Stop
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Lets the user set their character card for a recording (or edit it): name,
 * class, level, accent colour and a portrait upload. Saves via the existing
 * `/api/recordings/presentation` endpoint.
 */
function CharacterEditor({
  sessionId,
  onNotice,
}: {
  sessionId: string;
  onNotice: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [presentation, setPresentation] = useState<CharacterPresentation | null>(
    null,
  );
  const [characterName, setCharacterName] = useState("");
  const [className, setClassName] = useState("");
  const [level, setLevel] = useState("");
  const [accentColor, setAccentColor] = useState("#ffd67c");
  const [portraitKey, setPortraitKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    apiFetch<{ presentations: CharacterPresentation[] }>(
      `/api/recordings/presentation?sessionId=${encodeURIComponent(sessionId)}`,
    )
      .then((data) => {
        const mine = data.presentations?.[0] || null;
        setPresentation(mine);
        setCharacterName(mine?.characterName || "");
        setClassName(mine?.className || "");
        setLevel(mine?.level != null ? String(mine.level) : "");
        setAccentColor(mine?.accentColor || "#ffd67c");
        setPortraitKey(null); // keep existing unless a new upload is chosen
      })
      .catch(() => undefined);
  }, [open, sessionId]);

  async function uploadPortrait(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploaded = await apiFetch<{ key: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      setPortraitKey(uploaded.key);
    } catch {
      onNotice("Portrait upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await apiFetch("/api/recordings/presentation", {
        method: "POST",
        body: JSON.stringify({
          action: "save",
          sessionId,
          characterName: characterName || undefined,
          className: className || undefined,
          level: level ? Number(level) : undefined,
          accentColor,
          portraitKey,
        }),
      });
      onNotice("Character saved.");
      setOpen(false);
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Could not save character.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-char">
      <button
        type="button"
        className="portal-char-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <User size={16} />
        <span>{presentation ? "Edit character" : "Add character"}</span>
        <b>{open ? "▾" : "▸"}</b>
      </button>
      {open && (
        <div className="portal-char-editor">
          <div className="portal-char-preview">
            {portraitKey || presentation?.portraitUrl ? (
              <img
                src={
                  portraitKey
                    ? `${basePath}/api/uploads/${encodeURIComponent(portraitKey)}`
                    : presentation?.portraitUrl || ""
                }
                alt="Portrait"
              />
            ) : (
              <div className="portal-char-placeholder">
                <User size={24} />
              </div>
            )}
            <button
              type="button"
              className="portal-btn"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Upload size={14} /> Upload portrait
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void uploadPortrait(e.target.files?.[0] || null)}
            />
          </div>
          <div className="portal-char-fields">
            <label>
              <span>Character</span>
              <input
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                placeholder="Character name"
              />
            </label>
            <label>
              <span>Class</span>
              <input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="e.g. Wizard"
              />
            </label>
            <label>
              <span>Level</span>
              <input
                type="number"
                min={0}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="1"
              />
            </label>
            <label>
              <span>Accent</span>
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
              />
            </label>
          </div>
          <div className="portal-char-actions">
            <button
              type="button"
              className="portal-btn primary"
              onClick={() => void save()}
              disabled={busy}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Save character
            </button>
          </div>
        </div>
      )}
    </div>
  );
}