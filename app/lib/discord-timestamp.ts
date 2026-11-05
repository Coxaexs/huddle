/**
 * Discord's `<t:1700000000:R>` timestamps, which bots (and people coming from
 * Discord) put in messages so everyone sees the time in their own zone.
 * Styles: t short time, T long time, d short date, D long date, f date and
 * time (the default), F with the weekday, R relative ("in 2 hours").
 */
export type TimestampStyle = "t" | "T" | "d" | "D" | "f" | "F" | "R";

export const TIMESTAMP_STYLES = new Set<string>(["t", "T", "d", "D", "f", "F", "R"]);

/** The latest and earliest moments a JavaScript Date can hold, in seconds. */
const LIMIT_SECONDS = 8_640_000_000_000;

/** The moment as a Date, or null when the number is not a usable time. */
export function timestampDate(unixSeconds: number): Date | null {
  if (!Number.isFinite(unixSeconds) || Math.abs(unixSeconds) > LIMIT_SECONDS) return null;
  const date = new Date(unixSeconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

const ABSOLUTE: Record<Exclude<TimestampStyle, "R">, Intl.DateTimeFormatOptions> = {
  t: { timeStyle: "short" },
  T: { timeStyle: "medium" },
  d: { dateStyle: "short" },
  D: { dateStyle: "long" },
  f: { dateStyle: "long", timeStyle: "short" },
  F: { dateStyle: "full", timeStyle: "short" },
};

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/** "in 2 hours", "3 days ago": the largest unit, rounded, like Discord. */
export function relativeTime(date: Date, now: number, locale?: string): string {
  const seconds = Math.round((date.getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === "second") {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return format.format(0, "second");
}

/** The text a timestamp shows, in the viewer's locale and time zone. */
export function formatTimestamp(
  date: Date,
  style: TimestampStyle,
  now = Date.now(),
  locale?: string,
  timeZone?: string,
): string {
  if (style === "R") return relativeTime(date, now, locale);
  return new Intl.DateTimeFormat(locale, { ...ABSOLUTE[style], ...(timeZone ? { timeZone } : {}) }).format(date);
}
