/**
 * The music Study Hall plays: recorded lofi tracks by HoliznaCC0, who releases
 * them into the public domain (CC0 1.0), taken from Free Music Archive
 * (freemusicarchive.org/music/holiznacc0). The files are in
 * public/study-hall, levelled to the same loudness; see the README there for
 * where each one came from and how to add more.
 *
 * `ms` is the length of the file as encoded. Every browser works out what the
 * room is playing from these numbers and the shared clock, so a track's `ms`
 * has to match its file.
 */

export interface StudyTrack {
  /** The file is public/study-hall/<id>.mp3. */
  id: string;
  title: string;
  ms: number;
}

export const STUDY_ARTIST = "HoliznaCC0";

export const STUDY_TRACKS: readonly StudyTrack[] = [
  { id: "still-life", title: "Still Life", ms: 134833 },
  { id: "birds", title: "Birds", ms: 165876 },
  { id: "calm-currents", title: "Calm Currents", ms: 147625 },
  { id: "bubbles", title: "Bubbles", ms: 144471 },
  { id: "tranquil-mindscape", title: "Tranquil Mindscape", ms: 152604 },
  { id: "lucid", title: "Lucid", ms: 143616 },
  { id: "moon-unit", title: "Moon Unit", ms: 171995 },
  { id: "tokyo-sunset", title: "Tokyo Sunset", ms: 136806 },
  { id: "reminders", title: "Reminders", ms: 144529 },
  { id: "shimmer", title: "Shimmer", ms: 178795 },
  { id: "warm-fuzz", title: "Warm Fuzz", ms: 171010 },
  { id: "walking-away", title: "Walking Away", ms: 156025 },
  { id: "color-of-a-soul", title: "Color Of A Soul", ms: 156865 },
  { id: "when-i-was-human", title: "When I Was Human", ms: 152953 },
  { id: "complicated-feelings", title: "Complicated Feelings", ms: 158269 },
  { id: "tetrapod", title: "Tetrapod", ms: 143756 },
  { id: "dreamy-reverie", title: "Dreamy Reverie", ms: 142424 },
  { id: "ease-into-night", title: "Ease into Night", ms: 150134 },
  { id: "transient", title: "Transient", ms: 163849 },
  { id: "fire-place", title: "Fire Place", ms: 167567 },
  { id: "first-snow", title: "First Snow", ms: 172197 },
  { id: "the-last-long-day", title: "The Last Long Day", ms: 141189 },
  { id: "ocean-memory", title: "Ocean Memory", ms: 147523 },
  { id: "cold-salt-water", title: "Cold (Salt) Water", ms: 153361 },
  { id: "spring-at-last", title: "Spring At Last", ms: 137089 },
  { id: "hope-on-repeat", title: "Hope On Repeat", ms: 163058 },
];

/** The rain loop: public/study-hall/rain.mp3 (CC0, see the README there). */
export const STUDY_RAIN_FILE = "rain.mp3";
