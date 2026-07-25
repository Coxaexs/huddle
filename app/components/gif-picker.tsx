"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/client";

interface Gif {
  id: string;
  description: string;
  preview: string;
  url: string;
}

interface GifPickerProps {
  onPick: (url: string) => void;
  onClose: () => void;
}

export function GifPicker({ onPick, onClose }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Debounced so typing does not fire a request per keystroke.
    const timer = window.setTimeout(() => {
      apiFetch<{ gifs: Gif[]; configured?: boolean; hint?: string }>(
        `/api/gifs?q=${encodeURIComponent(query)}`,
      )
        .then((data) => {
          if (cancelled) return;
          setGifs(data.gifs || []);
          setHint(data.configured === false ? data.hint || "" : "");
        })
        .catch(() => {
          if (!cancelled) setHint("GIF search is unavailable right now.");
        })
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="gif-picker">
      <div className="gif-picker-head">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search GIFs"
          aria-label="Search GIFs"
          autoFocus
        />
        <button type="button" onClick={onClose} aria-label="Close GIF picker">
          ×
        </button>
      </div>

      {hint && <p className="gif-picker-hint">{hint}</p>}

      <div className="gif-grid">
        {gifs.map((gif) => (
          <button
            key={gif.id}
            type="button"
            className="gif-cell"
            title={gif.description}
            onClick={() => onPick(gif.url)}
          >
            <img src={gif.preview} alt={gif.description} loading="lazy" />
          </button>
        ))}
        {!gifs.length && !hint && (
          <p className="gif-picker-hint">
            {loading ? "Looking…" : "Nothing matched that."}
          </p>
        )}
      </div>
    </div>
  );
}
