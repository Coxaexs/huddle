"use client";

/**
 * Subtitles for Jellyfin watch parties. Each viewer picks their own (or none):
 * Jellyfin hands any text track (SRT, ASS, mov_text, external .srt) over as
 * WebVTT, and we draw the current line ourselves over whatever shows the film
 * (the stage's player or the living room's 3D screen, where a <track> could
 * not be drawn). Picture-based tracks (PGS, DVD) are left out: they would need
 * burning into the shared conversion, which is everyone's picture.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { jellyfinLink } from "./stream-url";
import { jellyfinSource } from "./watch-source";

export interface SubtitleTrack {
  /** Jellyfin's stream index. */
  index: number;
  label: string;
  /** ISO 639-2 code ("eng"), when Jellyfin knows it. */
  language: string | null;
  url: string;
}

export interface Cue {
  start: number;
  end: number;
  text: string;
}

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function seconds(stamp: string): number | null {
  const match = TIME.exec(stamp);
  if (!match) return null;
  return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4].padEnd(3, "0")) / 1000;
}

/** Reads WebVTT (or SRT) into cues, with styling tags and ASS overrides like {\an8} taken out. */
export function parseVtt(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing < 0) continue;
    const [from, to] = lines[timing].split("-->");
    const start = seconds(from);
    const end = seconds(to);
    if (start === null || end === null || end <= start) continue;
    const body = lines
      .slice(timing + 1)
      .map((line) => line.replace(/\{\\[^}]*\}/g, "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    if (body) cues.push({ start, end, text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** The line(s) on screen at `time`. */
export function cueAt(cues: Cue[], time: number): string {
  // Cues can overlap, so collect every one that covers the moment.
  const shown: string[] = [];
  for (const cue of cues) {
    if (cue.start > time) break;
    if (cue.end > time) shown.push(cue.text);
  }
  return shown.join("\n");
}

const LANGUAGE_NAMES: Record<string, string> = {
  eng: "English", tur: "Turkish", ger: "German", deu: "German", fre: "French", fra: "French", spa: "Spanish",
  ita: "Italian", dut: "Dutch", nld: "Dutch", por: "Portuguese", rus: "Russian", jpn: "Japanese", kor: "Korean",
  chi: "Chinese", zho: "Chinese", ara: "Arabic", pol: "Polish", cze: "Czech", ces: "Czech", swe: "Swedish",
  nor: "Norwegian", dan: "Danish", fin: "Finnish", gre: "Greek", ell: "Greek", heb: "Hebrew", hun: "Hungarian",
  rum: "Romanian", ron: "Romanian", ukr: "Ukrainian", hin: "Hindi",
};

interface SubtitleStream { Type?: string; Index?: number; Language?: string; Title?: string; DisplayTitle?: string; IsTextSubtitleStream?: boolean; IsForced?: boolean; IsExternal?: boolean }

/** The text subtitle tracks Jellyfin has for a watch-party link (none for other links). */
export async function subtitleTracks(url: string): Promise<SubtitleTrack[]> {
  const link = jellyfinLink(url);
  if (!link || link.needsKey) return [];
  const source = await jellyfinSource(link);
  if (!source || source === "refused") return [];
  const mediaSourceId = source.Id || link.itemId;
  const streams = (source.MediaStreams || []) as SubtitleStream[];
  const tracks = streams
    .filter((s) => s.Type === "Subtitle" && s.IsTextSubtitleStream && typeof s.Index === "number")
    .map((s) => {
      const language = s.Language && s.Language !== "und" ? s.Language.toLowerCase() : null;
      const name = (language && LANGUAGE_NAMES[language]) || s.Title || (language ? language.toUpperCase() : "Unknown");
      const extras = [s.IsForced ? "forced" : "", s.Title && s.Title !== name && !/^(sub|subtitle)s?$/i.test(s.Title) ? s.Title : ""].filter(Boolean);
      return {
        index: s.Index!,
        label: extras.length ? `${name} (${extras.join(", ")})` : name,
        language,
        url: `${link.base}/Videos/${link.itemId}/${mediaSourceId}/Subtitles/${s.Index}/0/Stream.vtt?api_key=${encodeURIComponent(link.apiKey)}`,
      };
    });
  // Two tracks with the same name are told apart by number.
  const seen = new Map<string, number>();
  for (const track of tracks) {
    const n = (seen.get(track.label) ?? 0) + 1;
    seen.set(track.label, n);
    if (n > 1) track.label = `${track.label} ${n}`;
  }
  return tracks;
}

/* ---------- this viewer's choice, shared by every player on the page ---------- */

const LANGUAGE_KEY = "huddle-subtitle-language";
/** Per film: the track index picked, or null for off. */
const chosen = new Map<string, number | null>();
const listeners = new Set<() => void>();
let version = 0;

function preferredLanguage(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
}

/** Picks a track (null: off) for this film, and remembers its language for the next one. */
export function chooseSubtitle(url: string, track: SubtitleTrack | null): void {
  chosen.set(url, track?.index ?? null);
  try {
    localStorage.setItem(LANGUAGE_KEY, track ? track.language ?? "any" : "off");
  } catch {
    // Private mode: just this film.
  }
  version++;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The track picked for this film: the viewer's choice, or the last language they used. */
export function pickedSubtitle(url: string, tracks: SubtitleTrack[]): SubtitleTrack | null {
  if (chosen.has(url)) {
    const index = chosen.get(url);
    return tracks.find((t) => t.index === index) ?? null;
  }
  const language = preferredLanguage();
  if (!language || language === "off") return null;
  return tracks.find((t) => (t.language ?? "any") === language && !/forced/.test(t.label))
    ?? tracks.find((t) => (t.language ?? "any") === language)
    ?? null;
}

/** A film's subtitle tracks and the one this viewer is reading. */
export function useSubtitles(url: string | null | undefined) {
  const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
  useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => {
    setTracks([]);
    if (!url) return;
    let live = true;
    void subtitleTracks(url).then((found) => { if (live) setTracks(found); });
    return () => { live = false; };
  }, [url]);
  const picked = url ? pickedSubtitle(url, tracks) : null;
  return { tracks, picked, choose: (track: SubtitleTrack | null) => url && chooseSubtitle(url, track) };
}

const cueCache = new Map<string, Promise<Cue[]>>();

function loadCues(trackUrl: string): Promise<Cue[]> {
  let pending = cueCache.get(trackUrl);
  if (!pending) {
    pending = fetch(trackUrl)
      .then((response) => (response.ok ? response.text() : ""))
      .then(parseVtt)
      .catch(() => []);
    cueCache.set(trackUrl, pending);
    void pending.then((cues) => { if (!cues.length) cueCache.delete(trackUrl); });
  }
  return pending;
}

/** The subtitle line to show now, following `time()` (the film's position in seconds, or null). */
export function useSubtitleLine(track: SubtitleTrack | null, time: () => number | null): string {
  const [line, setLine] = useState("");
  useEffect(() => {
    setLine("");
    if (!track) return;
    let cues: Cue[] = [];
    let live = true;
    void loadCues(track.url).then((loaded) => { if (live) cues = loaded; });
    const timer = window.setInterval(() => {
      const now = time();
      const next = now === null ? "" : cueAt(cues, now);
      setLine((old) => (old === next ? old : next));
    }, 200);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
    // `time` reads a ref; a new function each render must not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.url]);
  return line;
}
