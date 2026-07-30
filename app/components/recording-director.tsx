"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Circle,
  CirclePause,
  CirclePlay,
  Clapperboard,
  Flag,
  Gauge,
  HardDrive,
  ShieldCheck,
  Square,
} from "lucide-react";
import type {
  CharacterPresentation,
  CharacterReveal,
  RecordingScene,
  RecordingState,
  VoiceParticipant,
} from "@/lib/protocol";
import { apiFetch } from "../lib/client";

interface Props {
  channelId: string;
  recording: RecordingState | null;
  participants: VoiceParticipant[];
  currentUserId: string;
  canControl: boolean;
  speaking: Set<string>;
  onNotice: (message: string) => void;
}

const SCENES: Array<{ id: RecordingScene; label: string }> = [
  { id: "party", label: "Party" },
  { id: "speaker", label: "Speaker" },
  { id: "battlemap", label: "Battlemap" },
  { id: "split", label: "Split" },
  { id: "intermission", label: "Intermission" },
];

function formatTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "unknown";
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function playRecordTone(kind: "start" | "stop"): void {
  try {
    const context = new AudioContext();
    const notes = kind === "start" ? [440, 660, 880] : [660, 440];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.13);
      gain.gain.exponentialRampToValueAtTime(
        0.12,
        context.currentTime + index * 0.13 + 0.015,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + index * 0.13 + 0.11,
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + index * 0.13);
      oscillator.stop(context.currentTime + index * 0.13 + 0.12);
    });
    window.setTimeout(() => void context.close(), notes.length * 160 + 100);
  } catch {
    // The persistent visual indicator remains if autoplay blocks the tone.
  }
}

export function RecordingDirector({
  channelId,
  recording,
  participants,
  currentUserId,
  canControl,
  speaking,
  onNotice,
}: Props) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [directorOpen, setDirectorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [campaign, setCampaign] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("");
  const [resolution, setResolution] = useState("1920x1080");
  const [frameRate, setFrameRate] = useState("30");
  const [theme, setTheme] = useState("tavern");
  const [separateAudio, setSeparateAudio] = useState(false);
  const [retentionDays, setRetentionDays] = useState("90");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());
  const [characterOpen, setCharacterOpen] = useState(false);
  const [characterName, setCharacterName] = useState("");
  const [className, setClassName] = useState("");
  const [characterLevel, setCharacterLevel] = useState("");
  const [accentColor, setAccentColor] = useState("#ffd67c");
  const [showPlayerName, setShowPlayerName] = useState(false);
  const [publicCard, setPublicCard] = useState("");
  const [portraitKey, setPortraitKey] = useState<string | null>(null);
  const [artworkKey, setArtworkKey] = useState<string | null>(null);
  const [presentations, setPresentations] = useState<CharacterPresentation[]>([]);
  const [revealUserId, setRevealUserId] = useState("");
  const [revealMode, setRevealMode] =
    useState<CharacterReveal["mode"]>("compact");
  const [revealTitle, setRevealTitle] = useState("");
  const [revealFields, setRevealFields] = useState("");
  const [timeline, setTimeline] = useState<
    Array<{
      id: string;
      kind: string;
      atMs: number;
      payload: Record<string, unknown>;
      automatic: boolean;
    }>
  >([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState<{
    outputs: Array<{
      kind: string;
      filename: string;
      contentType: string;
      bytes: number;
    }>;
    diagnostics: Array<{
      level: string;
      code: string;
      message: string;
    }>;
    events: unknown[];
  } | null>(null);
  const previousStatus = useRef(recording?.status);

  const people = useMemo(
    () => participants.filter((person) => !person.bot && !person.recorder),
    [participants],
  );
  const myConsent = recording?.consents.find(
    (consent) => consent.userId === currentUserId,
  );

  useEffect(() => {
    if (!setupOpen) return;
    setSelected(new Set(people.map((person) => person.id)));
  }, [setupOpen, people]);

  useEffect(() => {
    const open = () => {
      if (
        canControl &&
        (!recording ||
          ["completed", "failed", "cancelled"].includes(recording.status))
      ) {
        setSetupOpen(true);
      }
    };
    window.addEventListener("huddle-recording-setup", open);
    return () => window.removeEventListener("huddle-recording-setup", open);
  }, [canControl, recording]);

  useEffect(() => {
    if (!recording || (recording.status !== "recording" && recording.status !== "countdown")) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    const previous = previousStatus.current;
    const next = recording?.status;
    if (next === "recording" && previous !== "recording") playRecordTone("start");
    if (
      previous &&
      ["recording", "paused", "finalizing"].includes(previous) &&
      (next === "completed" || next === "failed" || !next)
    ) {
      playRecordTone("stop");
    }
    previousStatus.current = next;
  }, [recording?.status]);

  useEffect(() => {
    if (!recording) {
      setPresentations([]);
      return;
    }
    apiFetch<{ presentations: CharacterPresentation[] }>(
      `/api/recordings/presentation?sessionId=${encodeURIComponent(recording.id)}`,
    )
      .then((data) => {
        setPresentations(data.presentations || []);
        setRevealUserId((current) => current || data.presentations?.[0]?.userId || "");
        const mine = data.presentations?.find(
          (entry) => entry.userId === currentUserId,
        );
        if (mine) {
          setCharacterName(mine.characterName);
          setClassName(mine.className || "");
          setCharacterLevel(mine.level ? String(mine.level) : "");
          setAccentColor(mine.accentColor);
          setShowPlayerName(Boolean(mine.playerName));
          setPublicCard(
            mine.publicCard
              .map((field) => `${field.label}: ${field.value}`)
              .join("\n"),
          );
        }
      })
      .catch(() => undefined);
  }, [currentUserId, recording?.id]);

  useEffect(() => {
    if (!directorOpen || !recording) return;
    apiFetch<{
      events: Array<{
        id: string;
        kind: string;
        atMs: number;
        payload: Record<string, unknown>;
        automatic: boolean;
      }>;
    }>(`/api/recordings?sessionId=${encodeURIComponent(recording.id)}`)
      .then((data) =>
        setTimeline(
          (data.events || []).filter((event) =>
            ["marker", "scene", "automatic.scene", "reveal"].includes(event.kind),
          ),
        ),
      )
      .catch(() => undefined);
  }, [directorOpen, recording?.id]);

  useEffect(() => {
    if (
      !recording ||
      !["completed", "failed"].includes(recording.status)
    ) {
      return;
    }
    apiFetch<{
      outputs: Array<{
        kind: string;
        filename: string;
        contentType: string;
        bytes: number;
      }>;
      diagnostics: Array<{
        level: string;
        code: string;
        message: string;
      }>;
      events: unknown[];
    }>(`/api/recordings?sessionId=${encodeURIComponent(recording.id)}`)
      .then(setSummary)
      .catch(() => undefined);
  }, [recording?.id, recording?.status]);

  async function act(
    action: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    if (!recording) return;
    setBusy(true);
    try {
      await apiFetch("/api/recordings", {
        method: "POST",
        body: JSON.stringify({ action, sessionId: recording.id, ...extra }),
      });
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Recording control failed.");
    } finally {
      setBusy(false);
    }
  }

  async function setup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/api/recordings", {
        method: "POST",
        body: JSON.stringify({
          action: "setup",
          channelId,
          title,
          campaign,
          episodeNumber: episodeNumber ? Number(episodeNumber) : undefined,
          resolution,
          frameRate: Number(frameRate),
          theme,
          separateAudio,
          retentionDays: Number(retentionDays),
          automaticDirection: true,
          participantIds: [...selected],
        }),
      });
      setSetupOpen(false);
      setDirectorOpen(true);
      onNotice("Consent request sent to the selected participants.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not set up recording.");
    } finally {
      setBusy(false);
    }
  }

  function fieldsFromText(value: string) {
    return value
      .split("\n")
      .map((line) => {
        const [label, ...rest] = line.split(":");
        return { label: label?.trim(), value: rest.join(":").trim() };
      })
      .filter((entry) => entry.label && entry.value);
  }

  async function uploadCharacterImage(
    file: File | null,
    kind: "portrait" | "artwork",
  ) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploaded = await apiFetch<{ key: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      if (kind === "portrait") setPortraitKey(uploaded.key);
      else setArtworkKey(uploaded.key);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCharacter() {
    if (!recording) return;
    setBusy(true);
    try {
      const result = await apiFetch<{
        presentation: CharacterPresentation | null;
      }>("/api/recordings/presentation", {
        method: "POST",
        body: JSON.stringify({
          action: "save",
          sessionId: recording.id,
          characterName,
          className,
          level: characterLevel ? Number(characterLevel) : undefined,
          accentColor,
          showPlayerName,
          portraitKey,
          artworkKey,
          publicCard: fieldsFromText(publicCard),
        }),
      });
      if (result.presentation) {
        setPresentations((current) => [
          ...current.filter(
            (entry) => entry.userId !== result.presentation!.userId,
          ),
          result.presentation!,
        ]);
      }
      onNotice("Public character presentation saved.");
      setCharacterOpen(false);
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "Could not save character.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function showReveal(
    mode = revealMode,
    userId = revealUserId || currentUserId,
  ) {
    if (!recording) return;
    setBusy(true);
    try {
      await apiFetch("/api/recordings/presentation", {
        method: "POST",
        body: JSON.stringify({
          action: "reveal",
          sessionId: recording.id,
          userId,
          mode,
          title: revealTitle || undefined,
          fields: fieldsFromText(revealFields),
          durationMs: 8_000,
        }),
      });
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Reveal failed.");
    } finally {
      setBusy(false);
    }
  }

  async function updateTimelineEvent(
    eventId: string,
    patch: { name?: string; atMs?: number },
  ) {
    if (!recording) return;
    try {
      await apiFetch("/api/recordings", {
        method: "POST",
        body: JSON.stringify({
          action: "event-update",
          sessionId: recording.id,
          eventId,
          ...patch,
        }),
      });
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Timeline edit failed.");
    }
  }

  async function deleteTimelineEvent(eventId: string) {
    if (!recording) return;
    try {
      await apiFetch("/api/recordings", {
        method: "POST",
        body: JSON.stringify({
          action: "event-delete",
          sessionId: recording.id,
          eventId,
        }),
      });
      setTimeline((current) => current.filter((event) => event.id !== eventId));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not delete event.");
    }
  }

  const activeElapsed =
    recording &&
    (recording.status === "recording" || recording.status === "countdown") &&
    recording.startedAt
      ? recording.elapsedMs + Math.max(0, now - new Date(recording.updatedAt).getTime())
      : recording?.elapsedMs || 0;
  const red = recording && ["countdown", "recording"].includes(recording.status);

  return (
    <>
      <div className={`recording-room-banner ${red ? "live" : ""}`}>
        {recording ? (
          <>
            <span className="recording-dot" aria-hidden="true" />
            <strong>
              {recording.status === "paused"
                ? "Recording paused"
                : recording.status === "awaiting-consent"
                  ? "Recording awaiting consent"
                  : recording.status === "finalizing"
                    ? "Finalizing recording"
                    : recording.status === "completed"
                      ? "Recording complete"
                      : recording.status === "failed"
                        ? "Recording failed"
                        : recording.status === "countdown"
                          ? "Recording starts shortly"
                          : "Recording"}
            </strong>
            <span>{recording.title}</span>
            {red && <time>{formatTime(activeElapsed)}</time>}
            {canControl && (
              <button
                type="button"
                onClick={() => {
                  if (["completed", "failed", "cancelled"].includes(recording.status)) {
                    setSetupOpen(true);
                  } else {
                    setDirectorOpen((open) => !open);
                  }
                }}
              >
                <Clapperboard size={15} />
                {["completed", "failed", "cancelled"].includes(recording.status)
                  ? "New session"
                  : "Director"}
              </button>
            )}
            {["completed", "failed"].includes(recording.status) && (
              <button type="button" onClick={() => setSummaryOpen(true)}>
                Summary
              </button>
            )}
            {canControl &&
              ["completed", "failed", "cancelled"].includes(recording.status) && (
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Move this recording's local media to the recorder trash?",
                      )
                    ) {
                      void act("delete");
                    }
                  }}
                >
                  Delete media
                </button>
              )}
            {myConsent && (
              <button type="button" onClick={() => setCharacterOpen(true)}>
                Character presentation
              </button>
            )}
          </>
        ) : canControl ? (
          <button
            type="button"
            className="record-session-button"
            onClick={() => setSetupOpen(true)}
          >
            <Circle size={15} /> Record D&amp;D Session
          </button>
        ) : (
          <span>No session is being recorded.</span>
        )}
      </div>

      {recording &&
        myConsent &&
        (myConsent.decision === "pending" || myConsent.decision === "declined") && (
          <section className="recording-consent" role="alertdialog" aria-live="assertive">
            <ShieldCheck size={24} />
            <div>
              <strong>Consent to be recorded?</strong>
              <p>
                “{recording.title}” will include your room audio and public character
                presentation. You can withdraw later; recording will pause immediately.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("consent", { decision: "accepted" })}
            >
              I consent
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => void act("consent", { decision: "declined" })}
            >
              Decline
            </button>
          </section>
        )}

      {recording && myConsent?.decision === "accepted" && red && (
        <button
          type="button"
          className="recording-withdraw"
          disabled={busy}
          onClick={() => void act("consent", { decision: "withdrawn" })}
        >
          Withdraw recording consent
        </button>
      )}

      {setupOpen && (
        <div className="recording-modal-backdrop" role="presentation">
          <form className="recording-setup" onSubmit={setup}>
            <header>
              <div>
                <span className="eyebrow">Virtual production</span>
                <h2>Record D&amp;D Session</h2>
              </div>
              <button type="button" onClick={() => setSetupOpen(false)} aria-label="Close">
                ×
              </button>
            </header>
            <label>
              Session title
              <input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <div className="recording-form-row">
              <label>
                Campaign
                <input maxLength={120} value={campaign} onChange={(e) => setCampaign(e.target.value)} />
              </label>
              <label>
                Episode
                <input type="number" min={0} max={9999} value={episodeNumber} onChange={(e) => setEpisodeNumber(e.target.value)} />
              </label>
            </div>
            <div className="recording-form-row">
              <label>
                Resolution
                <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                  <option value="1920x1080">1080p</option>
                  <option value="1280x720">720p</option>
                </select>
              </label>
              <label>
                Frame rate
                <select value={frameRate} onChange={(e) => setFrameRate(e.target.value)}>
                  <option value="30">30 fps</option>
                  <option value="60">60 fps</option>
                </select>
              </label>
              <label>
                Theme
                <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                  <option value="tavern">Tavern</option>
                  <option value="parchment">Parchment</option>
                  <option value="minimal">Minimal</option>
                  <option value="arcane">Arcane</option>
                  <option value="noir">Noir</option>
                </select>
              </label>
            </div>
            <fieldset>
              <legend>Participants to record</legend>
              {people.map((person) => (
                <label key={person.id} className="recording-person">
                  <input
                    type="checkbox"
                    checked={selected.has(person.id)}
                    onChange={(event) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(person.id);
                        else next.delete(person.id);
                        return next;
                      })
                    }
                  />
                  <span>{person.displayName}</span>
                </label>
              ))}
            </fieldset>
            <label className="recording-checkbox">
              <input type="checkbox" checked={separateAudio} onChange={(e) => setSeparateAudio(e.target.checked)} />
              Save separate participant audio tracks
            </label>
            <label>
              Local retention (days)
              <input
                type="number"
                min={1}
                max={3650}
                value={retentionDays}
                onChange={(event) => setRetentionDays(event.target.value)}
              />
            </label>
            <footer>
              <button type="button" onClick={() => setSetupOpen(false)}>Cancel</button>
              <button type="submit" disabled={busy || !selected.size}>
                Request consent
              </button>
            </footer>
          </form>
        </div>
      )}

      {characterOpen && recording && (
        <div className="recording-modal-backdrop" role="presentation">
          <section className="recording-setup character-presentation-editor">
            <header>
              <div>
                <span className="eyebrow">Viewer-safe profile</span>
                <h2>Character presentation</h2>
              </div>
              <button type="button" onClick={() => setCharacterOpen(false)}>×</button>
            </header>
            <div className="recording-form-row">
              <label>
                Character name
                <input value={characterName} onChange={(event) => setCharacterName(event.target.value)} />
              </label>
              <label>
                Class
                <input value={className} onChange={(event) => setClassName(event.target.value)} />
              </label>
              <label>
                Level
                <input type="number" min={1} max={30} value={characterLevel} onChange={(event) => setCharacterLevel(event.target.value)} />
              </label>
            </div>
            <div className="recording-form-row">
              <label>
                Portrait
                <input type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => void uploadCharacterImage(event.target.files?.[0] || null, "portrait")} />
              </label>
              <label>
                Full-body artwork
                <input type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => void uploadCharacterImage(event.target.files?.[0] || null, "artwork")} />
              </label>
              <label>
                Accent
                <input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} />
              </label>
            </div>
            <label>
              Approved public fields
              <textarea
                rows={6}
                value={publicCard}
                placeholder={"Armor Class: 18\nPassive Perception: 14\nPronouns: she/her"}
                onChange={(event) => setPublicCard(event.target.value)}
              />
            </label>
            <label className="recording-checkbox">
              <input type="checkbox" checked={showPlayerName} onChange={(event) => setShowPlayerName(event.target.checked)} />
              Show my player name
            </label>
            <p className="privacy-note">
              Only fields entered here are available to the production canvas.
              Inventory, private notes, spells and GM secrets are never imported.
            </p>
            <footer>
              <button type="button" onClick={() => setCharacterOpen(false)}>Cancel</button>
              <button type="button" disabled={busy || !characterName.trim()} onClick={() => void saveCharacter()}>Save public profile</button>
            </footer>
            <section className="one-off-reveal">
              <h3>Show a viewer-approved card now</h3>
              <div className="recording-form-row">
                <label>
                  Card type
                  <select value={revealMode} onChange={(event) => setRevealMode(event.target.value as CharacterReveal["mode"])}>
                    <option value="portrait">Portrait</option>
                    <option value="compact">Compact stats</option>
                    <option value="sheet">Approved sheet</option>
                    <option value="spell">Spell</option>
                    <option value="ability">Ability</option>
                    <option value="item">Item</option>
                  </select>
                </label>
                <label>
                  Title
                  <input value={revealTitle} onChange={(event) => setRevealTitle(event.target.value)} />
                </label>
              </div>
              <textarea
                rows={4}
                value={revealFields}
                placeholder={"Range: 150 feet\nDamage: 8d6 fire"}
                onChange={(event) => setRevealFields(event.target.value)}
              />
              <button type="button" disabled={busy} onClick={() => void showReveal(revealMode, currentUserId)}>Reveal for 8 seconds</button>
            </section>
          </section>
        </div>
      )}

      {summaryOpen && recording && (
        <div className="recording-modal-backdrop" role="presentation">
          <section className="recording-setup recording-summary">
            <header>
              <div>
                <span className="eyebrow">Recording summary</span>
                <h2>{recording.title}</h2>
              </div>
              <button type="button" onClick={() => setSummaryOpen(false)}>×</button>
            </header>
            <dl>
              <div><dt>Status</dt><dd>{recording.status}</dd></div>
              <div><dt>Recorded duration</dt><dd>{formatTime(recording.elapsedMs)}</dd></div>
              <div><dt>Timeline events</dt><dd>{summary?.events.length || 0}</dd></div>
              <div><dt>Output size</dt><dd>{formatBytes(summary?.outputs.reduce((total, output) => total + output.bytes, 0) || 0)}</dd></div>
            </dl>
            <h3>Review files</h3>
            <ul className="recording-output-list">
              {(summary?.outputs || []).map((output) => (
                <li key={`${output.kind}:${output.filename}`}>
                  <span>{output.kind}</span>
                  <strong>{output.filename}</strong>
                  <small>{formatBytes(output.bytes)}</small>
                </li>
              ))}
            </ul>
            {summary?.diagnostics.length ? (
              <>
                <h3>Diagnostics</h3>
                <ul className="recording-diagnostics">
                  {summary.diagnostics.map((entry, index) => (
                    <li key={`${entry.code}:${index}`} className={entry.level}>
                      <strong>{entry.code}</strong> {entry.message}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="privacy-note">
              Files remain on recorder storage for {recording.retentionDays} days.
              Huddle exposes filenames and diagnostics, never host paths.
            </p>
          </section>
        </div>
      )}

      {directorOpen && recording && canControl && (
        <aside className="recording-director">
          <header>
            <div>
              <span className="eyebrow">Director panel</span>
              <strong>{recording.title}</strong>
            </div>
            <button type="button" onClick={() => setDirectorOpen(false)} aria-label="Close">×</button>
          </header>
          <div className="director-health">
            <span><Gauge size={14} /> {recording.recorderHealthy ? "Recorder healthy" : "Recorder waiting"}</span>
            <span><HardDrive size={14} /> {formatBytes(recording.estimatedBytes)} · {formatBytes(recording.diskFreeBytes)} free</span>
            <time>{formatTime(activeElapsed)}</time>
          </div>
          <div className="director-primary">
            {recording.status === "awaiting-consent" && (
              <button disabled={busy} onClick={() => void act("start")}><CirclePlay size={17} /> Start</button>
            )}
            {(recording.status === "recording" || recording.status === "countdown") && (
              <button disabled={busy} onClick={() => void act("pause")}><CirclePause size={17} /> Pause for LARP / break</button>
            )}
            {recording.status === "paused" && (
              <button disabled={busy} onClick={() => void act("resume")}><CirclePlay size={17} /> Resume with countdown</button>
            )}
            {["awaiting-consent", "countdown", "recording", "paused"].includes(recording.status) && (
              <button className="danger" disabled={busy} onClick={() => void act("stop")}><Square size={16} /> Stop</button>
            )}
          </div>
          <section>
            <h3>Scenes</h3>
            <div className="director-scenes">
              {SCENES.map((scene) => (
                <button
                  key={scene.id}
                  className={recording.scene === scene.id ? "on" : ""}
                  disabled={busy}
                  onClick={() => void act("scene", { scene: scene.id })}
                >
                  {scene.label}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3>Direction</h3>
            <label className="recording-checkbox">
              <input
                type="checkbox"
                checked={recording.automaticDirection}
                onChange={(event) =>
                  void act("direction", { automaticDirection: event.target.checked })
                }
              />
              Automatic scene selection
            </label>
            <select
              aria-label="Lock current speaker"
              value={recording.lockedSpeakerId || ""}
              onChange={(event) =>
                void act("direction", { lockedSpeakerId: event.target.value || null })
              }
            >
              <option value="">No speaker lock</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </select>
          </section>
          <section>
            <h3>Character reveal</h3>
            <select
              aria-label="Character to reveal"
              value={revealUserId}
              onChange={(event) => setRevealUserId(event.target.value)}
            >
              {presentations.map((entry) => (
                <option key={entry.userId} value={entry.userId}>
                  {entry.characterName}
                </option>
              ))}
            </select>
            <div className="director-primary">
              <button disabled={busy || !revealUserId} onClick={() => void showReveal("portrait")}>Portrait</button>
              <button disabled={busy || !revealUserId} onClick={() => void showReveal("compact")}>Compact</button>
              <button disabled={busy || !revealUserId} onClick={() => void showReveal("sheet")}>Approved sheet</button>
              <button disabled={busy} onClick={() => void apiFetch("/api/recordings/presentation", { method: "POST", body: JSON.stringify({ action: "clear", sessionId: recording.id }) })}>Clear</button>
            </div>
          </section>
          <section>
            <h3>Timeline</h3>
            <div className="director-primary">
              <button disabled={busy} onClick={() => void act("marker", { kind: "chapter", name: "Chapter" })}>
                <Flag size={15} /> Chapter
              </button>
              <button disabled={busy} onClick={() => void act("marker", { kind: "highlight", name: "Highlight" })}>
                <Flag size={15} /> Highlight
              </button>
            </div>
            <ul className="editable-timeline">
              {timeline.map((event) => (
                <li key={event.id}>
                  <input
                    aria-label="Event time in seconds"
                    type="number"
                    min={0}
                    step={1}
                    value={Math.round(event.atMs / 1000)}
                    onChange={(input) =>
                      setTimeline((current) =>
                        current.map((entry) =>
                          entry.id === event.id
                            ? {
                                ...entry,
                                atMs: Math.max(0, Number(input.target.value) * 1000),
                              }
                            : entry,
                        ),
                      )
                    }
                    onBlur={() =>
                      void updateTimelineEvent(event.id, { atMs: event.atMs })
                    }
                  />
                  <input
                    aria-label="Event name"
                    value={String(
                      event.payload.name ||
                        event.payload.scene ||
                        event.kind.replace(".", " "),
                    )}
                    onChange={(input) =>
                      setTimeline((current) =>
                        current.map((entry) =>
                          entry.id === event.id
                            ? {
                                ...entry,
                                payload: {
                                  ...entry.payload,
                                  name: input.target.value,
                                },
                              }
                            : entry,
                        ),
                      )
                    }
                    onBlur={() =>
                      void updateTimelineEvent(event.id, {
                        name: String(event.payload.name || ""),
                      })
                    }
                  />
                  <span>{event.automatic ? "auto" : event.kind}</span>
                  <button
                    type="button"
                    aria-label="Delete timeline event"
                    onClick={() => void deleteTimelineEvent(event.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Consent &amp; tracks</h3>
            <ul className="director-participants">
              {recording.consents.map((consent) => {
                const person = people.find((entry) => entry.id === consent.userId);
                const connectionId = person?.connectionId || "";
                const active = speaking.has(
                  connectionId === participants.find((p) => p.id === currentUserId)?.connectionId
                    ? "self"
                    : connectionId,
                );
                return (
                  <li key={consent.userId}>
                    <span className={`audio-meter ${active ? "active" : ""}`} />
                    <span>{consent.displayName}</span>
                    <b className={`consent-${consent.decision}`}>{consent.decision}</b>
                  </li>
                );
              })}
            </ul>
          </section>
          {recording.error && <p className="recording-error">{recording.error}</p>}
        </aside>
      )}
    </>
  );
}
