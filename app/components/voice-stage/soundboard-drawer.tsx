"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, Volume1, VolumeX, Play, Search, X } from "lucide-react";
import { SOUNDBOARD_PRESETS, playPresetSound } from "@/lib/soundboard-presets";
import { apiFetch } from "../../lib/client";
import type { Sound } from "./types";

/** The soundboard: browse and play presets or server clips; upload new ones; adjust volume. */
export function SoundboardDrawer({
  serverId,
  channelId,
  canManage,
  onClose,
}: {
  serverId: string | null;
  channelId: string | null;
  canManage: boolean;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<"presets" | "server">("presets");
  const [search, setSearch] = useState("");
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [personalUpload, setPersonalUpload] = useState(false);
  const [volume, setVolume] = useState<number>(() => {
    if (typeof localStorage === "undefined") return 0.7;
    const v = parseFloat(localStorage.getItem("huddle_soundboard_volume") || "0.7");
    return isNaN(v) ? 0.7 : Math.max(0, Math.min(1, v));
  });
  const [recentlyPlayed, setRecentlyPlayed] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    try {
      localStorage.setItem("huddle_soundboard_volume", newVol.toString());
    } catch {
      // ignore
    }
  };

  const load = useRef<() => void>(() => {});
  load.current = () => {
    if (!serverId) return;
    apiFetch<{ sounds: Sound[] }>(
      `/api/sounds?serverId=${encodeURIComponent(serverId)}`,
    )
      .then((data) => setSounds(data.sounds || []))
      .catch(() => undefined);
  };
  useEffect(() => {
    load.current();
  }, [serverId]);

  function playSoundboardItem(soundId: string, name: string) {
    if (!channelId) return;
    setRecentlyPlayed(soundId);
    window.setTimeout(() => setRecentlyPlayed(null), 600);
    void apiFetch("/api/sounds/play", {
      method: "POST",
      body: JSON.stringify({ channelId, soundId }),
    }).catch(() => undefined);
  }

  function previewPreset(presetId: string, e: React.MouseEvent) {
    e.stopPropagation();
    playPresetSound(presetId, volume);
  }

  function previewCustom(url: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const audio = new Audio(url);
      audio.volume = volume;
      void audio.play().catch(() => undefined);
    } catch {
      // ignore
    }
  }

  async function upload(file: File | undefined | null) {
    if (!file || !serverId) return;
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const uploaded = await apiFetch<{ key: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      await apiFetch("/api/sounds", {
        method: "POST",
        body: JSON.stringify({
          serverId,
          key: uploaded.key,
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 40),
          personal: personalUpload,
        }),
      });
      load.current();
    } catch (error) {
      // Say why (too big, wrong format) instead of failing silently.
      setUploadError(error instanceof Error ? error.message : "That sound did not upload.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(sound: Sound, e: React.MouseEvent) {
    e.stopPropagation();
    await apiFetch(`/api/sounds?id=${encodeURIComponent(sound.id)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    load.current();
  }

  const filteredPresets = SOUNDBOARD_PRESETS.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSounds = sounds.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="soundboard">
      <div className="soundboard-header-bar flex items-center justify-between gap-2 w-full pb-2 mb-1 border-b border-[var(--line)]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`soundboard-tab-btn ${tab === "presets" ? "active" : ""}`}
            onClick={() => setTab("presets")}
          >
            Instant Presets ({SOUNDBOARD_PRESETS.length})
          </button>
          <button
            type="button"
            className={`soundboard-tab-btn ${tab === "server" ? "active" : ""}`}
            onClick={() => setTab("server")}
          >
            Server Clips ({sounds.length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="soundboard-volume-wrap flex items-center gap-1.5" title={`Soundboard Volume: ${Math.round(volume * 100)}%`}>
            {volume === 0 ? <VolumeX size={14} className="text-[var(--muted)]" /> : volume < 0.5 ? <Volume1 size={14} className="text-[var(--muted)]" /> : <Volume2 size={14} className="text-[var(--muted)]" />}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="soundboard-volume-slider w-16 h-1 cursor-pointer accent-[var(--lavender)]"
            />
            <span className="text-[10px] text-[var(--muted)] w-6 font-mono">{Math.round(volume * 100)}%</span>
          </div>

          <div className="relative flex items-center">
            <Search size={12} className="absolute left-2 text-[var(--muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search sounds..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="soundboard-search-input pl-6 pr-2 py-0.5 text-xs rounded-md bg-[var(--paper)] border border-[var(--line)] w-28 focus:w-36 transition-all outline-none"
            />
          </div>

          {onClose && (
            <button
              type="button"
              className="popup-close-x"
              onClick={onClose}
              aria-label="Close soundboard"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="soundboard-grid flex flex-wrap gap-2 w-full">
        {tab === "presets" && (
          <>
            {filteredPresets.map((preset) => (
              <div key={preset.id} className="soundboard-pad-wrap">
                <button
                  type="button"
                  className={`soundboard-pad ${recentlyPlayed === `preset:${preset.id}` ? "played" : ""}`}
                  onClick={() => playSoundboardItem(`preset:${preset.id}`, preset.name)}
                  title={`${preset.name} - ${preset.description}\n(Click to play to room)`}
                >
                  <span className="soundboard-emoji">{preset.emoji}</span>
                  <span className="soundboard-name">{preset.name}</span>
                </button>
                <button
                  type="button"
                  className="soundboard-preview-btn"
                  title="Preview for only you"
                  onClick={(e) => previewPreset(preset.id, e)}
                >
                  <Play size={10} />
                </button>
              </div>
            ))}
            {filteredPresets.length === 0 && (
              <p className="soundboard-empty">No preset sounds match &ldquo;{search}&rdquo;</p>
            )}
          </>
        )}

        {tab === "server" && (
          <>
            {filteredSounds.map((sound) => (
              <div key={sound.id} className="soundboard-pad-wrap">
                <button
                  type="button"
                  className={`soundboard-pad ${sound.personal ? "personal" : ""} ${recentlyPlayed === sound.id ? "played" : ""}`}
                  onClick={() => playSoundboardItem(sound.id, sound.name)}
                  title={`${sound.name}${sound.personal ? " (your pack)" : ""}\n(Click to play to room)`}
                >
                  <span className="soundboard-emoji">{sound.emoji}</span>
                  <span className="soundboard-name">{sound.name}</span>
                </button>
                <button
                  type="button"
                  className="soundboard-preview-btn"
                  title="Preview for only you"
                  onClick={(e) => previewCustom(sound.url, e)}
                >
                  <Play size={10} />
                </button>
                {(canManage || sound.personal) && (
                  <button
                    type="button"
                    className="soundboard-delete"
                    title={`Delete ${sound.name}`}
                    onClick={(e) => void remove(sound, e)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {(canManage || true) && (
              <button
                type="button"
                className="soundboard-pad add"
                disabled={uploading || !serverId}
                onClick={() => fileRef.current?.click()}
              >
                <span className="soundboard-emoji">{uploading ? "…" : "＋"}</span>
                <span className="soundboard-name">Upload</span>
              </button>
            )}
            {filteredSounds.length === 0 && sounds.length === 0 && (
              <p className="soundboard-empty">No custom sounds yet. Click upload to add audio clips!</p>
            )}
            {uploadError && <p className="soundboard-empty" role="alert">{uploadError}</p>}
            {filteredSounds.length === 0 && sounds.length > 0 && (
              <p className="soundboard-empty">No server sounds match &ldquo;{search}&rdquo;</p>
            )}
            <div className="soundboard-upload-options w-full mt-1">
              <label className="soundboard-personal-toggle">
                <input
                  type="checkbox"
                  checked={personalUpload}
                  onChange={(event) => setPersonalUpload(event.target.checked)}
                />
                <span>Add to my personal pack</span>
              </label>
            </div>
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
