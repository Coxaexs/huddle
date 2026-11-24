"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Music, Play, Sticker, Trash2 } from "lucide-react";
import { apiFetch } from "../lib/client";
import { useI18n } from "../lib/i18n-context";

interface ConfirmRequest {
  title: string;
  message?: string;
  isDanger?: boolean;
  confirmText?: string;
  onConfirm: () => void;
}

interface ExpressionTabProps {
  serverId: string;
  canManage: boolean;
  onRequestConfirm: (options: ConfirmRequest) => void;
  onNotice: (text: string) => void;
}

/** A name field that saves when it loses focus or Enter is pressed. */
function InlineName({
  value,
  maxLength,
  disabled,
  onSave,
  label,
}: {
  value: string;
  maxLength: number;
  disabled: boolean;
  onSave: (next: string) => Promise<void>;
  label: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  async function commit() {
    const next = draft.trim();
    if (!next || next === value) {
      setDraft(value);
      return;
    }
    await onSave(next).catch(() => setDraft(value));
  }

  return (
    <input
      className="expression-name-input"
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

async function uploadFile(file: File, purpose?: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  if (purpose) form.append("purpose", purpose);
  const uploaded = await apiFetch<{ key: string }>("/api/uploads", {
    method: "POST",
    body: form,
  });
  return uploaded.key;
}

function baseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "untitled";
}

interface ServerSticker {
  id: string;
  name: string;
  url: string;
}

/** Server Settings → Stickers: upload, rename and remove custom stickers. */
export function StickersTab({ serverId, canManage, onRequestConfirm, onNotice }: ExpressionTabProps) {
  const { t } = useI18n();
  const [stickers, setStickers] = useState<ServerSticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<{ stickers: ServerSticker[] }>(
      `/api/stickers/packs?serverId=${encodeURIComponent(serverId)}`,
    )
      .then((res) => setStickers(res.stickers || []))
      .catch(() => onNotice(t("settings.expr.stickersLoadError")))
      .finally(() => setLoading(false));
  }, [serverId, onNotice, t]);

  useEffect(load, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const key = await uploadFile(file);
        await apiFetch("/api/stickers/packs", {
          method: "POST",
          body: JSON.stringify({ serverId, key, name: baseName(file) }),
        });
      }
      onNotice(files.length === 1 ? t("settings.expr.stickerAdded") : t("settings.expr.stickersAdded", { count: files.length }));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : t("settings.expr.stickerUploadError"));
    } finally {
      setUploading(false);
      load();
    }
  }

  return (
    <div className="tab-pane">
      <div>
        <h1 className="pane-title">{t("settings.expr.stickersTitle")}</h1>
        <p className="pane-subtitle">
          {t("settings.expr.stickersSubtitle")}
        </p>
      </div>

      {canManage && (
        <div className="emoji-upload-row">
          <button
            type="button"
            className="discord-btn primary-indigo"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? t("settings.deco.uploading") : t("settings.expr.uploadStickers")}
          </button>
          <p className="drag-drop-note">{t("settings.expr.pickImagesHint")}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/gif,image/webp,image/jpeg"
            multiple
            hidden
            onChange={(event) => {
              void upload(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      )}

      {loading ? (
        <p className="loading-state">{t("settings.expr.loadingStickers")}</p>
      ) : stickers.length === 0 ? (
        <div className="empty-illustration-box">
          <div className="illustration-graphic">
            <Sticker size={42} />
          </div>
          <h2>{t("settings.expr.noStickers")}</h2>
          <p>{canManage ? t("settings.expr.noStickersManage") : t("settings.expr.noStickersEmpty")}</p>
        </div>
      ) : (
        <div className="sticker-settings-grid">
          {stickers.map((sticker) => (
            <div key={sticker.id} className="sticker-settings-card">
              <img src={sticker.url} alt={sticker.name} />
              <InlineName
                label={t("settings.expr.stickerNameAria", { name: sticker.name })}
                value={sticker.name}
                maxLength={40}
                disabled={!canManage}
                onSave={async (name) => {
                  await apiFetch("/api/stickers/packs", {
                    method: "PATCH",
                    body: JSON.stringify({ id: sticker.id, name }),
                  });
                  setStickers((prev) =>
                    prev.map((item) => (item.id === sticker.id ? { ...item, name } : item)),
                  );
                }}
              />
              {canManage && (
                <button
                  type="button"
                  className="sticker-settings-remove"
                  aria-label={t("settings.expr.removeStickerAria", { name: sticker.name })}
                  title={t("settings.expr.remove")}
                  onClick={() =>
                    onRequestConfirm({
                      title: t("settings.expr.removeTitle", { name: sticker.name }),
                      message: t("settings.expr.removeStickerMsg"),
                      isDanger: true,
                      confirmText: t("settings.expr.removeStickerConfirm"),
                      onConfirm: async () => {
                        await apiFetch(`/api/stickers/packs?id=${encodeURIComponent(sticker.id)}`, {
                          method: "DELETE",
                        }).catch((error) =>
                          onNotice(error instanceof Error ? error.message : t("settings.expr.removeError")),
                        );
                        load();
                      },
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ServerSound {
  id: string;
  name: string;
  emoji: string;
  url: string;
  personal: boolean;
}

/**
 * Server Settings → Soundboard: the server's shared clips (upload, preview,
 * rename, change emoji, remove), plus a read-only look at your personal pack.
 */
export function SoundboardTab({ serverId, canManage, onRequestConfirm, onNotice }: ExpressionTabProps) {
  const { t } = useI18n();
  const [sounds, setSounds] = useState<ServerSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const playing = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<{ sounds: ServerSound[] }>(`/api/sounds?serverId=${encodeURIComponent(serverId)}`)
      .then((res) => setSounds(res.sounds || []))
      .catch(() => onNotice(t("settings.expr.soundsLoadError")))
      .finally(() => setLoading(false));
  }, [serverId, onNotice, t]);

  useEffect(load, [load]);
  useEffect(() => () => playing.current?.pause(), []);

  function preview(sound: ServerSound) {
    playing.current?.pause();
    const audio = new Audio(sound.url);
    audio.volume = 0.7;
    playing.current = audio;
    void audio.play().catch(() => onNotice(t("settings.expr.clipPlayError")));
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const key = await uploadFile(file);
        await apiFetch("/api/sounds", {
          method: "POST",
          body: JSON.stringify({ serverId, key, name: baseName(file) }),
        });
      }
      onNotice(files.length === 1 ? t("settings.expr.soundAdded") : t("settings.expr.soundsAdded", { count: files.length }));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : t("settings.expr.clipUploadError"));
    } finally {
      setUploading(false);
      load();
    }
  }

  async function update(sound: ServerSound, patch: { name?: string; emoji?: string }) {
    await apiFetch("/api/sounds", {
      method: "PATCH",
      body: JSON.stringify({ id: sound.id, ...patch }),
    });
    setSounds((prev) => prev.map((item) => (item.id === sound.id ? { ...item, ...patch } : item)));
  }

  const shared = sounds.filter((sound) => !sound.personal);
  const personal = sounds.filter((sound) => sound.personal);

  function row(sound: ServerSound, editable: boolean) {
    return (
      <div key={sound.id} className="table-row">
        <div className="sound-emoji-col">
          <InlineName
            label={t("settings.expr.soundEmojiAria", { name: sound.name })}
            value={sound.emoji}
            maxLength={8}
            disabled={!editable}
            onSave={(emoji) => update(sound, { emoji })}
          />
        </div>
        <div className="emoji-name-col">
          <InlineName
            label={t("settings.expr.soundNameAria", { name: sound.name })}
            value={sound.name}
            maxLength={40}
            disabled={!editable}
            onSave={(name) => update(sound, { name })}
          />
        </div>
        <div className="emoji-actions-col">
          <button
            type="button"
            className="table-action-btn"
            onClick={() => preview(sound)}
            aria-label={t("settings.expr.playSoundAria", { name: sound.name })}
          >
            <Play size={13} /> {t("settings.expr.play")}
          </button>
          {editable && (
            <button
              type="button"
              className="table-action-btn danger"
              onClick={() =>
                onRequestConfirm({
                  title: t("settings.expr.removeTitle", { name: sound.name }),
                  message: sound.personal
                    ? t("settings.expr.removePersonalSoundMsg")
                    : t("settings.expr.removeServerSoundMsg"),
                  isDanger: true,
                  confirmText: t("settings.expr.removeSoundConfirm"),
                  onConfirm: async () => {
                    await apiFetch(`/api/sounds?id=${encodeURIComponent(sound.id)}`, {
                      method: "DELETE",
                    }).catch((error) =>
                      onNotice(error instanceof Error ? error.message : t("settings.expr.removeError")),
                    );
                    load();
                  },
                })
              }
            >
              {t("settings.expr.remove")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="tab-pane">
      <div>
        <h1 className="pane-title">{t("settings.expr.soundboardTitle")}</h1>
        <p className="pane-subtitle">
          {t("settings.expr.soundboardSubtitle")}
        </p>
      </div>

      {canManage && (
        <div className="emoji-upload-row">
          <button
            type="button"
            className="discord-btn primary-indigo"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? t("settings.deco.uploading") : t("settings.expr.uploadSounds")}
          </button>
          <p className="drag-drop-note">{t("settings.expr.pickClipsHint")}</p>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.ogg,.wav,.m4a"
            multiple
            hidden
            onChange={(event) => {
              void upload(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      )}

      {loading ? (
        <p className="loading-state">{t("settings.expr.loadingSounds")}</p>
      ) : shared.length === 0 ? (
        <div className="empty-illustration-box">
          <div className="illustration-graphic">
            <Music size={42} />
          </div>
          <h2>{t("settings.expr.noSounds")}</h2>
          <p>
            {canManage
              ? t("settings.expr.noSoundsManage")
              : t("settings.expr.noSoundsEmpty")}
          </p>
        </div>
      ) : (
        <div className="custom-emojis-table sound-table">
          <div className="table-head">
            <span>{t("settings.expr.colEmoji")}</span>
            <span>{t("settings.expr.colName")}</span>
            <span>{t("settings.expr.colActions")}</span>
          </div>
          {shared.map((sound) => row(sound, canManage))}
        </div>
      )}

      {!loading && personal.length > 0 && (
        <div>
          <h2 className="pane-section-title">{t("settings.expr.personalPackTitle")}</h2>
          <p className="pane-subtitle">{t("settings.expr.personalPackSub")}</p>
          <div className="custom-emojis-table sound-table">
            {personal.map((sound) => row(sound, true))}
          </div>
        </div>
      )}
    </div>
  );
}
