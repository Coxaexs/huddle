"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Download, Volume2, EyeOff, Film } from "lucide-react";
import {
  getFileBadgeColor,
  getFileDescription,
  getFileExtensionBadge,
} from "@/lib/upload-sniff";
import { bigUploadExpiryFromUrl, describeBigUploadExpiry } from "@/lib/big-upload-key";

export interface MessageFileItem {
  url: string;
  name: string;
  type?: string;
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function isAudioFile(f: MessageFileItem): boolean {
  const type = (f.type || "").toLowerCase();
  if (type.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"].includes(type)) {
    return true;
  }
  return /\.(mp3|wav|ogg|m4a|aac|flac|opus)(\?|#|$)/i.test(f.name || f.url || "");
}

export function isVideoFile(f: MessageFileItem): boolean {
  const type = (f.type || "").toLowerCase();
  if (type.startsWith("video/") || ["mp4", "webm", "mov", "m4v", "ogv", "mkv"].includes(type)) {
    return true;
  }
  return /\.(mp4|webm|mov|m4v|ogv|mkv)(\?|#|$)/i.test(f.name || f.url || "");
}

export function isSpoilerFile(f: MessageFileItem): boolean {
  return (
    /spoiler[_-]/i.test(f.name || "") ||
    /spoiler[_-]/i.test(f.url || "") ||
    /[?&]spoiler(=1|=true)?/i.test(f.url || "")
  );
}

/**
 * Inline playable audio card for MP3, WAV, OGG, FLAC, M4A attachments.
 */
export function InlineAudioAttachment({ url, name }: { url: string; name: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const cleanName = name.replace(/^spoiler[_-]/i, "");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(e.target.value);
    setCurrentTime(nextTime);
    if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-black/40 border border-white/10 max-w-[380px] w-full text-white text-xs select-none">
      <audio ref={audioRef} src={url} preload="metadata" />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0">
            <Volume2 size={15} />
          </div>
          <span className="font-medium truncate text-white/90" title={cleanName}>
            {cleanName}
          </span>
        </div>

        <a
          href={url}
          download={cleanName}
          className="text-white/50 hover:text-white p-1 rounded transition-colors flex-shrink-0"
          title="Download audio"
          aria-label={`Download ${cleanName}`}
        >
          <Download size={14} />
        </a>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center flex-shrink-0 transition-transform active:scale-95 shadow-md cursor-pointer"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" className="ml-0.5" />}
        </button>

        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            disabled={!duration}
            className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-indigo-400"
            style={{
              background: `linear-gradient(to right, #818cf8 ${progressPercent}%, rgba(255,255,255,0.15) ${progressPercent}%)`,
            }}
          />
          <div className="flex justify-between text-[10px] text-white/50 font-mono">
            <span>{formatAudioTime(currentTime)}</span>
            <span>{formatAudioTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline playable video card for MP4, WebM, MOV, M4V, OGV video attachments.
 */
export function InlineVideoAttachment({
  url,
  name,
  isSpoiler,
  onHideSpoiler,
}: {
  url: string;
  name: string;
  isSpoiler?: boolean;
  onHideSpoiler?: () => void;
}) {
  const [hasError, setHasError] = useState(false);
  const cleanName = name.replace(/^spoiler[_-]/i, "");

  return (
    <div className="flex flex-col gap-1.5 mt-2 max-w-[520px] w-full select-none">
      <div className="flex items-center justify-between gap-2 px-1 text-xs text-white/70">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center flex-shrink-0">
            <Film size={12} />
          </div>
          <span className="font-medium truncate text-white/90" title={cleanName}>
            {cleanName}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isSpoiler && onHideSpoiler && (
            <button
              type="button"
              onClick={onHideSpoiler}
              className="text-white/50 hover:text-white p-1 rounded transition-colors cursor-pointer"
              title="Hide spoiler"
              aria-label="Hide spoiler"
            >
              <EyeOff size={13} />
            </button>
          )}
          <a
            href={url}
            download={cleanName}
            className="text-white/50 hover:text-white p-1 rounded transition-colors flex items-center gap-1 text-[11px] hover:bg-white/10"
            title="Download video"
            aria-label={`Download ${cleanName}`}
          >
            <Download size={13} />
            <span className="hidden sm:inline">Download</span>
          </a>
        </div>
      </div>

      {hasError ? (
        <div className="flex flex-col items-center justify-center p-6 text-center text-white/60 bg-black/40 rounded-xl border border-white/10 gap-2">
          <Film size={26} className="text-white/40 mb-0.5" />
          <span className="text-xs font-medium text-white/80">Video playback unavailable in browser</span>
          <a
            href={url}
            download={cleanName}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
          >
            <Download size={13} /> Download {cleanName}
          </a>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/90 shadow-md">
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            className="w-full max-h-[380px] object-contain rounded-xl block bg-black"
            onError={() => setHasError(true)}
            aria-label={`Video player: ${cleanName}`}
          />
        </div>
      )}
    </div>
  );
}

export function MessageAttachmentFiles({
  files,
  onPdf,
}: {
  files?: MessageFileItem[] | MessageFileItem | null;
  onPdf?: (pdf: { url: string; name: string }) => void;
}) {
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});

  const list = Array.isArray(files) ? files : files ? [files] : [];
  if (!list.length) return null;

  return (
    <>
      {list.map((f, idx) => {
        const fileKey = f.url || `${f.name}-${idx}`;
        const isSpoiler = isSpoilerFile(f);
        const isRevealed = Boolean(revealedSpoilers[fileKey]);

        if (isSpoiler && !isRevealed) {
          const isVideo = isVideoFile(f);
          const isAudio = isAudioFile(f);
          const cleanName = f.name.replace(/^spoiler[_-]/i, "");
          return (
            <button
              key={fileKey}
              type="button"
              className="message-file-card group relative cursor-pointer"
              onClick={() => setRevealedSpoilers((prev) => ({ ...prev, [fileKey]: true }))}
              title={`Click to reveal spoiler ${isVideo ? "video" : isAudio ? "audio" : "attachment"}`}
            >
              <span className="message-file-icon bg-amber-500/20 text-amber-300">
                <EyeOff size={14} />
              </span>
              <span>
                <strong className="text-amber-200">
                  {isVideo ? "Spoiler Video" : isAudio ? "Spoiler Audio" : "Spoiler Attachment"}
                </strong>
                <small>Hidden content · click to reveal {cleanName}</small>
              </span>
              <b aria-hidden="true" className="text-amber-300">Reveal</b>
            </button>
          );
        }

        // Big temporary files (over 40 MB) are a download with a countdown.
        const expiresAt = bigUploadExpiryFromUrl(f.url);
        if (expiresAt !== null) {
          const gone = expiresAt <= Date.now();
          const body = (
            <>
              <span className={`message-file-icon file-badge-${getFileBadgeColor(f.name)}`}>
                {getFileExtensionBadge(f.name)}
              </span>
              <span>
                <strong>{f.name}</strong>
                <small>
                  {gone ? "Deleted after 12 hours" : `Big file · ${describeBigUploadExpiry(expiresAt)}`}
                </small>
              </span>
              {!gone && <b aria-hidden="true">Download</b>}
            </>
          );
          return gone ? (
            <div key={fileKey} className="message-file-card" aria-disabled="true" style={{ opacity: 0.6 }}>
              {body}
            </div>
          ) : (
            <a key={fileKey} href={f.url} download={f.name} className="message-file-card" target="_blank" rel="noopener noreferrer">
              {body}
            </a>
          );
        }

        if (isVideoFile(f)) {
          return (
            <InlineVideoAttachment
              key={fileKey}
              url={f.url}
              name={f.name}
              isSpoiler={isSpoiler}
              onHideSpoiler={() => setRevealedSpoilers((prev) => ({ ...prev, [fileKey]: false }))}
            />
          );
        }

        if (isAudioFile(f)) {
          return <InlineAudioAttachment key={fileKey} url={f.url} name={f.name} />;
        }

        const isPdf = f.type === "pdf" || f.name.toLowerCase().endsWith(".pdf");
        const badge = getFileExtensionBadge(f.name);
        const colorClass = getFileBadgeColor(f.name);

        if (isPdf) {
          return (
            <button
              key={fileKey}
              type="button"
              className="message-file-card"
              onClick={() => onPdf?.({ url: f.url, name: f.name })}
            >
              <span className={`message-file-icon file-badge-${colorClass}`}>PDF</span>
              <span>
                <strong>{f.name}</strong>
                <small>PDF document · view and fill in Huddle</small>
              </span>
              <b aria-hidden="true">Open</b>
            </button>
          );
        }

        return (
          <a
            key={fileKey}
            href={f.url}
            download={f.name}
            className="message-file-card"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className={`message-file-icon file-badge-${colorClass}`}>{badge}</span>
            <span>
              <strong>{f.name}</strong>
              <small>{getFileDescription(f.name)}</small>
            </span>
            <b aria-hidden="true">Download</b>
          </a>
        );
      })}
    </>
  );
}
