"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Music, Play, Sticker, Trash2 } from "lucide-react";
import { apiFetch } from "../lib/client";

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
      .catch(() => onNotice("Could not load stickers."))
      .finally(() => setLoading(false));
  }, [serverId, onNotice]);

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
      onNotice(files.length === 1 ? "Sticker added." : `${files.length} stickers added.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "That sticker could not be uploaded.");
    } finally {
      setUploading(false);
      load();
    }
  }

  return (
    <div className="tab-pane">
      <div>
        <h1 className="pane-title">Stickers</h1>
        <p className="pane-subtitle">
          Stickers anyone in this server can send from the sticker picker. PNG, GIF and WebP
          images up to 8 MB work best.
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
            {uploading ? "Uploading…" : "Upload Stickers"}
          </button>
          <p className="drag-drop-note">You can pick several images at once.</p>
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
        <p className="loading-state">Loading stickers…</p>
      ) : stickers.length === 0 ? (
        <div className="empty-illustration-box">
          <div className="illustration-graphic">
            <Sticker size={42} />
          </div>
          <h2>NO STICKERS</h2>
          <p>{canManage ? "Upload an image to make the first one." : "Nobody has added any yet."}</p>
        </div>
      ) : (
        <div className="sticker-settings-grid">
          {stickers.map((sticker) => (
            <div key={sticker.id} className="sticker-settings-card">
              <img src={sticker.url} alt={sticker.name} />
              <InlineName
                label={`Name of sticker ${sticker.name}`}
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
                  aria-label={`Remove ${sticker.name}`}
                  title="Remove"
                  onClick={() =>
                    onRequestConfirm({
                      title: `Remove "${sticker.name}"?`,
                      message: "It will disappear from the sticker picker for everyone.",
                      isDanger: true,
                      confirmText: "Remove Sticker",
                      onConfirm: async () => {
                        await apiFetch(`/api/stickers/packs?id=${encodeURIComponent(sticker.id)}`, {
                          method: "DELETE",
                        }).catch((error) =>
                          onNotice(error instanceof Error ? error.message : "Could not remove it."),
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
  const [sounds, setSounds] = useState<ServerSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const playing = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<{ sounds: ServerSound[] }>(`/api/sounds?serverId=${encodeURIComponent(serverId)}`)
      .then((res) => setSounds(res.sounds || []))
      .catch(() => onNotice("Could not load the soundboard."))
      .finally(() => setLoading(false));
  }, [serverId, onNotice]);

  useEffect(load, [load]);
  useEffect(() => () => playing.current?.pause(), []);

  function preview(sound: ServerSound) {
    playing.current?.pause();
    const audio = new Audio(sound.url);
    audio.volume = 0.7;
    playing.current = audio;
    void audio.play().catch(() => onNotice("That clip could not be played."));
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
      onNotice(files.length === 1 ? "Sound added." : `${files.length} sounds added.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "That clip could not be uploaded.");
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
            label={`Emoji for ${sound.name}`}
            value={sound.emoji}
            maxLength={8}
            disabled={!editable}
            onSave={(emoji) => update(sound, { emoji })}
          />
        </div>
        <div className="emoji-name-col">
          <InlineName
            label={`Name of sound ${sound.name}`}
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
            aria-label={`Play ${sound.name}`}
          >
            <Play size={13} /> Play
          </button>
          {editable && (
            <button
              type="button"
              className="table-action-btn danger"
              onClick={() =>
                onRequestConfirm({
                  title: `Remove "${sound.name}"?`,
                  message: sound.personal
                    ? "It will be removed from your personal pack."
                    : "It will disappear from the soundboard for everyone.",
                  isDanger: true,
                  confirmText: "Remove Sound",
                  onConfirm: async () => {
                    await apiFetch(`/api/sounds?id=${encodeURIComponent(sound.id)}`, {
                      method: "DELETE",
                    }).catch((error) =>
                      onNotice(error instanceof Error ? error.message : "Could not remove it."),
                    );
                    load();
                  },
                })
              }
            >
              Remove
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="tab-pane">
      <div>
        <h1 className="pane-title">Soundboard</h1>
        <p className="pane-subtitle">
          Clips anyone in a voice channel here can play for the room. MP3, OGG, WAV or M4A
          up to 3 MB. Click a name or emoji to change it.
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
            {uploading ? "Uploading…" : "Upload Sounds"}
          </button>
          <p className="drag-drop-note">You can pick several clips at once.</p>
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
        <p className="loading-state">Loading sounds…</p>
      ) : shared.length === 0 ? (
        <div className="empty-illustration-box">
          <div className="illustration-graphic">
            <Music size={42} />
          </div>
          <h2>NO SERVER SOUNDS</h2>
          <p>
            {canManage
              ? "Upload a clip to start the soundboard. The built-in sounds are always there too."
              : "Only the built-in sounds for now."}
          </p>
        </div>
      ) : (
        <div className="custom-emojis-table sound-table">
          <div className="table-head">
            <span>EMOJI</span>
            <span>NAME</span>
            <span>ACTIONS</span>
          </div>
          {shared.map((sound) => row(sound, canManage))}
        </div>
      )}

      {!loading && personal.length > 0 && (
        <div>
          <h2 className="pane-section-title">Your personal pack</h2>
          <p className="pane-subtitle">Only you can play these. They follow you to every server.</p>
          <div className="custom-emojis-table sound-table">
            {personal.map((sound) => row(sound, true))}
          </div>
        </div>
      )}
    </div>
  );
}
