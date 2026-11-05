"use client";

import { AppWindow, Code2, Gamepad2, Music2, Radio, Volume2 } from "lucide-react";
import type { ActiveNowEntry } from "../lib/active-now";
import type { PublicChannel } from "@/lib/servers";
import { activityElapsed, activityLabel, type ProfileActivity } from "@/lib/users";
import { useI18n } from "@/app/lib/i18n-context";
import { Avatar } from "./avatar";

const KIND_ICON: Record<ProfileActivity["kind"], typeof Gamepad2> = {
  playing: Gamepad2,
  coding: Code2,
  streaming: Radio,
  app: AppWindow,
};

/**
 * The Friends page's "Active now": who is in a voice room (with a way in),
 * playing something, or listening to something. `compact` is the version that
 * sits above the friends list on narrower screens.
 */
export function ActiveNowPanel({
  entries,
  myVoiceChannelId,
  onJoin,
  onOpenDm,
  compact = false,
}: {
  entries: ActiveNowEntry[];
  myVoiceChannelId: string | null;
  onJoin: (serverId: string, channel: PublicChannel) => void;
  onOpenDm: (friend: ActiveNowEntry["friend"]) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  if (compact && entries.length === 0) return null;
  return (
    <section aria-label={t("friends.activeNow")} className={compact ? "mb-6" : ""}>
      <h2 className="text-xs font-black text-[var(--muted)] uppercase tracking-wider mb-3">
        {t("friends.activeNow")}
      </h2>
      {entries.length === 0 ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)]/50 p-4 text-center">
          <p className="text-sm font-bold text-[var(--ink)]">{t("friends.activeNow.quietTitle")}</p>
          <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">{t("friends.activeNow.quietBody")}</p>
        </div>
      ) : (
        <ul className={compact ? "grid gap-2.5 sm:grid-cols-2" : "flex flex-col gap-2.5"}>
          {entries.map((entry) => (
            <li key={entry.friend.id}>
              <ActiveNowCard entry={entry} myVoiceChannelId={myVoiceChannelId} onJoin={onJoin} onOpenDm={onOpenDm} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActiveNowCard({
  entry,
  myVoiceChannelId,
  onJoin,
  onOpenDm,
}: {
  entry: ActiveNowEntry;
  myVoiceChannelId: string | null;
  onJoin: (serverId: string, channel: PublicChannel) => void;
  onOpenDm: (friend: ActiveNowEntry["friend"]) => void;
}) {
  const { t } = useI18n();
  const { friend, room, activity, song } = entry;
  const KindIcon = activity ? KIND_ICON[activity.kind] : Gamepad2;
  const elapsed = activity ? activityElapsed(activity, Date.now(), t) : "";
  const subtitle = room
    ? t("friends.activeNow.inRoom", { room: room.channel.name })
    : activity
      ? activityLabel(activity, t)
      : song
        ? t("activity.listening", { name: song.song })
        : "";
  const here = room?.channel.id === myVoiceChannelId;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)]/60 p-3">
      <button
        type="button"
        onClick={() => onOpenDm(friend)}
        className="flex w-full items-center gap-2.5 text-left min-w-0 group"
      >
        <Avatar avatar={friend.avatar} avatarUrl={friend.avatarUrl} color={friend.color} size={32} />
        <span className="min-w-0">
          <span className="block font-bold text-sm text-[var(--ink)] truncate group-hover:text-[var(--lavender)]">
            {friend.displayName}
          </span>
          <span className="block text-xs text-[var(--muted)] truncate">{subtitle}</span>
        </span>
      </button>

      {room && (
        <div className="mt-2.5 rounded-lg bg-[var(--chat-bg)]/70 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--ink)] min-w-0">
            <Volume2 size={14} className="shrink-0 text-[var(--lavender,#a78bfa)]" aria-hidden="true" />
            <span className="truncate">{room.channel.name}</span>
          </div>
          <div className="text-[11px] text-[var(--muted)] truncate">{room.server.name}</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex -space-x-1.5" aria-label={room.people.map((person) => person.displayName).join(", ")}>
              {room.people.slice(0, 5).map((person) => (
                <Avatar
                  key={person.id}
                  avatar={person.avatar}
                  avatarUrl={person.avatarUrl}
                  color={person.color}
                  size={22}
                  className="ring-2 ring-[var(--panel)] rounded-full"
                />
              ))}
              {room.people.length > 5 && (
                <span className="ml-2.5 self-center text-[11px] font-bold text-[var(--muted)]">
                  +{room.people.length - 5}
                </span>
              )}
            </div>
            {here ? (
              <span className="text-[11px] font-bold text-emerald-400">{t("friends.activeNow.here")}</span>
            ) : (
              <button
                type="button"
                onClick={() => onJoin(room.server.id, room.channel)}
                className="px-3 py-1 rounded-lg bg-[var(--accent-strong)] hover:brightness-110 text-[var(--on-accent)] text-xs font-bold transition-all"
              >
                {t("friends.activeNow.join")}
              </button>
            )}
          </div>
        </div>
      )}

      {activity && (
        <div className="mt-2.5 flex items-center gap-2.5 min-w-0">
          <span className="grid place-items-center w-9 h-9 shrink-0 rounded-lg bg-[var(--chat-bg)]/70 text-[var(--lavender,#a78bfa)]">
            <KindIcon size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold text-[var(--ink)] truncate">{activity.name}</span>
            {(activity.details || elapsed) && (
              <span className="block text-[11px] text-[var(--muted)] truncate">
                {[activity.details, elapsed].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
        </div>
      )}

      {song && (
        <div className="mt-2.5 flex items-center gap-2.5 min-w-0">
          {song.albumArt ? (
            <img src={song.albumArt} alt="" className="w-9 h-9 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="grid place-items-center w-9 h-9 shrink-0 rounded-lg bg-[var(--chat-bg)]/70 text-emerald-400">
              <Music2 size={18} aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-xs font-bold text-[var(--ink)] truncate">{song.song}</span>
            <span className="block text-[11px] text-[var(--muted)] truncate">{song.artist}</span>
          </span>
        </div>
      )}
    </div>
  );
}
