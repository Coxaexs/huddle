/**
 * iCalendar (RFC 5545) text for Hoffle events: the subscription feed
 * (lib/calendar.ts) and the one-event download in the Events panel.
 * No imports, so the browser can use it too.
 */

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  serverName: string;
  url: string;
}

/** Text escaped for an iCalendar value: backslash, semicolon, comma, newline. */
export function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets continue on the next line after a space. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const length = new TextEncoder().encode(char).length;
    // The first line holds 75 octets; continuations lose one to the leading space.
    if (size + length > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += length;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** 2026-10-27T18:00:00.000Z → 20261027T180000Z */
export function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** One VCALENDAR of the given events. Events without an end last an hour. */
export function buildIcs(events: CalendarEvent[], { name, now = Date.now() }: { name: string; now?: number }): string {
  const stamp = icsDate(new Date(now).toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hoffle//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const event of events) {
    const end = event.endsAt || new Date(Date.parse(event.startsAt) + 60 * 60_000).toISOString();
    const description = [event.description, `${event.serverName} on Hoffle: ${event.url}`].filter(Boolean).join("\n\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@hoffle`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(event.startsAt)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(event.title)}`,
      `DESCRIPTION:${icsText(description)}`,
      `LOCATION:${icsText(`${event.serverName} · Hoffle`)}`,
      `URL:${event.url}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
