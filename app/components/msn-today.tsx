"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "./avatar";
import { StyledText } from "./message-body";
import { apiFetch } from "../lib/client";
import type { PublicEvent } from "@/lib/events";
import { WhatsNewLine } from "./msn-chrome";
import type { WhatsNewEntry } from "../hooks/use-msn-extras";
import { useI18n } from "../lib/i18n-context";
import type { MessageKey } from "@/lib/i18n";

/**
 * MSN Today: the little news window Messenger opened once a day at sign-in.
 * Ours is about your Hoffle instead of MSN's headlines: who's around, which
 * conversations are waiting, what's coming up and what's playing, plus a tip.
 */

const TODAY_KEY = "huddle-msn-today";
const TODAY_OFF_KEY = "huddle-msn-today-off";

const TIP_KEYS: readonly MessageKey[] = [
  "msnToday.tip.1",
  "msnToday.tip.2",
  "msnToday.tip.3",
  "msnToday.tip.4",
  "msnToday.tip.5",
  "msnToday.tip.6",
  "msnToday.tip.7",
  "msnToday.tip.8",
  "msnToday.tip.9",
  "msnToday.tip.10",
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

function greetingKey(hour: number): MessageKey {
  if (hour < 5) return "msnToday.greeting.late";
  if (hour < 12) return "msnToday.greeting.morning";
  if (hour < 18) return "msnToday.greeting.afternoon";
  return "msnToday.greeting.evening";
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
  const { t } = useI18n();
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [showAtStart, setShowAtStart] = useState(true);
  const now = useMemo(() => new Date(), []);
  const tipKey = useMemo(() => TIP_KEYS[Math.floor(Math.random() * TIP_KEYS.length)], []);

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
        aria-label={t("msnToday.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="msn-today-titlebar">
          <span>
            <span className="msn-today-logo" aria-hidden="true">
              <i />
              <i />
            </span>
            {t("msnToday.title")}
          </span>
          <button type="button" onClick={onClose} aria-label={t("common.close")}>
            ×
          </button>
        </div>
        <div className="msn-today-masthead">
          <div>
            <strong>
              {t(greetingKey(now.getHours()))}, <StyledText text={userName} />!
            </strong>
            <span>
              {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </span>
          </div>
          <span className="msn-today-badge">Hoffle</span>
        </div>

        <div className="msn-today-body">
          <section>
            <h3>{t("msnToday.contacts")}</h3>
            {online.length ? (
              <>
                <p>
                  {online.length === 1 ? t("msnToday.onlineSingle") : t("msnToday.onlinePlural", { count: online.length })}
                </p>
                <div className="msn-today-people">
                  {online.slice(0, 12).map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      title={t("msnToday.sendMsgTitle", { name: person.name })}
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
              <p>{t("msnToday.noneOnline")}</p>
            )}
          </section>

          <section>
            <h3>{t("msnToday.waiting")}</h3>
            {waiting.length ? (
              <ul className="msn-today-list">
                {waiting.slice(0, 6).map((item) => (
                  <li key={item.key}>
                    <button type="button" onClick={item.open}>
                      {item.label}
                    </button>
                    <span>
                      {t("msnToday.newCount", { count: item.count })}
                      {item.mentions ? t("msnToday.forYouCount", { count: item.mentions }) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t("msnToday.caughtUp")}</p>
            )}
          </section>

          <section>
            <h3>{t("msnToday.comingUp")}</h3>
            {events === null ? (
              <p>{t("msnToday.looking")}</p>
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
              <p>{t("msnToday.nothingScheduled")}</p>
            )}
          </section>

          {playing.length > 0 && (
            <section>
              <h3>{t("msnToday.playingNow")}</h3>
              <ul className="msn-today-list">
                {playing.slice(0, 4).map((item) => (
                  <li key={item.room}>
                    <button type="button" onClick={item.open}>
                      {item.title}
                      {item.artist ? ` - ${item.artist}` : ""}
                    </button>
                    <span>{t("msnToday.inRoom", { room: item.room })}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {whatsNew.length > 0 && (
            <section className="msn-today-news">
              <h3>{t("msnToday.whatsNew")}</h3>
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
            <h3>{t("msnToday.didYouKnow")}</h3>
            <p>{t(tipKey)}</p>
          </section>
        </div>

        <div className="msn-today-footer">
          <label>
            <input type="checkbox" checked={showAtStart} onChange={(e) => toggleAtStart(e.target.checked)} />
            {t("msnToday.showAtStart")}
          </label>
          <button type="button" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
