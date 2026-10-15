"use client";

import { useRef, useState, useEffect } from "react";
import { ChessPawn, Clapperboard, Crown, Film, Plus, RotateCw, SkipBack, SkipForward, Trash2, Upload, X, Search, Loader2, PlayCircle } from "lucide-react";
import {
  PAWNS_EACH, PAWNS_GM, PAWN_KINDS, addInitiative, cinemaSeatLabel, currentEntry, removeInitiative, stepTurn, watchPosition,
  type GameMaster, type HouseLights, type Initiative, type PawnKind, type TableCharacter, type TableMap, type TablePawn, type WatchState,
} from "@/lib/lounge-shared";
import { ABILITIES, SCREEN_SIZES, pagesFor, resizeChoice, type CharacterSheet, type ScreenPageId, type ScreenRole } from "../lib/gm-screen";
import { CLASSES, slotsFor } from "@/lib/dnd-spells";
import { searchSpells } from "../lib/spell-book";
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
                // A YouTube link, or anything that is not a web address (a name), goes through yt-dlp.
                const isUrl = /^(https?:)?\/\//i.test(raw) || /^\/hangout\/api\//.test(raw);
                if (extractYouTubeId(raw) || !isUrl) {
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
                <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="YouTube link or a name to search, or a direct .mp4/.webm link" aria-label="Video link" maxLength={600} disabled={busy} />
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

/**
 * The projection booth's desk: run the film (play, pause, skip, stop), set the house lights for the whole room,
 * and run the usual moments (showtime, intermission) with one press. Only reachable from inside the booth.
 */
export function BoothPanel({ watch, hubNow, info, house, setWatch, setHouse, onPick, onClose }: {
  watch: WatchState | null;
  hubNow: () => number;
  info: WatchInfo;
  house: HouseLights | null;
  setWatch: (value: Omit<WatchState, "at" | "by"> | null) => void;
  setHouse: (value: Pick<HouseLights, "level" | "auto"> | null) => void;
  onPick: () => void;
  onClose: () => void;
}) {
  const here = watch ? watchPosition(watch, hubNow()) : 0;
  const auto = house?.auto ?? true;
  const level = house?.level ?? 1;
  const playing = !!watch && !watch.paused;
  // The slider is dragged continuously, but the hub takes a change at most every 120 ms: send once it settles.
  const [draft, setDraft] = useState<number | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  const dragLights = (value: number) => {
    setDraft(value);
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => { setHouse({ level: value, auto: false }); setDraft(null); }, 160);
  };
  const seek = (position: number) => { if (watch) setWatch({ url: watch.url, title: watch.title, position: Math.max(0, position), paused: watch.paused }); };
  const mode = auto ? "auto" : level >= 0.95 ? "up" : level <= 0.02 ? "out" : "dim";
  const scenes: Array<{ id: string; label: string; hint: string; run: () => void }> = [
    { id: "showtime", label: "🎬 Showtime", hint: "Lights down, film rolling", run: () => { setHouse({ level: 0, auto: true }); if (watch) setWatch({ url: watch.url, title: watch.title, position: here, paused: false }); } },
    { id: "intermission", label: "🍿 Intermission", hint: "Pause and bring the lights up", run: () => { if (watch) setWatch({ url: watch.url, title: watch.title, position: here, paused: true }); setHouse({ level: 1, auto: false }); } },
  ];
  return (
    <div className="living-room-panel lr-booth" role="dialog" aria-label="Projection booth">
      <div className="living-room-panel-head">
        <strong><Clapperboard size={14} /> Projection booth {playing && <span className="lr-onair">ON AIR</span>}</strong>
        <button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>
      <div className="lr-line">
        <span className="lr-title">{watch ? watch.title || "Video" : "Nothing loaded"}</span>
        <small>{watch ? `loaded by ${watch.by}` : "Pick something for the screen: a link, an upload or YouTube."}</small>
      </div>
      <div className="lr-row">
        <button type="button" onClick={onPick}><Film size={13} /> {watch ? "Change film…" : "Choose a film…"}</button>
        {watch && <button type="button" onClick={() => setWatch(null)}>Eject</button>}
      </div>
      {watch && (
        <>
          <div className="lr-row">
            <button type="button" onClick={() => seek(here - 10)} aria-label="Back 10 seconds" title="Back 10 seconds"><SkipBack size={13} /> 10s</button>
            <button type="button" className={playing ? "active" : ""} onClick={() => setWatch({ url: watch.url, title: watch.title, position: here, paused: playing })}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
            <button type="button" onClick={() => seek(Math.min(here + 10, info.duration || here + 10))} aria-label="Forward 10 seconds" title="Forward 10 seconds">10s <SkipForward size={13} /></button>
            <button type="button" onClick={() => seek(0)} title="Back to the start">⏮ Start</button>
          </div>
          <div className="lr-row">
            <input
              type="range" min={0} max={Math.max(1, Math.floor(info.duration || 1))} step={1} value={Math.min(Math.floor(here), Math.floor(info.duration || 1))}
              disabled={!info.duration} aria-label="Seek" style={{ flex: 1 }} onChange={(event) => seek(Number(event.target.value))}
            />
            <small>{formatTime(here)} / {info.duration ? formatTime(info.duration) : "--:--"}</small>
          </div>
        </>
      )}
      <div className="lr-line"><span className="lr-title">House lights</span><small>Set for everyone in the room.</small></div>
      <div className="lr-row">
        {scenes.map((scene) => <button key={scene.id} type="button" onClick={scene.run} title={scene.hint} disabled={!watch && scene.id !== "intermission"}>{scene.label}</button>)}
      </div>
      <div className="lr-row">
        <button type="button" className={mode === "up" ? "active" : ""} onClick={() => setHouse({ level: 1, auto: false })}>Up</button>
        <button type="button" className={mode === "dim" ? "active" : ""} onClick={() => setHouse({ level: 0.35, auto: false })}>Dim</button>
        <button type="button" className={mode === "out" ? "active" : ""} onClick={() => setHouse({ level: 0, auto: false })}>Out</button>
        <button type="button" className={mode === "auto" ? "active" : ""} onClick={() => setHouse(null)} title="Dim by themselves while a film plays">Auto</button>
      </div>
      <label className="lr-row">
        <small style={{ width: 54 }}>{Math.round((draft ?? level) * 100)}%</small>
        <input type="range" min={0} max={1} step={0.01} value={draft ?? level} disabled={auto && !draft} aria-label="House light level" style={{ flex: 1 }} onChange={(event) => dragLights(Number(event.target.value))} />
      </label>
      {info.error && <p className="lr-note">{info.error}</p>}
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
/**
 * What a screen's panels show, panel by panel, and how many it has: the game
 * master's three to five, a player's two to four.
 */
function ScreenPagesPicker({ role, choice, setChoice }: { role: ScreenRole; choice: ScreenPageId[]; setChoice: (value: ScreenPageId[]) => void }) {
  const { min, max } = SCREEN_SIZES[role];
  const counts = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  // As the owner sees them: Left, Middle, Right; with more, the ones between are numbered.
  const label = (index: number) =>
    index === 0 ? "Left" : index === choice.length - 1 ? "Right" : choice.length === 3 ? "Middle" : `Panel ${index + 1}`;
  return (
    <>
      <div className="lr-row lr-panels" role="group" aria-label="Panels">
        <small>Panels</small>
        {counts.map((count) => (
          <button key={count} type="button" className={choice.length === count ? "active" : ""} aria-pressed={choice.length === count} onClick={() => setChoice(resizeChoice(role, choice, count))}>{count}</button>
        ))}
      </div>
      {choice.map((id, index) => (
        <label key={index} className="lr-field lr-inline">
          <small>{label(index)}</small>
          <select value={id} onChange={(event) => setChoice(choice.map((old, i) => (i === index ? (event.target.value as ScreenPageId) : old)))}>
            {pagesFor(role).map((page) => <option key={page.id} value={page.id}>{page.label}</option>)}
          </select>
        </label>
      ))}
    </>
  );
}

/** My own little screen at the table: only I ever see it. */
export interface PlayerScreenSettings {
  open: boolean;
  setOpen: (open: boolean) => void;
  choice: ScreenPageId[];
  setChoice: (value: ScreenPageId[]) => void;
  notes: string;
  setNotes: (value: string) => void;
}

/** The old sheet this browser kept ("Rogue 3", "18/24"), read into numbers to start the new one with. */
function fromLegacy(sheet: CharacterSheet | null): Partial<TableCharacter> {
  if (!sheet) return {};
  const int = (text: string) => { const n = parseInt(text, 10); return Number.isFinite(n) ? n : undefined; };
  const cls = CLASSES.find((c) => sheet.level.toLowerCase().includes(c.toLowerCase()));
  const hp = /(\d+)\s*\/\s*(\d+)/.exec(sheet.hp);
  return {
    ...(cls ? { cls } : {}),
    level: int(sheet.level.replace(/\D+/g, " ").trim()),
    ...(hp ? { hp: Number(hp[1]), maxHp: Number(hp[2]) } : { maxHp: int(sheet.hp) }),
    ac: int(sheet.ac),
    speed: int(sheet.speed),
    abilities: sheet.abilities.map((a) => int(a) ?? 0),
  };
}

/** Spells by name: type a few letters, pick one; each shows as a chip to take off again. */
function SpellPicker({ spells, setSpells }: { spells: string[]; setSpells: (value: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<string[]>([]);
  useEffect(() => {
    if (query.trim().length < 2) { setFound([]); return; }
    let live = true;
    const later = setTimeout(() => { void searchSpells(query).then((names) => { if (live) setFound(names.filter((n) => !spells.includes(n))); }); }, 250);
    return () => { live = false; clearTimeout(later); };
  }, [query, spells]);
  const add = (name: string) => { if (!spells.includes(name) && spells.length < 40) setSpells([...spells, name]); setQuery(""); setFound([]); };
  return (
    <div className="lr-field">
      <small>Spells</small>
      {spells.length > 0 && (
        <div className="lr-chips">
          {spells.map((name) => (
            <span key={name} className="lr-chip">{name}<button type="button" onClick={() => setSpells(spells.filter((s) => s !== name))} aria-label={`Remove ${name}`}><X size={11} /></button></span>
          ))}
        </div>
      )}
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Add a spell: fireball, cure wounds…" aria-label="Find a spell" maxLength={60}
        onKeyDown={(event) => { if (event.key === "Enter" && found[0]) { event.preventDefault(); add(found[0]); } }} />
      {found.length > 0 && (
        <div className="lr-chips">
          {found.map((name) => <button key={name} type="button" className="lr-suggest" onClick={() => add(name)}><Plus size={11} /> {name}</button>)}
        </div>
      )}
    </div>
  );
}

/**
 * My character: a name, class and level, the few numbers play uses, and my
 * spells. Slots come from the class and level by themselves. The portrait,
 * ability scores and my own screen fold away under "More".
 */
export function CharacterPanel({ mine, fallbackName, setMine, legacy, screen, onClose }: {
  mine: TableCharacter | null;
  fallbackName: string;
  setMine: (value: TableCharacter | null) => void;
  /** What this browser's old sheet held, to start from when there is no sheet yet. */
  legacy: CharacterSheet | null;
  screen: PlayerScreenSettings;
  onClose: () => void;
}) {
  const start = { ...(mine?.maxHp === undefined && !mine?.cls ? fromLegacy(legacy) : {}), ...Object.fromEntries(Object.entries(mine ?? {}).filter(([, v]) => v !== undefined)) } as Partial<TableCharacter>;
  const [name, setName] = useState(start.name ?? "");
  const [portrait, setPortrait] = useState(start.portraitUrl ?? "");
  const [cls, setCls] = useState(start.cls ?? "");
  const [level, setLevel] = useState(String(start.level ?? 1));
  const [maxHp, setMaxHp] = useState(start.maxHp !== undefined ? String(start.maxHp) : "");
  const [ac, setAc] = useState(start.ac !== undefined ? String(start.ac) : "");
  const [speed, setSpeed] = useState(String(start.speed ?? 30));
  const [abilities, setAbilities] = useState<string[]>((start.abilities ?? [0, 0, 0, 0, 0, 0]).map((n) => (n ? String(n) : "")));
  const [spells, setSpells] = useState<string[]>(start.spells ?? []);
  const auto = slotsFor(cls, Number(level) || 1);
  const [customSlots, setCustomSlots] = useState<string[] | null>(() =>
    start.slots && start.slots.some((n, i) => n !== slotsFor(start.cls ?? "", start.level ?? 1)[i]) ? start.slots.map(String) : null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const num = (text: string) => { const n = Math.round(Number(text)); return text.trim() && Number.isFinite(n) ? n : undefined; };
  const save = () => {
    const slots = customSlots ? customSlots.map((n) => Math.max(0, num(n) ?? 0)) : auto;
    const max = num(maxHp);
    const oldMax = mine?.maxHp;
    // A new maximum heals by the difference; a lower one caps what is left.
    const hp = max === undefined ? undefined : mine?.hp === undefined ? max : Math.max(0, Math.min(max, mine.hp + (oldMax === undefined ? 0 : max - oldMax)));
    setMine({
      name: name.trim() || fallbackName,
      portraitUrl: portrait.trim() || null,
      ...(cls ? { cls } : {}),
      level: num(level) ?? 1,
      ...(max !== undefined ? { maxHp: max, hp } : {}),
      ...(num(ac) !== undefined ? { ac: num(ac) } : {}),
      speed: num(speed) ?? 30,
      abilities: abilities.map((a) => num(a) ?? 0),
      slots,
      used: (mine?.used ?? Array(9).fill(0)).map((n, i) => Math.min(n, slots[i] ?? 0)),
      spells,
    });
  };
  const chooseFile = async (chosen: File | undefined) => {
    if (!chosen) return;
    setBusy(true); setProblem(null);
    try { setPortrait(await upload(chosen)); }
    catch (error) { setProblem(error instanceof Error ? error.message : "That upload failed."); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  };
  const caster = auto.some((n) => n > 0);
  return (
    <div className="living-room-panel" role="dialog" aria-label="My character">
      <div className="living-room-panel-head"><strong>My character</strong><button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button></div>
      <label className="lr-field"><small>Name</small><input value={name} onChange={(event) => setName(event.target.value)} placeholder={fallbackName} maxLength={40} /></label>
      <div className="lr-sheet lr-sheet-2">
        <label className="lr-field"><small>Class</small>
          <select value={cls} onChange={(event) => setCls(event.target.value)}>
            <option value="">Choose…</option>
            {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="lr-field"><small>Level</small><input value={level} onChange={(event) => setLevel(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="1" /></label>
      </div>
      <div className="lr-sheet">
        <label className="lr-field"><small>Max HP</small><input value={maxHp} onChange={(event) => setMaxHp(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="24" /></label>
        <label className="lr-field"><small>AC</small><input value={ac} onChange={(event) => setAc(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="15" /></label>
        <label className="lr-field"><small>Speed (ft)</small><input value={speed} onChange={(event) => setSpeed(event.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="30" /></label>
      </div>
      {caster && !customSlots && (
        <p className="lr-note">Spell slots: {auto.map((n, i) => (n ? `${n}×${i + 1}${i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th"}` : "")).filter(Boolean).join(" · ")}</p>
      )}
      <SpellPicker spells={spells} setSpells={setSpells} />
      <div className="lr-row">
        <button type="button" className="primary" onClick={() => { save(); onClose(); }}>Save</button>
        {mine && <button type="button" onClick={() => { setMine(null); onClose(); }}>Clear</button>}
      </div>

      <details className="lr-more">
        <summary>More: portrait, ability scores, slots, my screen</summary>
        <label className="lr-field"><small>Portrait</small><input value={portrait} onChange={(event) => setPortrait(event.target.value)} placeholder="https://… or upload" maxLength={600} /></label>
        <div className="lr-row">
          <button type="button" disabled={busy} onClick={() => file.current?.click()}><Upload size={14} /> {busy ? "Uploading…" : "Upload a portrait"}</button>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} />
        </div>
        {problem && <p className="lr-note">{problem}</p>}
        <div className="lr-abilities">
          {ABILITIES.map((ability, i) => (
            <label key={ability} className="lr-field"><small>{ability}</small>
              <input value={abilities[i]} inputMode="numeric" maxLength={2} placeholder="10" onChange={(event) => setAbilities(abilities.map((old, j) => (j === i ? event.target.value.replace(/\D/g, "") : old)))} />
            </label>
          ))}
        </div>
        <label className="living-room-switch">
          <span><strong>Set my own spell slots</strong><small>For multiclassing, or a subclass that casts. Off: from class and level.</small></span>
          <input type="checkbox" checked={Boolean(customSlots)} onChange={(event) => setCustomSlots(event.target.checked ? auto.map(String) : null)} />
        </label>
        {customSlots && (
          <div className="lr-slot-edit">
            {customSlots.map((n, i) => (
              <label key={i} className="lr-field"><small>{i + 1}</small>
                <input value={n} inputMode="numeric" maxLength={1} onChange={(event) => setCustomSlots(customSlots.map((old, j) => (j === i ? event.target.value.replace(/\D/g, "").slice(0, 1) : old)))} />
              </label>
            ))}
          </div>
        )}
        <small className="lr-heading">My screen (only you see it)</small>
        <div className="lr-row">
          <button type="button" className={screen.open ? "active" : ""} aria-pressed={screen.open} onClick={() => screen.setOpen(!screen.open)}>
            {screen.open ? "Put my screen away" : "Stand my screen up"}
          </button>
        </div>
        {screen.open && (
          <>
            <ScreenPagesPicker role="player" choice={screen.choice} setChoice={screen.setChoice} />
            <label className="lr-field">
              <small>My notes</small>
              <textarea value={screen.notes} onChange={(event) => screen.setNotes(event.target.value)} rows={3} maxLength={2000} placeholder="Owe Brannigan 5 gold. The key fits the red door." />
            </label>
          </>
        )}
      </details>
    </div>
  );
}
/**
 * The tabletop's game master: who it is and their chair, the battle map on
 * the table, and what the inside of their screen shows.
 */
export function GameMasterPanel({ gm, myId, inGmChair, onTakeChair, setGm, myName, map, canEditMap, setMap, squares, setSquares, choice, setChoice, folded, setFolded, notes, setNotes, onClose }: {
  gm: GameMaster | null;
  myId: string | null;
  myName: string;
  inGmChair: boolean;
  onTakeChair: () => void;
  setGm: (value: GameMaster | null) => void;
  map: TableMap | null;
  canEditMap: boolean;
  setMap: (value: { url: string; turns: number; zoom: number } | null) => void;
  /** The map's width in 5-foot squares: the scale of pawns, rulers and spells. */
  squares: number;
  setSquares: (squares: number) => void;
  choice: ScreenPageId[];
  setChoice: (value: ScreenPageId[]) => void;
  /** The screen folded flat on the table, for everyone. */
  folded: boolean;
  setFolded: (folded: boolean) => void;
  notes: string;
  setNotes: (value: string) => void;
  onClose: () => void;
}) {
  const isGm = Boolean(gm && gm.connectionId === myId);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [zoom, setZoom] = useState(map?.zoom ?? 1);
  const file = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setZoom(map?.zoom ?? 1); }, [map?.zoom]);
  const [grid, setGrid] = useState(squares);
  useEffect(() => { setGrid(squares); }, [squares]);
  useEffect(() => {
    if (grid === squares) return;
    const later = setTimeout(() => setSquares(grid), 250);
    return () => clearTimeout(later);
  }, [grid, squares, setSquares]);
  // A slider sends many values; the room only needs the one it settles on.
  useEffect(() => {
    if (!map || zoom === map.zoom) return;
    const later = setTimeout(() => setMap({ url: map.url, turns: map.turns, zoom }), 250);
    return () => clearTimeout(later);
  }, [zoom, map, setMap]);
  const chooseFile = async (chosen: File | undefined) => {
    if (!chosen) return;
    setBusy(true); setProblem(null);
    try { setMap({ url: await upload(chosen), turns: 0, zoom: 1 }); }
    catch (error) { setProblem(error instanceof Error ? error.message : "That upload failed."); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  };
  return (
    <div className="living-room-panel" role="dialog" aria-label="Game master">
      <div className="living-room-panel-head"><strong>Game master</strong><button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button></div>
      <div className="lr-row">
        {gm ? <small><Crown size={12} /> GM: {isGm ? "you" : gm.name}</small> : <small>No game master yet.</small>}
        {!inGmChair && (!gm || isGm) && <button type="button" onClick={onTakeChair}>Sit in the GM&apos;s chair</button>}
        {isGm ? <button type="button" onClick={() => setGm(null)}>Hand over</button>
          : !gm && myId ? <button type="button" onClick={() => setGm({ connectionId: myId, name: myName })}>I&apos;m the GM</button> : null}
      </div>

      <small className="lr-heading">Battle map</small>
      {canEditMap ? (
        <>
          <div className="lr-row">
            <button type="button" disabled={busy} onClick={() => file.current?.click()}><Upload size={14} /> {busy ? "Uploading…" : map ? "Change the map" : "Upload a map"}</button>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} />
            {map && <button type="button" onClick={() => setMap({ url: map.url, turns: (map.turns + 1) % 4, zoom: map.zoom })} title="Turn the map a quarter"><RotateCw size={14} /> Turn</button>}
            {map && <button type="button" onClick={() => setMap(null)}>Use the drawn map</button>}
          </div>
          {map && (
            <label className="lr-field">
              <small>Zoom: {zoom.toFixed(1)}×</small>
              <input type="range" min={1} max={4} step={0.1} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Map zoom" />
            </label>
          )}
          <label className="lr-field">
            <small>Scale: {grid} squares across ({grid * 5} ft)</small>
            <input type="range" min={10} max={60} step={1} value={grid} onChange={(event) => setGrid(Number(event.target.value))} aria-label="Squares across the map" />
          </label>
          {problem && <p className="lr-note">{problem}</p>}
          <p className="lr-note">Everyone at the table sees it. The middle of the picture fills the round table. Match the scale to the map&apos;s grid: pawns, rulers and spells use it.</p>
        </>
      ) : (
        <p className="lr-note">{map ? `The map is ${map.by}'s upload. ` : ""}Only the game master changes the map.</p>
      )}

      {isGm ? (
        <>
          <small className="lr-heading">Your screen</small>
          <div className="lr-row">
            <button type="button" className={folded ? "" : "active"} aria-pressed={!folded} onClick={() => setFolded(!folded)}>
              {folded ? "Stand the screen up" : "Fold the screen away"}
            </button>
          </div>
          {!folded && (
            <>
              <small className="lr-heading">Inside it (only you see this side)</small>
              <ScreenPagesPicker role="gm" choice={choice} setChoice={setChoice} />
            </>
          )}
          <label className="lr-field">
            <small>My notes</small>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={2000} placeholder="Ogre in the cellar. Map hidden in the third book." />
          </label>
        </>
      ) : (
        <p className="lr-note">The game master&apos;s screen shows them the order, rules and notes they pick.</p>
      )}
    </div>
  );
}

/** The cabinet's miniatures as the panel names them. */
export const PAWN_NAMES: Record<PawnKind, { name: string; glyph: string }> = {
  fighter: { name: "Fighter", glyph: "⚔️" },
  wizard: { name: "Wizard", glyph: "🧙" },
  rogue: { name: "Rogue", glyph: "🗡️" },
  cleric: { name: "Cleric", glyph: "✨" },
  beast: { name: "Ogre", glyph: "👹" },
  dragon: { name: "Dragon", glyph: "🐉" },
};

/** The paints on the cabinet's shelf. */
export const PAWN_PAINTS = ["#3b4fa8", "#8a1c1c", "#2f6b3a", "#c9a45c", "#6a3d9a", "#d9822b", "#e8e2d0", "#2b2b2b"];

/**
 * The miniatures cabinet: take a pawn to the table, painted and named as you
 * like, then click it and click the map to move it. Players keep a few each;
 * the game master keeps the monsters, and can move anyone's.
 */
export function PawnsPanel({ pawns, myUserId, isGm, held, onTake, onHold, onPutBack, onClear, onClose }: {
  pawns: Record<string, TablePawn>;
  myUserId: string | null;
  isGm: boolean;
  held: string | null;
  onTake: (kind: PawnKind, colour: string, label: string) => void;
  onHold: (id: string | null) => void;
  onPutBack: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [colour, setColour] = useState(PAWN_PAINTS[0]);
  const [label, setLabel] = useState("");
  const all = Object.values(pawns).sort((a, b) => a.ownerName.localeCompare(b.ownerName) || a.at - b.at);
  const mine = all.filter((pawn) => pawn.owner === myUserId);
  const limit = isGm ? PAWNS_GM : PAWNS_EACH;
  const shown = isGm ? all : mine;
  const full = mine.length >= limit;
  return (
    <div className="living-room-panel" role="dialog" aria-label="Miniatures">
      <div className="living-room-panel-head"><strong><ChessPawn size={14} /> Miniatures</strong><button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button></div>
      <p className="lr-note">Take one from the cabinet and it stands on the map in front of you. Click your pawn, then click the map to move it. {isGm ? "As the game master you can move anyone's." : `You can have ${limit} on the table.`}</p>
      <div className="lr-row" role="group" aria-label="Paint">
        {PAWN_PAINTS.map((paint) => (
          <button key={paint} type="button" className="lr-paint" style={{ background: paint }} aria-label={`Paint ${paint}`} aria-pressed={paint === colour} onClick={() => setColour(paint)} />
        ))}
      </div>
      <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={isGm ? "Name over it (Goblin 2)" : "Name over it (optional)"} aria-label="Name over the pawn" maxLength={24} />
      <div className="lr-pawn-kinds">
        {PAWN_KINDS.map((kind) => (
          <button key={kind} type="button" disabled={full || !myUserId} onClick={() => { onTake(kind, colour, label.trim()); if (isGm) setLabel(""); }} title={full ? `You have ${limit} on the table already` : `Put a ${PAWN_NAMES[kind].name.toLowerCase()} on the map`}>
            <span aria-hidden="true">{PAWN_NAMES[kind].glyph}</span>{PAWN_NAMES[kind].name}
          </button>
        ))}
      </div>
      {shown.length > 0 && (
        <>
          <small>{isGm ? `On the table (${all.length})` : `Yours on the table (${mine.length} of ${limit})`}</small>
          <ul className="lr-list">
            {shown.map((pawn) => (
              <li key={pawn.id} className={pawn.id === held ? "lr-held" : ""}>
                <span className="lr-name"><i className="lr-dot" style={{ background: pawn.colour }} />{pawn.label || PAWN_NAMES[pawn.kind].name}{isGm && pawn.owner !== myUserId ? <small> · {pawn.ownerName}</small> : null}</span>
                <button type="button" className={pawn.id === held ? "active" : ""} aria-pressed={pawn.id === held} onClick={() => onHold(pawn.id === held ? null : pawn.id)} title="Then click the map where it should go">{pawn.id === held ? "Moving…" : "Move"}</button>
                <button type="button" onClick={() => onPutBack(pawn.id)} aria-label={`Put ${pawn.label || PAWN_NAMES[pawn.kind].name} back`} title="Back in the cabinet"><Trash2 size={12} /></button>
              </li>
            ))}
          </ul>
        </>
      )}
      {(isGm ? all.length > 0 : mine.length > 1) && (
        <div className="lr-row"><button type="button" onClick={onClear}>{isGm ? "Clear the table" : "Put all mine back"}</button></div>
      )}
    </div>
  );
}
