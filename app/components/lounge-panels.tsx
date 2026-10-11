"use client";

import { useRef, useState, useEffect } from "react";
import { Crown, Film, Plus, SkipBack, SkipForward, Trash2, Upload, X, Search, Loader2, PlayCircle } from "lucide-react";
import {
  addInitiative, cinemaSeatLabel, currentEntry, removeInitiative, stepTurn, watchPosition,
  type GameMaster, type Initiative, type TableCharacter, type WatchState,
} from "@/lib/lounge-shared";
import type { VoiceParticipant } from "@/lib/protocol";
import { apiFetch } from "../lib/client";
import type { LoungePose } from "../lib/living-room";

const formatTime = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  duration: string;
}

/** Uploads a file to this server and returns the link everyone can load it from. */
async function upload(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const result = await apiFetch<{ url: string }>("/api/uploads", { method: "POST", body: form });
  return result.url;
}

/** Search YouTube via our backend proxy */
async function searchYouTube(query: string): Promise<YouTubeVideo[]> {
  try {
    const res = await apiFetch<{ videos: YouTubeVideo[] }>(`/api/youtube/search?q=${encodeURIComponent(query)}`);
    return res.videos || [];
  } catch {
    return [];
  }
}

/** Download YouTube video to server harddisk via yt-dlp */
async function downloadYouTubeVideo(urlOrId: string): Promise<{ streamUrl: string; title: string }> {
  const result = await apiFetch<{ ok: boolean; streamUrl: string; title: string }>("/api/youtube/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: urlOrId }),
  });
  if (!result.ok || !result.streamUrl) {
    throw new Error("Failed to download video from YouTube.");
  }
  return { streamUrl: result.streamUrl, title: result.title };
}

export interface WatchInfo { duration: number; current: number; blocked: boolean; error: string | null }

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+?&v=))([\w-]{11})/i);
  return match ? match[1] : null;
}

/** Watch together: pick a video (a link, upload, or YouTube search) and the whole room sees it on the screen, in step. */
export function WatchPanel({ watch, hubNow, info, volume, onVolume, setWatch, onStartSound, onYoutube, onClose }: {
  watch: WatchState | null;
  hubNow: () => number;
  info: WatchInfo;
  volume: number;
  onVolume: (volume: number) => void;
  setWatch: (value: Omit<WatchState, "at" | "by"> | null) => void;
  onStartSound: () => void;
  onYoutube?: () => void;
  onClose: () => void;
}) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showYouTube, setShowYouTube] = useState(false);
  const [ytQuery, setYtQuery] = useState("");
  const [ytResults, setYtResults] = useState<YouTubeVideo[]>([]);
  const [ytSearching, setYtSearching] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const searchDebounce = useRef<NodeJS.Timeout | null>(null);
  const here = watch ? watchPosition(watch, hubNow()) : 0;
  const start = (url: string, title: string) => setWatch({ url, title, position: 0, paused: false });
  const chooseFile = async (chosen: File | undefined) => {
    if (!chosen) return;
    setBusy(true); setProblem(null); setBusyMessage("Uploading video…");
    try { start(await upload(chosen), chosen.name.replace(/\.[^.]+$/, "")); }
    catch (error) { setProblem(error instanceof Error ? error.message : "That upload failed."); }
    finally { setBusy(false); setBusyMessage(null); if (file.current) file.current.value = ""; }
  };

  // Debounced YouTube search
  useEffect(() => {
    if (!showYouTube || !ytQuery.trim()) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setYtSearching(true);
      setYtError(null);
      const results = await searchYouTube(ytQuery);
      setYtResults(results);
      setYtSearching(false);
      if (results.length === 0) setYtError("No videos found. Try a different search.");
    }, 400);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [ytQuery, showYouTube]);

  const handleYtSelect = async (video: YouTubeVideo) => {
    setBusy(true);
    setProblem(null);
    setBusyMessage(`Downloading "${video.title}" to server with yt-dlp…`);
    try {
      const { streamUrl, title } = await downloadYouTubeVideo(`https://www.youtube.com/watch?v=${video.id}`);
      start(streamUrl, title || video.title);
      setShowYouTube(false);
      setYtQuery("");
      setYtResults([]);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "YouTube download failed");
    } finally {
      setBusy(false);
      setBusyMessage(null);
    }
  };

  return (
    <div className="living-room-panel" role="dialog" aria-label="Watch together" style={{ maxHeight: "85vh", overflow: "auto" }}>
      <div className="living-room-panel-head"><strong><Film size={14} /> Watch together</strong><button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button></div>
      {watch ? (
        <>
          <div className="lr-line"><span className="lr-title">{watch.title || "Video"}</span><small>started by {watch.by}</small></div>
          <div className="lr-row">
            <button type="button" onClick={() => setWatch({ url: watch.url, title: watch.title, position: here, paused: !watch.paused })}>{watch.paused ? "▶ Play" : "❚❚ Pause"}</button>
            <input
              type="range" min={0} max={Math.max(1, Math.floor(info.duration || 1))} step={1} value={Math.min(Math.floor(here), Math.floor(info.duration || 1))}
              disabled={!info.duration} aria-label="Seek"
              onChange={(event) => setWatch({ url: watch.url, title: watch.title, position: Number(event.target.value), paused: watch.paused })}
            />
            <small>{formatTime(here)} / {info.duration ? formatTime(info.duration) : "--:--"}</small>
          </div>
          <label className="lr-row"><small>Volume</small><input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => onVolume(Number(event.target.value))} aria-label="Film volume" /></label>
          {info.blocked && <button type="button" className="lr-wide" onClick={onStartSound}>Click to start the sound</button>}
          {info.error && <p className="lr-note">{info.error}</p>}
          <div className="lr-row"><button type="button" onClick={() => setWatch(null)}>Stop for everyone</button></div>
        </>
      ) : (
        <>
          {!showYouTube ? (
            <>
              <form className="lr-row" onSubmit={async (event) => {
                event.preventDefault();
                const raw = link.trim();
                if (!raw) return;
                const ytId = extractYouTubeId(raw);
                if (ytId) {
                  setBusy(true);
                  setProblem(null);
                  setBusyMessage("Downloading YouTube video with yt-dlp to server storage…");
                  try {
                    const { streamUrl, title } = await downloadYouTubeVideo(raw);
                    start(streamUrl, title);
                    setLink("");
                  } catch (err) {
                    setProblem(err instanceof Error ? err.message : "YouTube download failed");
                  } finally {
                    setBusy(false);
                    setBusyMessage(null);
                  }
                } else {
                  start(raw, raw.split("/").pop()?.split("?")[0] || "Video");
                  setLink("");
                }
              }}>
                <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://… direct link to .mp4/.webm or YouTube URL" aria-label="Video link" maxLength={600} disabled={busy} />
                <button type="submit" disabled={!link.trim() || busy}>{busy ? "Downloading…" : "Play"}</button>
              </form>
              {busy && busyMessage && (
                <div className="lr-row" style={{ color: "var(--lr-accent, #ffd27a)", fontSize: 13, gap: 8 }}>
                  <Loader2 size={15} className="animate-spin" />
                  <span>{busyMessage}</span>
                </div>
              )}
              <div className="lr-row">
                <button type="button" disabled={busy} onClick={() => file.current?.click()}><Upload size={14} /> {busy ? "Uploading…" : "Upload a video"}</button>
                <input ref={file} type="file" accept="video/mp4,video/webm,.mp4,.webm" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} />
                <button type="button" disabled={busy} onClick={() => setShowYouTube(true)} title="Search YouTube"><PlayCircle size={14} /> YouTube & more…</button>
              </div>
              <p className="lr-note">YouTube videos are downloaded directly to server storage using yt-dlp and played on the screen for everyone in sync. Direct video links and uploads up to 40 MB also supported.</p>
              {problem && <p className="lr-note" style={{ color: "#ff6b6b" }}>{problem}</p>}
            </>
          ) : (
            <div style={{ padding: "8px 0" }}>
              <div className="lr-row" style={{ gap: 8 }}>
                <Search size={14} style={{ opacity: 0.5 }} />
                <input
                  value={ytQuery}
                  onChange={(e) => { setYtQuery(e.target.value); setYtError(null); }}
                  placeholder="Search YouTube…"
                  aria-label="Search YouTube"
                  style={{ flex: 1, minWidth: 0 }}
                  autoFocus
                />
                {ytSearching && <Loader2 size={14} className="animate-spin" />}
              </div>
              {ytError && <p className="lr-note" style={{ color: "#ff6b6b" }}>{ytError}</p>}
              {ytResults.length > 0 && (
                <div style={{ maxHeight: "40vh", overflow: "auto" }}>
                  {ytResults.map((video) => (
                    <button
                      key={video.id}
                      type="button"
                      className="lr-row"
                      onClick={() => handleYtSelect(video)}
                      style={{ textAlign: "left", padding: "8px", borderRadius: "8px", background: "var(--panel)", border: "1px solid var(--line)", transition: "background 0.1s", width: "100%" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--line)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "var(--panel)"}
                    >
                      <img src={video.thumbnail} alt="" style={{ width: 120, height: 68, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{video.title}</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{video.channelTitle}</div>
                        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>{video.duration}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="lr-row" style={{ marginTop: 8 }}>
                <button type="button" onClick={() => setShowYouTube(false)}>Back</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Who sits where in the cinema, and a button to take the free seat beside them. */
export function SeatFinder({ participants, poses, myId, onSitNear, onClose }: {
  participants: VoiceParticipant[];
  poses: Map<string, LoungePose>;
  myId: string | null;
  onSitNear: (connectionId: string) => void;
  onClose: () => void;
}) {
  const people = participants.filter((p) => !p.bot && !p.recorder && poses.has(p.connectionId))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  return (
    <div className="living-room-panel" role="dialog" aria-label="Find a seat">
      <div className="living-room-panel-head"><strong>Who is where</strong><button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button></div>
      <ul className="lr-list">
        {people.map((person) => {
          const seat = poses.get(person.connectionId)?.seat ?? null;
          return (
            <li key={person.connectionId}>
              <span className="lr-name">{person.displayName}{person.connectionId === myId ? " (you)" : ""}</span>
              <small>{cinemaSeatLabel(seat) ?? "standing"}</small>
              {person.connectionId !== myId && seat && <button type="button" onClick={() => onSitNear(person.connectionId)}>Sit next to</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The initiative order: who goes when, whose turn it is, and who the game master is. */
export function InitiativePanel({ initiative, gm, myId, myName, setInitiative, setGm, onRollMine, onClose }: {
  initiative: Initiative | null;
  gm: GameMaster | null;
  myId: string | null;
  myName: string;
  setInitiative: (value: Initiative | null) => void;
  setGm: (value: GameMaster | null) => void;
  onRollMine: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const isGm = Boolean(gm && gm.connectionId === myId);
  const canEdit = !gm || isGm;
  const current = currentEntry(initiative);
  const addNpc = () => {
    const label = name.trim();
    if (!label) return;
    const rolled = value.trim() === "" ? Math.floor(Math.random() * 20) + 1 : Number(value);
    setInitiative(addInitiative(initiative, { id: `n${Date.now().toString(36)}`, name: label, value: Number.isFinite(rolled) ? rolled : 0 }));
    setName(""); setValue("");
  };
  return (
    <div className="living-room-panel" role="dialog" aria-label="Initiative">
      <div className="living-room-panel-head">
        <strong>Initiative{initiative ? ` · round ${initiative.round}` : ""}</strong>
        <button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>
      <div className="lr-row">
        {gm ? <small><Crown size={12} /> GM: {gm.name}</small> : <small>No game master yet: anyone can run the order.</small>}
        {isGm ? <button type="button" onClick={() => setGm(null)}>Hand over</button>
          : !gm && myId ? <button type="button" onClick={() => setGm({ connectionId: myId, name: myName })}>I&apos;m the GM</button> : null}
      </div>
      {initiative ? (
        <ol className="lr-order">
          {initiative.entries.map((entry, index) => (
            <li key={entry.id} className={index === initiative.turn ? "turn" : ""}>
              <b>{entry.value}</b><span>{entry.name}</span>
              {canEdit && <button type="button" onClick={() => setInitiative(removeInitiative(initiative, entry.id))} aria-label={`Remove ${entry.name}`}><Trash2 size={12} /></button>}
            </li>
          ))}
        </ol>
      ) : <p className="lr-note">Nobody is in the order yet. Roll yours, and the game master can add the monsters.</p>}
      <div className="lr-row">
        <button type="button" onClick={onRollMine} title="Rolls a d20 and puts the total in the order for you">Roll my initiative</button>
        {canEdit && initiative && (
          <>
            <button type="button" onClick={() => setInitiative(stepTurn(initiative, -1))} aria-label="Previous turn"><SkipBack size={14} /></button>
            <button type="button" className="primary" onClick={() => setInitiative(stepTurn(initiative, 1))} title={current ? `Next: after ${current.name}` : "Next turn"}>Next turn <SkipForward size={14} /></button>
          </>
        )}
      </div>
      {canEdit && (
        <form className="lr-row" onSubmit={(event) => { event.preventDefault(); addNpc(); }}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Goblin" aria-label="Name" maxLength={40} />
          <input className="lr-narrow" value={value} onChange={(event) => setValue(event.target.value.replace(/[^\d-]/g, ""))} placeholder="d20" aria-label="Initiative" inputMode="numeric" maxLength={4} />
          <button type="submit" disabled={!name.trim()} aria-label="Add"><Plus size={14} /></button>
        </form>
      )}
      {canEdit && initiative && <div className="lr-row"><button type="button" onClick={() => setInitiative(null)}>End combat</button></div>}
    </div>
  );
}

/** My character at the table: the name and portrait on my tent card. */
export function CharacterPanel({ mine, fallbackName, setMine, onClose }: {
  mine: TableCharacter | null;
  fallbackName: string;
  setMine: (value: TableCharacter | null) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(mine?.name ?? "");
  const [portrait, setPortrait] = useState(mine?.portraitUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const save = () => setMine({ name: name.trim() || fallbackName, portraitUrl: portrait.trim() || null });
  const chooseFile = async (chosen: File | undefined) => {
    if (!chosen) return;
    setBusy(true); setProblem(null);
    try { setPortrait(await upload(chosen)); }
    catch (error) { setProblem(error instanceof Error ? error.message : "That upload failed."); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  };
  return (
    <div className="living-room-panel" role="dialog" aria-label="My character">
      <div className="living-room-panel-head"><strong>My character</strong><button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button></div>
      <label className="lr-field"><small>Name on my card</small><input value={name} onChange={(event) => setName(event.target.value)} placeholder={fallbackName} maxLength={40} /></label>
      <label className="lr-field"><small>Portrait</small><input value={portrait} onChange={(event) => setPortrait(event.target.value)} placeholder="https://… or upload" maxLength={600} /></label>
      <div className="lr-row">
        <button type="button" disabled={busy} onClick={() => file.current?.click()}><Upload size={14} /> {busy ? "Uploading…" : "Upload a portrait"}</button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} />
      </div>
      {problem && <p className="lr-note">{problem}</p>}
      <div className="lr-row">
        <button type="button" className="primary" onClick={() => { save(); onClose(); }}>Save</button>
        {mine && <button type="button" onClick={() => { setMine(null); onClose(); }}>Clear</button>}
      </div>
    </div>
  );
}