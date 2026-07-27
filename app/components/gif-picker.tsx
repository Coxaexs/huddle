"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/client";
import { EmojiPicker } from "./emoji-picker";

interface MediaItem {
  id: string;
  description?: string;
  name?: string;
  preview?: string;
  url: string;
}

type Tab = "gif" | "sticker" | "server" | "emoji";

interface GifPickerProps {
  onPick: (url: string) => void;
  onClose: () => void;
  serverId: string | null;
  /** Whether this member may upload/remove server stickers. */
  canManageStickers: boolean;
  /** Inserts text (an `:emoji:` shortcode) into the composer. */
  onInsert?: (text: string) => void;
  /** Called after emoji change so the shell can reload them. */
  onEmojiChange?: () => void;
}

/**
 * The composer's media picker: Klipy GIFs, Klipy stickers, and a server's own
 * uploaded stickers. Picking any item posts its URL as a message; the message
 * body renders image/GIF URLs as the picture itself.
 */
export function GifPicker({
  onPick,
  onClose,
  serverId,
  canManageStickers,
  onInsert,
  onEmojiChange,
}: GifPickerProps) {
  const [tab, setTab] = useState<Tab>("gif");
  const [customEmojis, setCustomEmojis] = useState<
    Array<{ id: string; name: string; url: string }>
  >([]);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadEmojis = useRef<() => void>(() => {});
  loadEmojis.current = () => {
    if (!serverId) return;
    apiFetch<{ emojis: Array<{ id: string; name: string; url: string }> }>(
      `/api/emojis?serverId=${encodeURIComponent(serverId)}`,
    )
      .then((data) => setCustomEmojis(data.emojis || []))
      .catch(() => undefined);
  };
  useEffect(() => {
    if (tab === "emoji") loadEmojis.current();
  }, [tab, serverId]);

  async function uploadEmoji(file: File | undefined | null) {
    if (!file || !serverId) return;
    const name = window.prompt(
      "Emoji name (letters, numbers, underscore)",
      file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, ""),
    );
    if (!name) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploaded = await apiFetch<{ key: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      await apiFetch("/api/emojis", {
        method: "POST",
        body: JSON.stringify({ serverId, key: uploaded.key, name }),
      });
      loadEmojis.current();
      onEmojiChange?.();
    } catch (failure) {
      setHint(failure instanceof Error ? failure.message : "Could not add it.");
    } finally {
      setUploading(false);
    }
  }

  async function removeEmoji(id: string) {
    await apiFetch(`/api/emojis?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    loadEmojis.current();
    onEmojiChange?.();
  }

  useEffect(() => {
    if (tab === "server" || tab === "emoji") return; // these load separately
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      const endpoint =
        tab === "gif"
          ? `/api/gifs?q=${encodeURIComponent(query)}`
          : `/api/stickers?q=${encodeURIComponent(query)}`;
      apiFetch<{
        gifs?: MediaItem[];
        stickers?: MediaItem[];
        configured?: boolean;
        hint?: string;
      }>(endpoint)
        .then((data) => {
          if (cancelled) return;
          setItems(data.gifs || data.stickers || []);
          setHint(data.configured === false ? data.hint || "" : "");
        })
        .catch(() => {
          if (!cancelled) setHint("Search is unavailable right now.");
        })
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, tab]);

  const loadServerStickers = useRef<() => void>(() => {});
  loadServerStickers.current = () => {
    if (!serverId) {
      setItems([]);
      setHint("Open a server to see its stickers.");
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<{ stickers: MediaItem[] }>(
      `/api/stickers/packs?serverId=${encodeURIComponent(serverId)}`,
    )
      .then((data) => {
        setItems(data.stickers || []);
        setHint("");
      })
      .catch(() => setHint("Could not load server stickers."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (tab === "server") loadServerStickers.current();
  }, [tab, serverId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function uploadSticker(file: File | undefined | null) {
    if (!file || !serverId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploaded = await apiFetch<{ key: string }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      await apiFetch("/api/stickers/packs", {
        method: "POST",
        body: JSON.stringify({
          serverId,
          key: uploaded.key,
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 40),
        }),
      });
      loadServerStickers.current();
    } catch {
      setHint("That sticker could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function removeSticker(id: string) {
    await apiFetch(`/api/stickers/packs?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    loadServerStickers.current();
  }

  return (
    <div className="gif-picker">
      <div className="gif-picker-tabs">
        <button
          type="button"
          className={tab === "gif" ? "active" : ""}
          onClick={() => setTab("gif")}
        >
          GIFs
        </button>
        <button
          type="button"
          className={tab === "sticker" ? "active" : ""}
          onClick={() => setTab("sticker")}
        >
          Stickers
        </button>
        <button
          type="button"
          className={tab === "server" ? "active" : ""}
          onClick={() => setTab("server")}
        >
          Server
        </button>
        <button
          type="button"
          className={tab === "emoji" ? "active" : ""}
          onClick={() => setTab("emoji")}
        >
          Emoji
        </button>
        <button
          type="button"
          className="gif-picker-close"
          onClick={onClose}
          aria-label="Close picker"
        >
          ×
        </button>
      </div>

      {(tab === "gif" || tab === "sticker") && (
        <div className="gif-picker-head">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "gif" ? "Search GIFs" : "Search stickers"}
            aria-label="Search"
            autoFocus
          />
        </div>
      )}

      {tab === "emoji" && (
        <EmojiPicker
          serverId={serverId}
          canManageEmojis={canManageStickers}
          onPickEmoji={(codeOrUrl, isCustom) => {
            if (isCustom) {
              onInsert?.(`${codeOrUrl} `);
            } else {
              onInsert?.(`${codeOrUrl} `);
            }
          }}
          onClose={onClose}
          onRequestUploadEmoji={() => fileRef.current?.click()}
        />
      )}

      {tab === "server" && canManageStickers && (
        <div className="gif-picker-head">
          <button
            type="button"
            className="sticker-upload"
            disabled={uploading || !serverId}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "Uploading…" : "+ Add sticker"}
          </button>
        </div>
      )}

      {/* One hidden input serves both upload tabs. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (tab === "emoji") void uploadEmoji(file);
          else void uploadSticker(file);
          event.target.value = "";
        }}
      />

      {hint && <p className="gif-picker-hint">{hint}</p>}

      <div className="gif-grid" hidden={tab === "emoji"}>
        {items.map((item) => (
          <div key={item.id} className="gif-cell-wrap">
            <button
              type="button"
              className="gif-cell"
              title={item.description || item.name || ""}
              onClick={() => onPick(item.url)}
            >
              <img
                src={item.preview || item.url}
                alt={item.description || item.name || ""}
                loading="lazy"
              />
            </button>
            {tab === "server" && canManageStickers && (
              <button
                type="button"
                className="gif-cell-delete"
                aria-label="Remove sticker"
                onClick={() => void removeSticker(item.id)}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {!items.length && !hint && (
          <p className="gif-picker-hint">
            {loading
              ? "Looking…"
              : tab === "server"
                ? "No server stickers yet."
                : "Nothing matched that."}
          </p>
        )}
      </div>
    </div>
  );
}
