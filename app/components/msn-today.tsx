"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "./avatar";
import { StyledText } from "./message-body";
import { apiFetch } from "../lib/client";
import type { PublicEvent } from "@/lib/events";
import { WhatsNewLine } from "./msn-chrome";
import type { WhatsNewEntry } from "../hooks/use-msn-extras";

/**
 * MSN Today: the little news window Messenger opened once a day at sign-in.
 * Ours is about your Hoffle instead of MSN's headlines: who's around, which
 * conversations are waiting, what's coming up and what's playing, plus a tip.
 */

const TODAY_KEY = "huddle-msn-today";
const TODAY_OFF_KEY = "huddle-msn-today-off";

const TIPS = [
  "Type [c=red]words[/c] to colour them, or [c=pink]words[/c=blue] for a gradient, just like Messenger Plus!.",
  "The A button above the typing box picks the font and colour every message goes out in.",
  "Winks play a full-window animation for everyone in the conversation. Try the Kiss.",
  "Send a nudge to shake your friend's window. You can only nudge every few seconds!",
  "Type (Y) for 👍, (L) for ❤️ or (co) for 💻. Hover the ☺ menu to learn the rest.",
  "Bored? The Games button invites the conversation to Minesweeper Flags, Tic-Tac-Toe and more.",
  "Turn on \"Show what I'm listening to\" in your status menu to share the song in your voice room.",
  "Put [rainbow]effects[/rainbow] in your name or status: they show in everyone's contact list.",
  "Drag a picture into the typing box, or draw one with Handwriting.",
  "Each conversation remembers its own background. Pick one from Backgrounds.",
];

export interface TodayPerson {
  id: string;
  name: string;
  avatar: string;
  avatarUrl?: string | null;
  color: string;
}

export interface TodayWaiting {
  key: string;
  label: string;
  count: number;
  mentions: number;
  open: () => void;
}

export interface TodayPlaying {
  room: string;
  title: string;
  artist: string;
  open: () => void;
}

/** True when MSN Today should open by itself: once a day, unless switched off. */
export function shouldShowMsnToday(): boolean {
  try {
    if (window.localStorage.getItem(TODAY_OFF_KEY) === "1") return false;
    return window.localStorage.getItem(TODAY_KEY) !== new Date().toDateString();
  } catch {
    return false;
  }
}

function greeting(hour: number): string {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function MsnToday({
  userName,
  online,
  waiting,
  playing,
  whatsNew = [],
  serverIds,
  onOpenPerson,
  onOpenEvent,
  onClose,
}: {
  userName: string;
  online: TodayPerson[];
  waiting: TodayWaiting[];
  playing: TodayPlaying[];
  whatsNew?: WhatsNewEntry[];
  /** Servers to look for upcoming events in. */
  serverIds: string[];
  onOpenPerson: (id: string) => void;
  onOpenEvent: (event: PublicEvent) => void;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [showAtStart, setShowAtStart] = useState(true);
  const now = useMemo(() => new Date(), []);
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], []);

  useEffect(() => {
    try {
      window.localStorage.setItem(TODAY_KEY, new Date().toDateString());
      setShowAtStart(window.localStorage.getItem(TODAY_OFF_KEY) !== "1");
    } catch {
      // Storage blocked: it just opens again next time.
    }
  }, []);

  const serverKey = serverIds.slice(0, 6).join(",");
  useEffect(() => {
    let cancelled = false;
    const weekAhead = Date.now() + 7 * 24 * 60 * 60 * 1000;
    void Promise.all(
      serverKey
        .split(",")
        .filter(Boolean)
        .map((id) =>
          apiFetch<{ events: PublicEvent[] }>(`/api/events?serverId=${encodeURIComponent(id)}`)
            .then((data) => data.events)
            .catch(() => [] as PublicEvent[]),
        ),
    ).then((lists) => {
      if (cancelled) return;
      const soon = lists
        .flat()
        .filter((event) => {
          const at = new Date(event.startsAt).getTime();
          return at >= Date.now() - 60 * 60 * 1000 && at <= weekAhead;
        })
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .slice(0, 4);
      setEvents(soon);
    });
    return () => {
      cancelled = true;
    };
  }, [serverKey]);

  const toggleAtStart = (on: boolean) => {
    setShowAtStart(on);
    try {
      window.localStorage.setItem(TODAY_OFF_KEY, on ? "0" : "1");
    } catch {
      // Storage blocked: applies until reload.
    }
  };

  return (
    <div className="msn-today-backdrop" onClick={onClose}>
      <div
        className="msn-today"
        role="dialog"
        aria-label="MSN Today"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="msn-today-titlebar">
          <span>
            <span className="msn-today-logo" aria-hidden="true">
              <i />
              <i />
            </span>
            MSN Today
          </span>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="msn-today-masthead">
          <div>
            <strong>
              {greeting(now.getHours())}, <StyledText text={userName} />!
            </strong>
            <span>
              {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </span>
          </div>
          <span className="msn-today-badge">Hoffle</span>
        </div>

        <div className="msn-today-body">
          <section>
            <h3>Your contacts</h3>
            {online.length ? (
              <>
                <p>
                  {online.length === 1 ? "1 contact is" : `${online.length} contacts are`} online right now.
                </p>
                <div className="msn-today-people">
                  {online.slice(0, 12).map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      title={`Send ${person.name} a message`}
                      onClick={() => onOpenPerson(person.id)}
                    >
                      <Avatar
                        className="msn-today-avatar"
                        avatar={person.avatar}
                        avatarUrl={person.avatarUrl}
                        color={person.color}
                      />
                      <span>
                        <StyledText text={person.name} />
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p>None of your contacts are online yet. They&apos;ll pop up in the corner when they sign in.</p>
            )}
          </section>

          <section>
            <h3>Waiting for you</h3>
            {waiting.length ? (
              <ul className="msn-today-list">
                {waiting.slice(0, 6).map((item) => (
                  <li key={item.key}>
                    <button type="button" onClick={item.open}>
                      {item.label}
                    </button>
                    <span>
                      {item.count} new
                      {item.mentions ? `, ${item.mentions} for you` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>You&apos;re all caught up. 🎉</p>
            )}
          </section>

          <section>
            <h3>Coming up this week</h3>
            {events === null ? (
              <p>Looking…</p>
            ) : events.length ? (
              <ul className="msn-today-list">
                {events.map((event) => (
                  <li key={event.id}>
                    <button type="button" onClick={() => onOpenEvent(event)}>
                      {event.title}
                    </button>
                    <span>
                      {new Date(event.startsAt).toLocaleString(undefined, {
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nothing scheduled. Plan something in Events!</p>
            )}
          </section>

          {playing.length > 0 && (
            <section>
              <h3>♫ Playing now</h3>
              <ul className="msn-today-list">
                {playing.slice(0, 4).map((item) => (
                  <li key={item.room}>
                    <button type="button" onClick={item.open}>
                      {item.title}
                      {item.artist ? ` - ${item.artist}` : ""}
                    </button>
                    <span>in {item.room}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {whatsNew.length > 0 && (
            <section className="msn-today-news">
              <h3>What&apos;s new with your contacts</h3>
              <ul className="msn-today-list msn-today-news-list">
                {whatsNew.slice(0, 4).map((entry) => (
                  <li key={entry.id}>
                    <span>
                      <WhatsNewLine entry={entry} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="msn-today-tip">
            <h3>Did you know?</h3>
            <p>{tip}</p>
          </section>
        </div>

        <div className="msn-today-footer">
          <label>
            <input type="checkbox" checked={showAtStart} onChange={(e) => toggleAtStart(e.target.checked)} />
            Show MSN Today when I sign in
          </label>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
