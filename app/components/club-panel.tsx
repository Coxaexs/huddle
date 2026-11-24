"use client";

/**
 * The club's panels. Everyone gets the club bar: who is playing, the tempo,
 * what's next, a way to start the night, to take the decks, and to ask for a
 * song. Whoever has the decks gets the DJ's panel: mix into the next song in
 * a style of their choosing, remix moves on the beat, the stems of the song
 * that's playing, the filter, hold-down effects, the sampler, who mixes
 * (Real DJ, Auto DJ, or the DJ by hand), and the light desk.
 *
 * The light desk (ClubLightDesk) is the DJ's too, and anyone's while the
 * decks are free: scenes, faders, colours (following the music's notes, or
 * not), patterns and the moment buttons.
 * Everyone else sees it as it is, and has their own brightness, strobes and
 * light timing underneath.
 *
 * The crowd has a say too: More and Chill on the club bar, and cheering
 * together with the room's emotes. Real DJ follows the room's mood (and
 * builds into a drop for a cheer); a DJ at the decks sees what it wants.
 */
import { proxiedImage } from "@/app/lib/image-proxy";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AudioLines, Disc3, ExternalLink, Headphones, PartyPopper, Power, SlidersHorizontal, X } from "lucide-react";
import { apiFetch } from "../lib/client";
import { CLUB_CROWD_VOTE_MS, CLUB_STATIONS, NOTE_NAMES, type ClubCrowd, type ClubCrowdKind, type ClubInfo, type ClubNote, type ClubStation } from "@/lib/club-feed";
import {
  BEAM_FX, FLOOR_FX, LASER_FX, WALL_FX, sceneDesk,
  type ClubColour, type ClubDesk, type ClubFader, type ClubFx, type ClubFxThing, type ClubScene,
} from "@/lib/club-desk";
import { createTranslator, type MessageKey } from "@/lib/i18n";
import { currentLocale, useI18n } from "../lib/i18n-context";

/** The booth as the club route answers (see app/api/(features)/music/club). */
export interface ClubState {
  active: boolean;
  live: boolean;
  paused: boolean;
  decks: Record<"A" | "B", {
    name: string; loaded: boolean; loading: string | null; title: string | null; artist: string | null; thumbnail: string | null;
    playing: boolean; bpm: number | null; key: string | null; stems: string | null; gains: Record<string, number>; position: number; duration: number; color: number;
  }>;
  master: "A" | "B" | null;
  mix: { label: string; progress: number; started: boolean } | null;
  auto: {
    on: boolean; mode: "real" | "auto"; vibe: "chill" | "club" | "hype"; three: boolean; next: string | null; style: string; beats: number | null;
    autoplay: boolean; station: ClubStation | null;
  };
  stems: { on: boolean; available: boolean };
  crate: Array<{ title: string; artist: string }>;
  notice: string | null;
  /** A part of another song playing over the mix now (the bot's loop crate). */
  loop: { id: string; part: string; title: string | null } | null;
}

/** What the crowd sees of the night, from the light feed (a few times a second at most). */
export interface ClubStatus {
  live: boolean;
  bpm: number | null;
  info: ClubInfo | null;
  section: string;
}

export function clubAction(voiceChannelId: string, body: Record<string, unknown>) {
  return apiFetch<ClubState>("/api/music/club", { method: "POST", body: JSON.stringify({ voiceChannelId, ...body }) });
}

const stationName = (id: ClubStation) => {
  const station = CLUB_STATIONS.find((s) => s.id === id);
  return station ? `${station.emoji} ${station.label}` : id;
};

/** The mood stations as chips: "Any" and the eight moods. */
function MoodChips({ value, onPick }: { value: ClubStation | null; onPick: (station: ClubStation | null) => void }) {
  const { t } = useI18n();
  return (
    <div className="lr-chips" role="radiogroup" aria-label={t("club.moodAria")}>
      <button type="button" role="radio" aria-checked={value === null} className={value === null ? "active" : ""} onClick={() => onPick(null)}>{t("club.any")}</button>
      {CLUB_STATIONS.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={value === s.id} className={value === s.id ? "active" : ""} onClick={() => onPick(s.id)}>
          {s.emoji} {s.label}
        </button>
      ))}
    </div>
  );
}

const MODE_LABEL_KEYS: Record<string, MessageKey> = {
  real: "club.mode.real",
  auto: "club.mode.auto",
  hands: "club.mode.hands",
  player: "club.mode.player",
};

/** What the crowd has told the DJ lately, in a line (null when nobody has said anything). */
export function crowdLine(crowd: ClubCrowd | null | undefined): string | null {
  if (!crowd) return null;
  const tx = createTranslator(currentLocale());
  if (crowd.said === "drop") return tx("club.crowd.drop");
  if (crowd.said === "up") return tx("club.crowd.up");
  if (crowd.said === "down") return tx("club.crowd.down");
  const wants = (count: number, what: string) =>
    count ? tx(count === 1 ? "club.crowd.wantOne" : "club.crowd.wantMany", { count, what }) : null;
  const parts = [wants(crowd.more, tx("club.crowd.moreWhat")), wants(crowd.chill, tx("club.crowd.chillWhat"))].filter(Boolean);
  return parts.length ? tx("club.crowd.line", { parts: parts.join(" · ") }) : null;
}

export function ClubBar({ roomId, status, nowPlaying, djName, isDj, decksFree, onTakeDecks, onLeaveDecks, onOpenDecks, onOpenLights, onRequest, onCrowd }: {
  roomId: string;
  status: ClubStatus;
  nowPlaying: { title: string; artist: string } | null;
  djName: string | null;
  isDj: boolean;
  decksFree: boolean;
  onTakeDecks: () => void;
  onLeaveDecks: () => void;
  onOpenDecks: () => void;
  onOpenLights: () => void;
  onRequest: (query: string) => void;
  onCrowd: (kind: ClubCrowdKind) => void;
}) {
  const { t } = useI18n();
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /** My last tap of More / Chill, lit while it still counts. */
  const [voted, setVoted] = useState<{ kind: ClubCrowdKind; at: number } | null>(null);
  useEffect(() => {
    if (!voted) return;
    const timer = window.setTimeout(() => setVoted(null), Math.max(0, voted.at + CLUB_CROWD_VOTE_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [voted]);
  const booth = status.info && status.info.mode !== "player";
  // Real DJ follows the crowd; a DJ by hand sees it. Auto DJ plays the queue as it is.
  const canVote = Boolean(booth && !isDj && (status.info!.mode === "real" || status.info!.mode === "hands"));
  const crowd = crowdLine(status.info?.crowd);
  const vote = (kind: ClubCrowdKind) => {
    onCrowd(kind);
    setVoted({ kind, at: Date.now() });
  };
  const startNight = async () => {
    setBusy(true);
    setNote(null);
    try {
      const state = await clubAction(roomId, { op: "club" });
      setNote(state.notice || t("club.nightStarted"));
    } catch (error) {
      setNote(error instanceof Error ? error.message : t("club.botNoAnswer"));
    } finally {
      setBusy(false);
    }
  };
  const who = djName ? `DJ ${djName}` : booth ? "DJ Hoffy" : null;
  return (
    <div className="lr-club-bar" role="group" aria-label={t("club.barAria")}>
      <div className="lr-club-now">
        <span className={`lr-club-dot${status.live ? " on" : ""}`} aria-hidden="true" />
        <span className="lr-club-text">
          <strong>{nowPlaying ? nowPlaying.title : status.live ? t("club.theClub") : t("club.quietHere")}</strong>
          <small>
            {[who, booth && !djName && MODE_LABEL_KEYS[status.info!.mode] ? t(MODE_LABEL_KEYS[status.info!.mode]) : null, status.bpm ? `${Math.round(status.bpm)} BPM` : null, status.info?.key || null]
              .filter(Boolean).join(" · ") || (status.live ? t("club.mode.player") : t("club.nothingPlaying"))}
            {status.info?.mix ? t("club.mixingPct", { style: status.info.mix.style.toLowerCase(), pct: Math.round(status.info.mix.progress * 100) }) : ""}
          </small>
          {status.info?.next && <small>{t("club.next", { title: status.info.next })}</small>}
          {status.info?.loop && <small>{t("club.loopInfo", { part: status.info.loop.part, title: status.info.loop.title || t("club.anotherSong") })}</small>}
          {status.info?.station && <small>{t("club.moodLabel", { name: stationName(status.info.station) })}</small>}
        </span>
      </div>
      {canVote ? (
        <div className="lr-row lr-club-crowd" role="group" aria-label={t("club.tellDjAria")}>
          <button type="button" aria-pressed={voted?.kind === "more"} onClick={() => vote("more")} title={t("club.moreTitle")}>{t("club.moreBtn")}</button>
          <button type="button" aria-pressed={voted?.kind === "chill"} onClick={() => vote("chill")} title={t("club.chillTitle")}>{t("club.chillBtn")}</button>
          <small>{crowd ?? (status.info!.mode === "real" ? t("club.cheerHint") : t("club.djSeesCrowd"))}</small>
        </div>
      ) : crowd && booth ? (
        <small className="lr-note">{crowd}</small>
      ) : null}
      <div className="lr-row">
        {!booth && (
          <button type="button" className="primary" onClick={() => void startNight()} disabled={busy} title={t("club.startNightTitle")}>
            <PartyPopper size={14} /> {status.live ? t("club.handToDj") : t("club.startNight")}
          </button>
        )}
        {isDj ? (
          <>
            <button type="button" className="primary" onClick={onOpenDecks}><Disc3 size={14} /> {t("club.theDecks")}</button>
            <button type="button" onClick={onLeaveDecks}>{t("club.leaveDecks")}</button>
          </>
        ) : decksFree ? (
          <button type="button" onClick={onTakeDecks} title={t("club.takeDecksTitle")}><Headphones size={14} /> {t("club.takeDecks")}</button>
        ) : null}
        {!isDj && (
          <button type="button" onClick={onOpenLights} title={decksFree ? t("club.lightsTitleFree") : t("club.lightsTitleDj")}>
            <SlidersHorizontal size={14} /> {t("club.lights")}
          </button>
        )}
      </div>
      <form className="lr-row" onSubmit={(event) => { event.preventDefault(); const q = request.trim(); if (!q) return; onRequest(q); setRequest(""); setNote(t("club.requestedNote", { q })); }}>
        <input value={request} onChange={(event) => setRequest(event.target.value)} placeholder={t("club.requestPlaceholder")} aria-label={t("club.requestAria")} maxLength={200} />
        <button type="submit" disabled={!request.trim()}>{t("club.requestBtn")}</button>
      </form>
      {note && <small className="lr-note">{note}</small>}
    </div>
  );
}

const MIX_STYLES: Array<[string, MessageKey]> = [
  ["auto", "club.mix.auto"], ["blend", "club.mix.blend"], ["stem_swap", "club.mix.stem_swap"], ["acapella", "club.mix.acapella"], ["mashup", "club.mix.mashup"],
  ["drum_bridge", "club.mix.drum_bridge"], ["echo", "club.mix.echo"], ["loop_roll", "club.mix.loop_roll"], ["cut", "club.mix.cut"], ["spinback", "club.mix.spinback"],
];
const MOVES: Array<[string, MessageKey, MessageKey]> = [
  ["drop", "club.move.drop.label", "club.move.drop.hint"],
  ["acapella", "club.move.acapella.label", "club.move.acapella.hint"],
  ["beatbreak", "club.move.beatbreak.label", "club.move.beatbreak.hint"],
  ["stutter", "club.move.stutter.label", "club.move.stutter.hint"],
  ["echo", "club.move.echo.label", "club.move.echo.hint"],
];
const STEMS: Array<[string, MessageKey]> = [["drums", "club.stem.drums"], ["bass", "club.stem.bass"], ["vocals", "club.stem.vocals"], ["other", "club.stem.melody"]];
/** The loop pads: the song's own part steps out for eight bars and another song's takes over, in its key and tempo. */
const BORROW: Array<[string, MessageKey, MessageKey]> = [
  ["guitar", "club.borrow.guitar.label", "club.borrow.guitar.hint"],
  ["piano", "club.borrow.piano.label", "club.borrow.piano.hint"],
  ["bass", "club.borrow.bass.label", "club.borrow.bass.hint"],
  ["drums", "club.borrow.drums.label", "club.borrow.drums.hint"],
];
const PART_ICON: Record<string, string> = { guitar: "🎸", piano: "🎹", bass: "🎚️", drums: "🥁" };
const PADS: Array<[string, MessageKey]> = [
  ["horn", "club.pad.horn"], ["siren", "club.pad.siren"], ["laser", "club.pad.laser"], ["boom", "club.pad.boom"],
  ["clap", "club.pad.clap"], ["riser", "club.pad.riser"], ["scratch", "club.pad.scratch"], ["rewind", "club.pad.rewind"],
];
const HOLD_FX: Array<[string, MessageKey, number]> = [
  ["roll", "club.fx.roll", 2], ["echo", "club.fx.echo", 3], ["flanger", "club.fx.flanger", 5], ["reverb", "club.fx.reverb", 4],
];
const VIBES: Array<[ClubState["auto"]["vibe"], MessageKey]> = [["chill", "club.vibe.chill"], ["club", "club.vibe.club"], ["hype", "club.vibe.hype"]];
/** Who mixes: Real DJ (picks and remixes), Auto DJ (mixes the queue in order), or the DJ by hand. */
const WHO_MIXES: Array<["real" | "auto" | "hands", MessageKey, MessageKey]> = [
  ["real", "club.who.real.label", "club.who.real.hint"],
  ["auto", "club.who.auto.label", "club.who.auto.hint"],
  ["hands", "club.who.hands.label", "club.who.hands.hint"],
];

export function ClubDecksPanel({ roomId, onOpenBooth, onClose, lights, crowd }: {
  roomId: string;
  onOpenBooth: () => void;
  onClose: () => void;
  lights?: ReactNode;
  /** What the crowd is asking for (the club bar's More / Chill), for whoever has the decks. */
  crowd?: ClubCrowd | null;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"music" | "lights">("music");
  const [state, setState] = useState<ClubState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [style, setStyle] = useState("auto");
  const [startMood, setStartMood] = useState<ClubStation | null>(null);
  const [filter, setFilter] = useState(0);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    // The booth as it is now, every second and a half; every five while the bot isn't answering.
    const load = async () => {
      let wait = 1500;
      try {
        const next = await apiFetch<ClubState>(`/api/music/club?voiceChannelId=${encodeURIComponent(roomId)}`);
        if (stopped) return;
        setState(next);
        setError(null);
        if (next.notice) setNotice(next.notice);
      } catch (failure) {
        if (stopped) return;
        setError(failure instanceof Error ? failure.message : t("club.botNoAnswer"));
        wait = 5000;
      }
      timer = window.setTimeout(() => void load(), wait);
    };
    void load();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [roomId]);
  useEffect(() => () => { if (filterTimer.current) clearTimeout(filterTimer.current); }, []);

  const send = async (body: Record<string, unknown>, said?: string) => {
    try {
      const next = await clubAction(roomId, body);
      setState(next);
      setError(null);
      setNotice(next.notice || said || null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("club.botNoAnswer"));
    }
  };

  const master = state?.master ? state.decks[state.master] : state ? Object.values(state.decks).find((d) => d.playing) ?? null : null;
  const other = state && master ? state.decks[master.name === "A" ? "B" : "A"] : null;
  const onAir = Boolean(state?.active && state.live);
  const stemsReady = master?.stems === "ready";
  const who = !state?.auto.on ? "hands" : state.auto.mode;
  const [beats, setBeats] = useState<number | null>(null);
  useEffect(() => { setBeats(state?.auto.beats ?? null); }, [state?.auto.beats]);
  const beatsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (beatsTimer.current) clearTimeout(beatsTimer.current); }, []);
  const sendBeats = (value: number | null) => {
    setBeats(value);
    if (beatsTimer.current) clearTimeout(beatsTimer.current);
    beatsTimer.current = setTimeout(() => void send({ op: "auto", beats: value ?? 0 }), 250);
  };
  const sendFilter = (value: number) => {
    setFilter(value);
    if (!master) return;
    if (filterTimer.current) clearTimeout(filterTimer.current);
    filterTimer.current = setTimeout(() => void send({ op: "set", deck: master.name, param: "color", value }), 90);
  };
  const holdFx = (type: string, beat: number, on: boolean) => {
    if (on) held.current = type;
    else if (held.current !== type) return;
    else held.current = null;
    void send({ op: "fx", type, beat, on });
  };

  return (
    <div className="living-room-panel lr-decks" role="dialog" aria-label={t("club.theDecks")}>
      <div className="living-room-panel-head">
        <strong><Disc3 size={14} /> {t("club.theDecks")} {onAir && <span className="lr-onair">{t("club.onAir")}</span>}</strong>
        <button type="button" onClick={onClose} aria-label={t("common.close")}><X size={14} /></button>
      </div>
      {lights && (
        <div className="lr-tabs" role="tablist" aria-label={t("club.decksOrLightsAria")}>
          <button type="button" role="tab" aria-selected={tab === "music"} className={tab === "music" ? "active" : ""} onClick={() => setTab("music")}><Disc3 size={13} /> {t("club.music")}</button>
          <button type="button" role="tab" aria-selected={tab === "lights"} className={tab === "lights" ? "active" : ""} onClick={() => setTab("lights")}><SlidersHorizontal size={13} /> {t("club.lights")}</button>
        </div>
      )}
      {tab === "lights" && lights}
      {tab === "music" && state && onAir && crowdLine(crowd) && <p className="lr-note lr-crowd">{crowdLine(crowd)}</p>}
      {tab === "music" && !state && !error && <p className="lr-note">{t("club.findingBooth")}</p>}
      {tab === "music" && state && !onAir && (
        <div className="lr-line">
          <span className="lr-title">{t("club.boothOff")}</span>
          <small className="lr-note">{t("club.boothOffHint")}</small>
          <MoodChips value={startMood} onPick={setStartMood} />
          <button type="button" className="primary lr-wide" onClick={() => void send({ op: "club", ...(startMood ? { station: startMood } : {}) })} title={t("club.startRealDjTitle")}><PartyPopper size={14} /> {t("club.startRealDj")}</button>
          <button type="button" className="lr-wide-plain" onClick={() => void send({ op: "club", mode: "auto", ...(startMood ? { station: startMood } : {}) })} title={t("club.startAutoDjTitle")}>{t("club.startAutoDj")}</button>
        </div>
      )}
      {tab === "music" && state && onAir && (
        <>
          <div className="lr-deck-now">
            {master?.thumbnail ? <img src={proxiedImage(master.thumbnail)} alt="" /> : <span className="lr-deck-art"><AudioLines size={18} /></span>}
            <span className="lr-line">
              <span className="lr-title">{master?.title || (master?.loading ? t("club.loadingDeck", { name: master.loading }) : t("club.nothingOnAir"))}</span>
              <small>{[master?.artist, master?.bpm ? `${Math.round(master.bpm)} BPM` : null, master?.key, master ? t("club.deckNum", { name: master.name }) : null].filter(Boolean).join(" · ")}</small>
              <small>{t("club.next", { title: other?.loading ? t("club.loadingLower", { name: other.loading }) : other?.loaded && !other.playing ? (other.title ?? "") : state.auto.next || state.crate[0]?.title || t("club.queueEmpty") })}</small>
            </span>
          </div>
          {state.mix && (
            <div className="lr-mixbar" aria-label={t("club.mixingLabel", { label: state.mix.label })}>
              <i style={{ width: `${Math.round(state.mix.progress * 100)}%` }} />
              <span>{state.mix.started ? t("club.mixingLabel", { label: state.mix.label }) : t("club.mixPlanned", { label: state.mix.label })}</span>
            </div>
          )}
          <div className="lr-heading">{t("club.mixIntoNext")}</div>
          <div className="lr-chips" role="radiogroup" aria-label={t("club.mixStyleAria")}>
            {MIX_STYLES.map(([id, labelKey]) => (
              <button key={id} type="button" role="radio" aria-checked={style === id} className={style === id ? "active" : ""} onClick={() => setStyle(id)}>{t(labelKey)}</button>
            ))}
          </div>
          <button type="button" className="primary lr-wide" onClick={() => void send({ op: "skip", style }, t("club.mixingNow"))}>{t("club.mixNow")}</button>
          <div className="lr-heading">{t("club.remix")}</div>
          <div className="lr-pads">
            {MOVES.map(([move, labelKey, hintKey]) => (
              <button key={move} type="button" title={t(hintKey)} onClick={() => void send({ op: "club_move", move })} disabled={(move === "acapella" || move === "beatbreak") && !stemsReady}>{t(labelKey)}</button>
            ))}
          </div>
          <div className="lr-heading">{t("club.borrowHeading")}</div>
          <div className="lr-pads lr-pads-4">
            {BORROW.map(([part, labelKey, hintKey]) => (
              <button key={part} type="button" title={t(hintKey)} onClick={() => void send({ op: "club_loop", part }, t("club.findingFit"))} disabled={!master?.bpm}>{t(labelKey)}</button>
            ))}
          </div>
          {state.loop && (
            <div className="lr-row lr-loop-now">
              <small>{PART_ICON[state.loop.part]} {t("club.loopInfo", { part: state.loop.part, title: state.loop.title || t("club.anotherSong") }).replace(/^\+\s*/, "")}</small>
              <button type="button" title={t("club.loopDownTitle")} onClick={() => void send({ op: "loop_vote", id: state.loop!.id, vote: "down" })}>👎</button>
              <button type="button" title={t("club.loopUpTitle")} onClick={() => void send({ op: "loop_vote", id: state.loop!.id, vote: "up" })}>👍</button>
            </div>
          )}
          <div className="lr-heading">{t("club.stemsHeading")} {master ? `· ${t("club.deckNum", { name: master.name })}` : ""}{master && !stemsReady ? (master.stems === "separating" ? t("club.stemsSeparating") : t("club.stemsNone")) : ""}</div>
          <div className="lr-row">
            {STEMS.map(([stem, labelKey]) => {
              const on = (master?.gains[stem] ?? 1) > 0.5;
              return (
                <button key={stem} type="button" className={on ? "active" : ""} aria-pressed={on} disabled={!master || !stemsReady}
                  onClick={() => master && void send({ op: "set", deck: master.name, stem, value: on ? 0 : 1 })}>{t(labelKey)}</button>
              );
            })}
          </div>
          <label className="lr-field">
            <small>{t("club.filterLabel", { mode: filter < -0.03 ? t("club.filterLow") : filter > 0.03 ? t("club.filterHigh") : t("club.filterOff") })}</small>
            <span className="lr-row">
              <input type="range" min={-1} max={1} step={0.02} value={filter} onChange={(event) => sendFilter(Number(event.target.value))} disabled={!master} aria-label={t("club.filterAria")} />
              <button type="button" onClick={() => sendFilter(0)} disabled={!master || Math.abs(filter) < 0.03}>{t("club.reset")}</button>
            </span>
          </label>
          <div className="lr-heading">{t("club.effectsHold")}</div>
          <div className="lr-row">
            {HOLD_FX.map(([type, labelKey, beat]) => (
              <button key={type} type="button" className="lr-hold"
                onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); holdFx(type, beat, true); }}
                onPointerUp={() => holdFx(type, beat, false)} onPointerCancel={() => holdFx(type, beat, false)}
                onKeyDown={(event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) holdFx(type, beat, true); }}
                onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") holdFx(type, beat, false); }}>{t(labelKey)}</button>
            ))}
          </div>
          <div className="lr-heading">{t("club.sampler")}</div>
          <div className="lr-pads lr-pads-4">
            {PADS.map(([name, labelKey]) => <button key={name} type="button" onClick={() => void send({ op: "sample", name })}>{t(labelKey)}</button>)}
          </div>
          <div className="lr-heading">{t("club.moodHeading")}</div>
          <MoodChips value={state.auto.station} onPick={(station) => void send({ op: "auto", station }, station ? t("club.moodPicked", { name: stationName(station) }) : t("club.moodAny"))} />
          <div className="lr-heading">{t("club.whoMixes")}</div>
          <div className="lr-chips" role="radiogroup" aria-label={t("club.whoMixes")}>
            {WHO_MIXES.map(([id, labelKey, hintKey]) => {
              const label = t(labelKey);
              return (
                <button key={id} type="button" role="radio" aria-checked={who === id} className={who === id ? "active" : ""} title={t(hintKey)}
                  onClick={() => void send(id === "hands" ? { op: "auto", on: false } : { op: "auto", mode: id, on: true }, id === "hands" ? t("club.handsMsg") : t("club.isMixingMsg", { label }))}>
                  {label}
                </button>
              );
            })}
          </div>
          {who !== "hands" && (
            <label className="living-room-switch">
              <span><strong>{t("club.autoplay")}</strong><small>{t("club.autoplayDesc")}</small></span>
              <input type="checkbox" checked={state.auto.autoplay}
                onChange={() => void send({ op: "auto", autoplay: !state.auto.autoplay }, state.auto.autoplay ? t("club.autoplayOffMsg") : t("club.autoplayOnMsg"))} />
            </label>
          )}
          {who === "real" && (
            <>
              <div className="lr-chips" role="radiogroup" aria-label={t("club.vibeAria")}>
                {VIBES.map(([vibe, labelKey]) => (
                  <button key={vibe} type="button" role="radio" aria-checked={state.auto.vibe === vibe} className={state.auto.vibe === vibe ? "active" : ""} onClick={() => void send({ op: "auto", vibe })}>{t(labelKey)}</button>
                ))}
                <button type="button" className={state.auto.three ? "active" : ""} aria-pressed={state.auto.three} onClick={() => void send({ op: "auto", three: !state.auto.three })} title={t("club.threeSongsTitle")}>{t("club.threeSongs")}</button>
              </div>
            </>
          )}
          {who === "auto" && (
            <>
              <small className="lr-note">{t("club.autoDjHint")}</small>
              <div className="lr-chips" role="radiogroup" aria-label={t("club.autoDjMixesAria")}>
                {MIX_STYLES.map(([id, labelKey]) => (
                  <button key={id} type="button" role="radio" aria-checked={state.auto.style === id} className={state.auto.style === id ? "active" : ""} onClick={() => void send({ op: "auto", style: id })}>{t(labelKey)}</button>
                ))}
              </div>
              <label className="lr-field">
                <small>{t("club.mixLength", { val: beats ? t("club.mixLengthBeats", { beats, bars: beats / 4 }) : t("club.mixLengthStyle") })}</small>
                <span className="lr-row">
                  <input type="range" min={0} max={64} step={4} value={beats ?? 0} aria-label={t("club.mixLengthAria")}
                    onChange={(event) => sendBeats(Number(event.target.value) || null)} />
                  <button type="button" onClick={() => sendBeats(null)} disabled={!beats}>{t("club.mix.auto")}</button>
                </span>
              </label>
            </>
          )}
        </>
      )}
      {tab === "music" && (notice || error) && <small className={error ? "lr-note lr-warn" : "lr-note"}>{error || notice}</small>}
      {tab === "music" && (
        <div className="lr-row">
          <button type="button" onClick={onOpenBooth} title={t("club.fullBoothTitle")}><ExternalLink size={13} /> {t("club.fullBooth")}</button>
          {onAir && <button type="button" onClick={() => void send({ op: "stop" }, t("club.endNightMsg"))}><Power size={13} /> {t("club.endNight")}</button>}
        </div>
      )}
    </div>
  );
}

/* ---------- the light desk ---------- */

const SCENES: Array<[Exclude<ClubScene, "custom">, MessageKey, MessageKey]> = [
  ["auto", "club.scene.auto.label", "club.scene.auto.hint"],
  ["warmup", "club.scene.warmup.label", "club.scene.warmup.hint"],
  ["peak", "club.scene.peak.label", "club.scene.peak.hint"],
  ["chill", "club.scene.chill.label", "club.scene.chill.hint"],
  ["lasers", "club.scene.lasers.label", "club.scene.lasers.hint"],
];
const FADERS: Array<[ClubFader, MessageKey, MessageKey]> = [
  ["master", "club.fader.master.label", "club.fader.master.hint"],
  ["beams", "club.fader.beams.label", "club.fader.beams.hint"],
  ["move", "club.fader.move.label", "club.fader.move.hint"],
  ["lasers", "club.fader.lasers.label", "club.fader.lasers.hint"],
  ["strobe", "club.fader.strobe.label", "club.fader.strobe.hint"],
  ["haze", "club.fader.haze.label", "club.fader.haze.hint"],
  ["floor", "club.fader.floor.label", "club.fader.floor.hint"],
  ["react", "club.fader.react.label", "club.fader.react.hint"],
  ["colourSpeed", "club.fader.colourSpeed.label", "club.fader.colourSpeed.hint"],
];
/** With the colours, not the other faders. */
const MIX_FADER: [ClubFader, MessageKey, MessageKey] = ["mix", "club.fader.mix.label", "club.fader.mix.hint"];
const COLOURS: Array<[ClubColour, MessageKey, MessageKey]> = [
  ["mood", "club.colour.mood.label", "club.colour.mood.hint"],
  ["theme", "club.colour.theme.label", "club.colour.theme.hint"],
  ["rainbow", "club.colour.rainbow.label", "club.colour.rainbow.hint"],
  ["key", "club.colour.key.label", "club.colour.key.hint"],
  ["pick", "club.colour.pick.label", "club.colour.pick.hint"],
];
const PATTERN_NAME_KEYS: Record<string, MessageKey> = {
  auto: "club.pat.auto", ripple: "club.pat.ripple", checker: "club.pat.checker", stems: "club.pat.stems", chase: "club.pat.chase", sparkle: "club.pat.sparkle",
  bars: "club.pat.bars", rings: "club.pat.rings", tunnel: "club.pat.tunnel", waves: "club.pat.waves", history: "club.pat.history",
  sweep: "club.pat.sweep", fan: "club.pat.fan", circle: "club.pat.circle", crowd: "club.pat.crowd", still: "club.pat.still", sheet: "club.pat.sheet", cross: "club.pat.cross",
};
const PATTERNS: Array<["beamFx" | "laserFx" | "floorFx" | "wallFx", MessageKey, readonly string[]]> = [
  ["beamFx", "club.patGroup.beamFx", BEAM_FX],
  ["laserFx", "club.patGroup.laserFx", LASER_FX],
  ["floorFx", "club.patGroup.floorFx", FLOOR_FX],
  ["wallFx", "club.patGroup.wallFx", WALL_FX],
];
const SHOTS: Array<[ClubFxThing, MessageKey, MessageKey]> = [
  ["confetti", "club.shot.confetti.label", "club.shot.confetti.hint"],
  ["co2", "club.shot.co2.label", "club.shot.co2.hint"],
  ["pyro", "club.shot.pyro.label", "club.shot.pyro.hint"],
  ["flash", "club.shot.flash.label", "club.shot.flash.hint"],
  ["drop", "club.shot.drop.label", "club.shot.drop.hint"],
];

/** This listener's own view of the show. */
export interface ClubLightSettings { strobes: boolean; nudgeMs: number; brightness: number }

const NOTE_LABEL_KEYS: MessageKey[] = ["club.note.bass", "club.note.chords", "club.note.voice"];

/** The notes the lights hear now, a few times a second: what the colours are following. */
function NotesNow({ read }: { read: () => readonly (ClubNote | null)[] | null }) {
  const { t } = useI18n();
  const [notes, setNotes] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = read();
      setNotes(now ? now.map((note, k) => (note ? `${t(NOTE_LABEL_KEYS[k])} ${NOTE_NAMES[note.pc]}` : "")).filter(Boolean).join(" · ") : "");
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [read, t]);
  return <p className="lr-note lr-notes-now" aria-live="off">{notes || t("club.notesEmpty")}</p>;
}

export function ClubLightDesk({ desk, canRun, runBy, onDesk, onFx, mine, onMine, readNotes }: {
  desk: ClubDesk;
  /** This person may work the desk (at the decks, or nobody is). */
  canRun: boolean;
  /** Who runs it, when it's not this person. */
  runBy: string | null;
  onDesk: (desk: ClubDesk) => void;
  onFx: (fx: ClubFx) => void;
  mine: ClubLightSettings;
  onMine: (patch: Partial<ClubLightSettings>) => void;
  /** The notes the show hears now (bass, chords, voice). */
  readNotes?: () => readonly (ClubNote | null)[] | null;
}) {
  const { t } = useI18n();
  const held = useRef<ClubFxThing | null>(null);
  const onFxRef = useRef(onFx);
  onFxRef.current = onFx;
  const set = (patch: Partial<ClubDesk>) => onDesk({ ...desk, ...patch, scene: "scene" in patch ? patch.scene! : "custom" });
  const hold = (thing: ClubFxThing, on: boolean) => {
    if (on) held.current = thing;
    else if (held.current !== thing) return;
    else held.current = null;
    onFx({ thing, on });
  };
  const fader = ([key, labelKey, hintKey]: [ClubFader, MessageKey, MessageKey]) => {
    const label = t(labelKey);
    return (
      <label key={key} className="lr-fader" title={t(hintKey)}>
        <small>{label}</small>
        <input type="range" min={0} max={1} step={0.01} value={desk[key]} aria-label={label}
          onChange={(event) => set({ [key]: Number(event.target.value) } as Partial<ClubDesk>)} />
        <output>{Math.round(desk[key] * 100)}</output>
      </label>
    );
  };
  // Let go of a held blackout or strobe if the desk goes away mid-hold.
  useEffect(() => () => { if (held.current) onFxRef.current({ thing: held.current, on: false }); }, []);
  return (
    <div className="lr-desk">
      {!canRun && <p className="lr-note">{runBy ? t("club.runByDj", { name: runBy }) : t("club.runByDecks")}{t("club.yoursToChange")}</p>}
      <fieldset disabled={!canRun}>
        <div className="lr-heading">{t("club.scenes")}</div>
        <div className="lr-chips" role="radiogroup" aria-label={t("club.lightSceneAria")}>
          {SCENES.map(([id, labelKey, hintKey]) => (
            <button key={id} type="button" role="radio" aria-checked={desk.scene === id} className={desk.scene === id ? "active" : ""} title={t(hintKey)}
              onClick={() => onDesk(sceneDesk(id, desk))}>{t(labelKey)}</button>
          ))}
          {desk.scene === "custom" && <span className="lr-chip-note">{t("club.custom")}</span>}
        </div>
        <div className="lr-heading">{t("club.moments")}</div>
        <div className="lr-pads lr-pads-3">
          {SHOTS.map(([thing, labelKey, hintKey]) => <button key={thing} type="button" title={t(hintKey)} onClick={() => onFx({ thing })}>{t(labelKey)}</button>)}
          {(["blackout", "strobe"] as const).map((thing) => (
            <button key={thing} type="button" className="lr-hold" title={thing === "blackout" ? t("club.blackoutTitle") : t("club.strobeTitle")}
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); hold(thing, true); }}
              onPointerUp={() => hold(thing, false)} onPointerCancel={() => hold(thing, false)}
              onKeyDown={(event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) hold(thing, true); }}
              onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") hold(thing, false); }}>
              {thing === "blackout" ? t("club.blackout") : t("club.strobe")} <small>{t("club.hold")}</small>
            </button>
          ))}
        </div>
        <div className="lr-heading">{t("club.faders")}</div>
        <div className="lr-faders">{FADERS.map(fader)}</div>
        <div className="lr-heading">{t("club.colours")}</div>
        <div className="lr-chips" role="radiogroup" aria-label={t("club.colours")}>
          {COLOURS.map(([id, labelKey, hintKey]) => (
            <button key={id} type="button" role="radio" aria-checked={desk.colour === id} className={desk.colour === id ? "active" : ""} title={t(hintKey)} onClick={() => set({ colour: id })}>{t(labelKey)}</button>
          ))}
        </div>
        {desk.colour === "pick" && (
          <input className="lr-hue" type="range" min={0} max={1} step={0.005} value={desk.hue} aria-label={t("club.colourAria")}
            style={{ accentColor: `hsl(${Math.round(desk.hue * 360)} 100% 55%)` }} onChange={(event) => set({ hue: Number(event.target.value) })} />
        )}
        <div className="lr-faders">{fader(MIX_FADER)}</div>
        <label className="living-room-switch">
          <span><strong>{t("club.followNotes")}</strong><small>{t("club.followNotesDesc")}</small></span>
          <input type="checkbox" checked={desk.notes} onChange={(event) => set({ notes: event.target.checked })} />
        </label>
        {desk.notes && readNotes && <NotesNow read={readNotes} />}
        {PATTERNS.map(([key, labelKey, options]) => {
          const label = t(labelKey);
          return (
            <div key={key}>
              <div className="lr-heading">{label}</div>
              <div className="lr-chips" role="radiogroup" aria-label={t("club.patternAria", { label })}>
                {options.map((id) => (
                  <button key={id} type="button" role="radio" aria-checked={desk[key] === id} className={desk[key] === id ? "active" : ""}
                    onClick={() => set({ [key]: id } as Partial<ClubDesk>)}>{PATTERN_NAME_KEYS[id] ? t(PATTERN_NAME_KEYS[id]) : id}</button>
                ))}
              </div>
            </div>
          );
        })}
        <label className="living-room-switch">
          <span><strong>{t("club.autoFxTitle")}</strong><small>{t("club.autoFxDesc")}</small></span>
          <input type="checkbox" checked={desk.autoFx} onChange={(event) => set({ autoFx: event.target.checked })} />
        </label>
      </fieldset>
      <div className="lr-heading">{t("club.justForYou")}</div>
      <label className="living-room-slider">
        <span>{t("club.brightness", { pct: Math.round(mine.brightness * 100) })}</span>
        <input type="range" min={0.3} max={1.5} step={0.05} value={mine.brightness} aria-label={t("club.brightnessAria")}
          onChange={(event) => onMine({ brightness: Number(event.target.value) })} />
      </label>
      <label className="living-room-switch">
        <span><strong>{t("club.strobes")}</strong><small>{t("club.strobesDesc")}</small></span>
        <input type="checkbox" checked={mine.strobes} onChange={(event) => onMine({ strobes: event.target.checked })} />
      </label>
      <label className="living-room-slider">
        <span>{t("club.lightTiming", { val: mine.nudgeMs > 0 ? t("club.timingLater", { ms: mine.nudgeMs }) : mine.nudgeMs < 0 ? t("club.timingSooner", { ms: -mine.nudgeMs }) : t("club.timingAsSent") })}</span>
        <input type="range" min={-150} max={400} step={10} value={mine.nudgeMs} aria-label={t("club.lightTimingAria")}
          onChange={(event) => onMine({ nudgeMs: Number(event.target.value) })} />
      </label>
    </div>
  );
}

/** The light desk on its own, for anyone in the club who isn't at the decks. */
export function ClubLightsPanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="living-room-panel lr-decks" role="dialog" aria-label={t("club.theLights")}>
      <div className="living-room-panel-head">
        <strong><SlidersHorizontal size={14} /> {t("club.theLights")}</strong>
        <button type="button" onClick={onClose} aria-label={t("common.close")}><X size={14} /></button>
      </div>
      {children}
    </div>
  );
}
