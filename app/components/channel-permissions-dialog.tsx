"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Lock, Minus, Plus, Search, Shield, User, Users, X } from "lucide-react";
import { channelKindInfo } from "@/lib/channel-kinds";
import { OVERWRITE_FLAGS, type ChannelOverwrite, type OverwriteTarget } from "@/lib/channel-permissions";
import { Permission, type PermissionFlag } from "@/lib/permissions";
import type { PublicChannel } from "@/lib/servers";
import type { TranslatableKey } from "@/lib/i18n";
import { apiFetch } from "../lib/client";
import { useI18n } from "../lib/i18n-context";

/** Opens the editor for a channel; the dialog is mounted once in the chat overlays. */
export const CHANNEL_PERMISSIONS_EVENT = "hoffle:channel-permissions";
export function openChannelPermissions(channel: PublicChannel): void {
  window.dispatchEvent(new CustomEvent(CHANNEL_PERMISSIONS_EVENT, { detail: { channel } }));
}

interface RoleOption { id: string; name: string; color: string; position: number }
interface MemberOption { id: string; username: string; displayName: string; avatar: string; avatarUrl: string | null; color: string }
interface Loaded { overwrites: ChannelOverwrite[]; roles: RoleOption[]; members: MemberOption[] }

const FLAG_KEY: Record<number, string> = {
  [Permission.VIEW_CHANNEL]: "view",
  [Permission.SEND_MESSAGES]: "send",
  [Permission.ATTACH_FILES]: "files",
  [Permission.ADD_REACTIONS]: "react",
  [Permission.MENTION_EVERYONE]: "everyone",
  [Permission.MANAGE_MESSAGES]: "manage",
  [Permission.CONNECT]: "connect",
  [Permission.SPEAK]: "speak",
  [Permission.VIDEO]: "video",
};
const VOICE_ONLY = Permission.CONNECT | Permission.SPEAK | Permission.VIDEO;

const keyOf = (o: { targetType: OverwriteTarget; targetId: string }) => `${o.targetType}:${o.targetId}`;
const EVERYONE_KEY = "everyone:";

export function ChannelPermissionsDialog() {
  const { t } = useI18n();
  const [channel, setChannel] = useState<PublicChannel | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<ChannelOverwrite[]>([]);
  const [selected, setSelected] = useState(EVERYONE_KEY);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const open = (event: Event) => {
      const next = (event as CustomEvent<{ channel: PublicChannel }>).detail?.channel;
      if (!next) return;
      setChannel(next);
      setLoaded(null);
      setDraft([]);
      setSelected(EVERYONE_KEY);
      setAdding(false);
      setError("");
      apiFetch<Loaded>(`/api/channels/${next.id}/permissions`)
        .then((data) => {
          setLoaded(data);
          setDraft(data.overwrites);
        })
        .catch((err) => setError(err instanceof Error ? err.message : t("channelPerms.loadFailed")));
    };
    window.addEventListener(CHANNEL_PERMISSIONS_EVENT, open);
    return () => window.removeEventListener(CHANNEL_PERMISSIONS_EVENT, open);
  }, [t]);

  const voice = channel ? channelKindInfo(channel.kind).voice : false;
  const flags = OVERWRITE_FLAGS.filter((flag) => voice || !(flag & VOICE_ONLY));
  const everyone = draft.find((o) => o.targetType === "everyone");
  const isPrivate = Boolean(everyone && everyone.deny & Permission.VIEW_CHANNEL);
  const someoneCanSee = draft.some((o) => o.targetType !== "everyone" && o.allow & Permission.VIEW_CHANNEL);

  const roleById = useMemo(() => new Map((loaded?.roles || []).map((r) => [r.id, r])), [loaded]);
  const memberById = useMemo(() => new Map((loaded?.members || []).map((m) => [m.id, m])), [loaded]);
  const targets = useMemo(() => {
    const listed = draft.filter((o) => o.targetType !== "everyone");
    // Targets the editor added but has not set anything on yet stay listed too.
    return [{ targetType: "everyone" as const, targetId: "" }, ...listed];
  }, [draft]);

  if (!channel) return null;
  const close = () => setChannel(null);

  /** Sets one flag on one target to deny (-1), default (0) or allow (1). */
  const setFlag = (target: { targetType: OverwriteTarget; targetId: string }, flag: PermissionFlag, state: -1 | 0 | 1) => {
    setDraft((rows) => {
      const key = keyOf(target);
      const existing = rows.find((o) => keyOf(o) === key) || { ...target, allow: 0, deny: 0 };
      const next = {
        ...existing,
        allow: state === 1 ? existing.allow | flag : existing.allow & ~flag,
        deny: state === -1 ? existing.deny | flag : existing.deny & ~flag,
      };
      const others = rows.filter((o) => keyOf(o) !== key);
      return [...others, next];
    });
  };
  const stateOf = (target: { targetType: OverwriteTarget; targetId: string }, flag: PermissionFlag): -1 | 0 | 1 => {
    const row = draft.find((o) => keyOf(o) === keyOf(target));
    if (!row) return 0;
    if (row.allow & flag) return 1;
    if (row.deny & flag) return -1;
    return 0;
  };
  const togglePrivate = () => setFlag({ targetType: "everyone", targetId: "" }, Permission.VIEW_CHANNEL, isPrivate ? 0 : -1);

  const addTarget = (targetType: "role" | "member", targetId: string) => {
    const target = { targetType, targetId };
    // A new target in a private channel starts out able to see it: that's why it was added.
    setDraft((rows) =>
      rows.some((o) => keyOf(o) === keyOf(target))
        ? rows
        : [...rows, { ...target, allow: isPrivate ? Permission.VIEW_CHANNEL : 0, deny: 0 }],
    );
    setSelected(keyOf(target));
    setAdding(false);
    setQuery("");
  };
  const removeTarget = (key: string) => {
    setDraft((rows) => rows.filter((o) => keyOf(o) !== key));
    setSelected(EVERYONE_KEY);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/channels/${channel.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ overwrites: draft.filter((o) => o.allow || o.deny || o.targetType !== "everyone") }),
      });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("channelPerms.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const label = (target: { targetType: OverwriteTarget; targetId: string }) => {
    if (target.targetType === "everyone") return "@everyone";
    if (target.targetType === "role") return roleById.get(target.targetId)?.name || t("channelPerms.unknownRole");
    const member = memberById.get(target.targetId);
    return member ? member.displayName || member.username : t("channelPerms.unknownMember");
  };
  const icon = (target: { targetType: OverwriteTarget; targetId: string }) =>
    target.targetType === "everyone" ? <Users size={15} /> : target.targetType === "role" ? (
      <Shield size={15} style={{ color: roleById.get(target.targetId)?.color }} />
    ) : (
      <User size={15} />
    );

  const listed = new Set(draft.map(keyOf));
  const q = query.trim().toLowerCase();
  const roleChoices = (loaded?.roles || []).filter((r) => !listed.has(`role:${r.id}`) && (!q || r.name.toLowerCase().includes(q)));
  const memberChoices = (loaded?.members || [])
    .filter((m) => !listed.has(`member:${m.id}`) && (!q || `${m.displayName} ${m.username}`.toLowerCase().includes(q)))
    .slice(0, 30);
  const current = targets.find((target) => keyOf(target) === selected) || targets[0];

  return (
    <div className="custom-dialog-backdrop" onClick={close}>
      <div
        className="forward-dialog-card chperm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chperm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="forward-dialog-header">
          <div className="min-w-0">
            <h3 id="chperm-title" className="forward-dialog-title">
              {t("channelPerms.title", { channel: channel.name })}
            </h3>
            <p className="forward-dialog-subtitle">{t("channelPerms.subtitle")}</p>
          </div>
          <button type="button" className="forward-dialog-close" aria-label={t("common.close")} onClick={close}>
            <X size={16} />
          </button>
        </div>

        {!loaded && !error && (
          <div className="chperm-loading"><Loader2 size={18} className="animate-spin" /></div>
        )}
        {loaded && (
          <>
            <label className="chperm-private">
              <span className="chperm-private-icon"><Lock size={16} /></span>
              <span className="chperm-private-text">
                <strong>{t("channelPerms.private")}</strong>
                <small>{t("channelPerms.privateHint")}</small>
              </span>
              <input type="checkbox" role="switch" checked={isPrivate} onChange={togglePrivate} />
            </label>
            {isPrivate && !someoneCanSee && <p className="chperm-warn">{t("channelPerms.nobodyYet")}</p>}

            <div className="chperm-body">
              <div className="chperm-targets">
                {targets.map((target) => (
                  <button
                    key={keyOf(target)}
                    type="button"
                    className={`chperm-target${keyOf(target) === selected ? " active" : ""}`}
                    onClick={() => setSelected(keyOf(target))}
                  >
                    {icon(target)}
                    <span>{label(target)}</span>
                  </button>
                ))}
                <button type="button" className="chperm-add" onClick={() => setAdding((v) => !v)}>
                  <Plus size={14} /> {t("channelPerms.add")}
                </button>
                {adding && (
                  <div className="chperm-picker">
                    <div className="forward-search-wrap">
                      <Search size={14} className="forward-search-icon" />
                      <input
                        autoFocus
                        className="forward-search-input"
                        placeholder={t("channelPerms.searchPlaceholder")}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </div>
                    <div className="chperm-picker-list">
                      {roleChoices.map((r) => (
                        <button key={r.id} type="button" onClick={() => addTarget("role", r.id)}>
                          <Shield size={14} style={{ color: r.color }} /> {r.name}
                        </button>
                      ))}
                      {memberChoices.map((m) => (
                        <button key={m.id} type="button" onClick={() => addTarget("member", m.id)}>
                          <User size={14} /> {m.displayName || m.username} <small>@{m.username}</small>
                        </button>
                      ))}
                      {!roleChoices.length && !memberChoices.length && <p className="chperm-empty">{t("channelPerms.noMatches")}</p>}
                    </div>
                  </div>
                )}
              </div>

              <div className="chperm-flags">
                <div className="chperm-flags-head">
                  <strong>{label(current)}</strong>
                  {current.targetType !== "everyone" && (
                    <button type="button" className="chperm-remove" onClick={() => removeTarget(keyOf(current))}>
                      {t("channelPerms.remove")}
                    </button>
                  )}
                </div>
                {flags.map((flag) => {
                  const state = stateOf(current, flag);
                  const name = FLAG_KEY[flag];
                  return (
                    <div key={flag} className="chperm-flag">
                      <span className="chperm-flag-text">
                        <span>{t(`channelPerms.flag.${name}` as TranslatableKey)}</span>
                        <small>{t(`channelPerms.flag.${name}.hint` as TranslatableKey)}</small>
                      </span>
                      <span className="chperm-tri" role="radiogroup" aria-label={t(`channelPerms.flag.${name}` as TranslatableKey)}>
                        <button type="button" role="radio" aria-checked={state === -1} title={t("channelPerms.deny")}
                          className={`deny${state === -1 ? " on" : ""}`} onClick={() => setFlag(current, flag, -1)}>
                          <X size={13} />
                        </button>
                        <button type="button" role="radio" aria-checked={state === 0} title={t("channelPerms.default")}
                          className={`neutral${state === 0 ? " on" : ""}`} onClick={() => setFlag(current, flag, 0)}>
                          <Minus size={13} />
                        </button>
                        <button type="button" role="radio" aria-checked={state === 1} title={t("channelPerms.allow")}
                          className={`allow${state === 1 ? " on" : ""}`} onClick={() => setFlag(current, flag, 1)}>
                          <Check size={13} />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {error && <p className="auth-error">{error}</p>}
        <div className="forward-dialog-footer">
          <button type="button" className="forward-btn-cancel" onClick={close}>{t("common.cancel")}</button>
          <button type="button" className="forward-btn-submit" disabled={!loaded || saving} onClick={() => void save()}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {t("channelPerms.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
