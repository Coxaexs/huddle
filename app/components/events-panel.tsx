"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock, HelpCircle, Pencil, Plus, Trash2, Volume2, X } from "lucide-react";
import type { PublicEvent, RsvpStatus } from "@/lib/events";
import { apiFetch } from "../lib/client";
import { Avatar } from "./avatar";

/** Upcoming events for a server, refetched whenever `refreshKey` changes. */
export function useServerEvents(serverId: string | null, refreshKey: number) {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const reload = useCallback(async () => {
    if (!serverId) {
      setEvents([]);
      return;
    }
    const data = await apiFetch<{ events: PublicEvent[] }>(
      `/api/events?serverId=${encodeURIComponent(serverId)}`,
    ).catch(() => null);
    if (data) setEvents(data.events);
  }, [serverId]);
  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);
  return { events, reload };
}

/** "Starts in 20m", "Happening now", "Sat, Oct 4 · 8:00 PM". */
export function eventWhen(event: Pick<PublicEvent, "startsAt" | "endsAt">, now = Date.now()): string {
  const start = Date.parse(event.startsAt);
  const end = event.endsAt ? Date.parse(event.endsAt) : start + 3 * 60 * 60_000;
  if (start <= now && now < end) return "Happening now";
  if (now >= end) return "Ended";
  const minutes = Math.round((start - now) / 60_000);
  if (minutes < 60) return `Starts in ${Math.max(1, minutes)}m`;
  if (minutes < 6 * 60) return `Starts in ${Math.round(minutes / 60)}h`;
  return new Date(start).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Whether "Join voice" should be offered: from 15 minutes before until it ends. */
export function eventIsOpen(event: Pick<PublicEvent, "startsAt" | "endsAt">, now = Date.now()): boolean {
  const start = Date.parse(event.startsAt);
  const end = event.endsAt ? Date.parse(event.endsAt) : start + 3 * 60 * 60_000;
  return now >= start - 15 * 60_000 && now < end;
}

/** Value for <input type="datetime-local"> in the viewer's own timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** The next whole hour, as a sensible default start. */
function nextHour(): string {
  const date = new Date(Date.now() + 60 * 60_000);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

interface EventsPanelProps {
  serverId: string;
  events: PublicEvent[];
  reload: () => Promise<void>;
  userId: string;
  canManage: boolean;
  voiceChannels: Array<{ id: string; name: string }>;
  onJoinVoice: (channelId: string) => void;
  onClose: () => void;
  onRequestConfirm: (options: {
    title: string;
    message?: string;
    isDanger?: boolean;
    confirmText?: string;
    onConfirm: () => void;
  }) => void;
}

type Draft = {
  id: string | null;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  channelId: string;
};

const RSVP_LABELS: Record<RsvpStatus, string> = { going: "Going", maybe: "Maybe", no: "Can't" };

export function EventsPanel({
  serverId,
  events,
  reload,
  userId,
  canManage,
  voiceChannels,
  onJoinVoice,
  onClose,
  onRequestConfirm,
}: EventsPanelProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [, setClock] = useState(0);

  // Keep "starts in 5m" fresh while the panel is open.
  useEffect(() => {
    const timer = window.setInterval(() => setClock((n) => n + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const channelName = useMemo(
    () => new Map(voiceChannels.map((channel) => [channel.id, channel.name])),
    [voiceChannels],
  );

  function startDraft(event?: PublicEvent) {
    setError("");
    setDraft(
      event
        ? {
            id: event.id,
            title: event.title,
            description: event.description,
            startsAt: toLocalInput(event.startsAt),
            endsAt: toLocalInput(event.endsAt),
            channelId: event.channelId || "",
          }
        : {
            id: null,
            title: "",
            description: "",
            startsAt: toLocalInput(nextHour()),
            endsAt: "",
            channelId: voiceChannels[0]?.id || "",
          },
    );
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        serverId,
        title: draft.title,
        description: draft.description,
        // datetime-local is the viewer's local time; send an absolute instant.
        startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : "",
        endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
        channelId: draft.channelId || null,
      };
      await apiFetch(draft.id ? `/api/events/${draft.id}` : "/api/events", {
        method: draft.id ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setDraft(null);
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save the event.");
    } finally {
      setSaving(false);
    }
  }

  async function rsvp(event: PublicEvent, status: RsvpStatus) {
    setError("");
    try {
      await apiFetch(`/api/events/${event.id}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ status: event.myStatus === status ? null : status }),
      });
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your answer.");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="events-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="events-panel-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="events-panel-head">
          <h2 id="events-panel-title">
            <CalendarDays size={18} /> Events
          </h2>
          <div className="events-panel-head-actions">
            {!draft && (
              <button type="button" className="events-primary" onClick={() => startDraft()}>
                <Plus size={14} /> New event
              </button>
            )}
            <button type="button" className="events-icon-btn" aria-label="Close" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </header>

        {error && <p className="events-error" role="alert">{error}</p>}

        {draft ? (
          <form
            className="events-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label htmlFor="event-title">Name</label>
            <input
              id="event-title"
              value={draft.title}
              maxLength={100}
              placeholder="Game night"
              autoFocus
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
            <div className="events-form-row">
              <div>
                <label htmlFor="event-start">Starts</label>
                <input
                  id="event-start"
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
                />
              </div>
              <div>
                <label htmlFor="event-end">Ends (optional)</label>
                <input
                  id="event-end"
                  type="datetime-local"
                  value={draft.endsAt}
                  min={draft.startsAt}
                  onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
                />
              </div>
            </div>
            <label htmlFor="event-channel">Voice channel</label>
            <select
              id="event-channel"
              value={draft.channelId}
              onChange={(event) => setDraft({ ...draft, channelId: event.target.value })}
            >
              <option value="">None</option>
              {voiceChannels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
            <label htmlFor="event-description">Details (optional)</label>
            <textarea
              id="event-description"
              value={draft.description}
              maxLength={1000}
              rows={3}
              placeholder="What are we playing? Bring snacks?"
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
            <div className="events-form-actions">
              <button type="button" className="events-secondary" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button
                type="submit"
                className="events-primary"
                disabled={saving || !draft.title.trim() || !draft.startsAt}
              >
                {saving ? "Saving…" : draft.id ? "Save changes" : "Create event"}
              </button>
            </div>
          </form>
        ) : events.length === 0 ? (
          <div className="events-empty">
            <CalendarDays size={36} />
            <p>Nothing planned yet.</p>
            <p className="events-muted">
              Schedule a game night and everyone who says they&apos;re going gets a reminder 15
              minutes before.
            </p>
          </div>
        ) : (
          <ul className="events-list">
            {events.map((event) => {
              const open = eventIsOpen(event);
              const mine = event.createdBy === userId || canManage;
              return (
                <li key={event.id} className={`events-card ${open ? "is-open" : ""}`}>
                  <div className="events-card-top">
                    <span className={`events-when ${open ? "is-open" : ""}`}>
                      <Clock size={12} /> {eventWhen(event)}
                    </span>
                    {mine && (
                      <span className="events-card-tools">
                        <button
                          type="button"
                          className="events-icon-btn"
                          aria-label={`Edit ${event.title}`}
                          onClick={() => startDraft(event)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="events-icon-btn danger"
                          aria-label={`Cancel ${event.title}`}
                          onClick={() =>
                            onRequestConfirm({
                              title: `Cancel "${event.title}"?`,
                              message: "It will be removed for everyone, along with the RSVPs.",
                              isDanger: true,
                              confirmText: "Cancel Event",
                              onConfirm: async () => {
                                await apiFetch(`/api/events/${event.id}`, { method: "DELETE" }).catch(
                                  (failure) =>
                                    setError(
                                      failure instanceof Error ? failure.message : "Could not cancel it.",
                                    ),
                                );
                                await reload();
                              },
                            })
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    )}
                  </div>
                  <h3>{event.title}</h3>
                  <p className="events-meta">
                    {new Date(event.startsAt).toLocaleString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {event.channelId && channelName.get(event.channelId) && (
                      <>
                        {" · "}
                        <Volume2 size={12} /> {channelName.get(event.channelId)}
                      </>
                    )}
                    {" · by "}
                    {event.creatorName}
                  </p>
                  {event.description && <p className="events-description">{event.description}</p>}

                  {event.attendees.length > 0 && (
                    <div className="events-attendees" aria-label="Who is coming">
                      {event.attendees.slice(0, 12).map((person) => (
                        <span
                          key={person.id}
                          className={`events-attendee ${person.status}`}
                          title={`${person.displayName} · ${RSVP_LABELS[person.status]}`}
                        >
                          <Avatar
                            avatar={person.avatar}
                            avatarUrl={person.avatarUrl}
                            color={person.color}
                            size={24}
                          />
                        </span>
                      ))}
                      <span className="events-muted">
                        {event.counts.going} going
                        {event.counts.maybe ? ` · ${event.counts.maybe} maybe` : ""}
                      </span>
                    </div>
                  )}

                  <div className="events-actions">
                    {(["going", "maybe", "no"] as RsvpStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`events-rsvp ${status} ${event.myStatus === status ? "chosen" : ""}`}
                        aria-pressed={event.myStatus === status}
                        onClick={() => void rsvp(event, status)}
                      >
                        {status === "going" ? (
                          <Check size={13} />
                        ) : status === "maybe" ? (
                          <HelpCircle size={13} />
                        ) : (
                          <X size={13} />
                        )}
                        {RSVP_LABELS[status]}
                      </button>
                    ))}
                    {open && event.channelId && channelName.has(event.channelId) && (
                      <button
                        type="button"
                        className="events-primary events-join"
                        onClick={() => onJoinVoice(event.channelId!)}
                      >
                        <Volume2 size={13} /> Join voice
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
